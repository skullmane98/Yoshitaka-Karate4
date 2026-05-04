from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import base64
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import jwt
import bcrypt
import qrcode
import barcode
import certifi
from barcode.writer import ImageWriter

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
_mongo_kwargs = {"serverSelectionTimeoutMS": 10000}
# For Atlas (mongodb+srv://...), explicitly pass certifi's CA bundle.
# Railway's/Ubuntu's default CA bundle can be stale and causes TLSV1_ALERT_INTERNAL_ERROR.
if mongo_url.startswith("mongodb+srv://") or "mongodb.net" in mongo_url:
    _mongo_kwargs["tlsCAFile"] = certifi.where()
client = AsyncIOMotorClient(mongo_url, **_mongo_kwargs)
db = client[os.environ['DB_NAME']]

# Log boot-time info (password masked) so Railway runtime logs show what happened
_masked_mongo = mongo_url
if "@" in _masked_mongo and "://" in _masked_mongo:
    scheme, rest = _masked_mongo.split("://", 1)
    if "@" in rest:
        creds, host = rest.split("@", 1)
        if ":" in creds:
            user, _pw = creds.split(":", 1)
            _masked_mongo = f"{scheme}://{user}:****@{host}"
print(f"[boot] MONGO_URL = {_masked_mongo}", flush=True)
print(f"[boot] DB_NAME   = {os.environ.get('DB_NAME')}", flush=True)
print(f"[boot] PORT      = {os.environ.get('PORT', '(not set by Railway)')}", flush=True)
print(f"[boot] CORS_ORIGINS = {os.environ.get('CORS_ORIGINS')}", flush=True)

app = FastAPI(title="Yoshitaka Karate-Do CMS")
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
Role = Literal["super_admin", "admin", "student"]


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    phone: Optional[str] = None
    belt_rank: Optional[str] = None
    member_number: str
    active: bool = True
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    access_code: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    belt_rank: Optional[str] = None
    active: Optional[bool] = None
    email: Optional[EmailStr] = None
    role: Optional[Role] = None


class PasswordChangeRequest(BaseModel):
    new_password: str = Field(min_length=6)


class AccessCodeCreate(BaseModel):
    role: Role
    max_uses: int = 1
    note: Optional[str] = None


class AccessCodePublic(BaseModel):
    id: str
    code: str
    role: Role
    max_uses: int
    used_count: int
    note: Optional[str] = None
    created_by: str
    created_at: datetime
    active: bool


class PaymentCreate(BaseModel):
    user_id: str
    amount: float
    description: str
    due_date: Optional[datetime] = None
    status: Literal["due", "paid", "overdue"] = "due"


class PaymentUpdate(BaseModel):
    status: Optional[Literal["due", "paid", "overdue"]] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None


class PaymentPublic(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    amount: float
    description: str
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None
    status: str
    created_at: datetime


class CMSPageUpdate(BaseModel):
    title: str
    content: dict


class CMSPagePublic(BaseModel):
    slug: str
    title: str
    content: dict
    updated_at: datetime


# -----------------------------------------------------------------------------
# Auth Helpers
# -----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_to_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        role=u["role"],
        phone=u.get("phone"),
        belt_rank=u.get("belt_rank"),
        member_number=u["member_number"],
        active=u.get("active", True),
        created_at=datetime.fromisoformat(u["created_at"]) if isinstance(u["created_at"], str) else u["created_at"],
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("active", True):
            raise HTTPException(status_code=403, detail="Account disabled")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return user
    return checker


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def generate_member_number() -> str:
    # 10-digit numeric member number for barcode
    return "YK" + "".join(secrets.choice("0123456789") for _ in range(8))


def generate_access_code() -> str:
    # Human-friendly uppercase alphanumeric code
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2))


# -----------------------------------------------------------------------------
# Auth Endpoints
# -----------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    code_doc = await db.access_codes.find_one({"code": payload.access_code.upper(), "active": True})
    if not code_doc:
        raise HTTPException(status_code=400, detail="Invalid or inactive access code")
    if code_doc["used_count"] >= code_doc["max_uses"]:
        raise HTTPException(status_code=400, detail="Access code has been used")

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": code_doc["role"],
        "phone": payload.phone,
        "belt_rank": "White Belt" if code_doc["role"] == "student" else None,
        "member_number": generate_member_number(),
        "active": True,
        "created_at": now.isoformat(),
        "registered_with_code": code_doc["code"],
    }
    await db.users.insert_one(user_doc)
    await db.access_codes.update_one(
        {"id": code_doc["id"]},
        {"$inc": {"used_count": 1}, "$set": {"active": (code_doc["used_count"] + 1) < code_doc["max_uses"]}},
    )

    token = create_access_token(user_id, email, code_doc["role"])
    set_auth_cookie(response, token)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    pub = user_to_public(user_doc)
    return {**pub.model_dump(), "token": token}


@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    pub = user_to_public(user)
    return {**pub.model_dump(), "token": token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: dict):
    """Generate a password reset token. Always returns ok to avoid leaking which emails exist.
    The reset link is logged to the backend console."""
    email = (payload.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["id"],
            "email": email,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Log link to console (no email provider configured yet).
        frontend = os.environ.get("FRONTEND_URL", "")
        link = f"{frontend}/reset-password?token={token}" if frontend else f"/reset-password?token={token}"
        logger.info("=" * 60)
        logger.info(f"PASSWORD RESET LINK for {email}: {link}")
        logger.info(f"  Token: {token}")
        logger.info("=" * 60)
    return {"ok": True, "message": "If that email exists, a reset link has been issued."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: dict):
    token = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or ""
    if not token or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Invalid token or password too short")
    record = await db.password_reset_tokens.find_one({"token": token, "used": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or already-used token")
    if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token has expired")
    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": hash_password(new_password)}},
    )
    await db.password_reset_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


# -----------------------------------------------------------------------------
# User Management
# -----------------------------------------------------------------------------
@api_router.get("/users", response_model=List[UserPublic])
async def list_users(
    role: Optional[str] = None,
    current: dict = Depends(require_role("admin", "super_admin")),
):
    query = {}
    if role:
        query["role"] = role
    # Admins see only students; super_admin sees all
    if current["role"] == "admin":
        query["role"] = "student"
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [user_to_public(u) for u in users]


@api_router.get("/users/{user_id}", response_model=UserPublic)
async def get_user(user_id: str, current: dict = Depends(get_current_user)):
    # A user can access themselves; admin can access students; super_admin all
    if current["id"] != user_id:
        if current["role"] == "student":
            raise HTTPException(status_code=403, detail="Forbidden")
        target = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if current["role"] == "admin" and target["role"] != "student":
            raise HTTPException(status_code=403, detail="Forbidden")
        return user_to_public(target)
    return user_to_public(current)


@api_router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current: dict = Depends(get_current_user),
):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Permission rules
    if current["id"] == user_id:
        # Users can update their own name/phone only
        allowed = {"name", "phone"}
    elif current["role"] == "super_admin":
        allowed = {"name", "phone", "belt_rank", "active", "email", "role"}
    elif current["role"] == "admin":
        if target["role"] != "student":
            raise HTTPException(status_code=403, detail="Admins can only edit students")
        allowed = {"name", "phone", "belt_rank", "active"}
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k in allowed and v is not None}
    if "email" in update:
        update["email"] = update["email"].lower()
        other = await db.users.find_one({"email": update["email"], "id": {"$ne": user_id}})
        if other:
            raise HTTPException(status_code=400, detail="Email in use")
    if "role" in update and update["role"] != target["role"]:
        # Safety: prevent demoting the last super admin
        if target["role"] == "super_admin" and update["role"] != "super_admin":
            other_sa = await db.users.count_documents({"role": "super_admin", "active": True, "id": {"$ne": user_id}})
            if other_sa < 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last super admin")
        # Reset belt_rank when leaving student role; assign default when becoming student
        if update["role"] == "student" and not target.get("belt_rank"):
            update["belt_rank"] = "White Belt"
        elif update["role"] != "student":
            update["belt_rank"] = None
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
    refreshed = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return user_to_public(refreshed)


@api_router.post("/users/{user_id}/password")
async def change_password(
    user_id: str,
    payload: PasswordChangeRequest,
    current: dict = Depends(get_current_user),
):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current["id"] != user_id:
        if current["role"] == "super_admin":
            pass
        elif current["role"] == "admin" and target["role"] == "student":
            pass
        else:
            raise HTTPException(status_code=403, detail="Forbidden")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_role("super_admin"))):
    if current["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.payments.delete_many({"user_id": user_id})
    return {"ok": True}


# -----------------------------------------------------------------------------
# QR / Barcode
# -----------------------------------------------------------------------------
@api_router.get("/users/{user_id}/qrcode")
async def user_qrcode(user_id: str, current: dict = Depends(get_current_user)):
    if current["id"] != user_id and current["role"] == "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    payload = f"YOSHITAKA|{target['member_number']}|{target['id']}"
    qr_img = qrcode.make(payload)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    data = base64.b64encode(buf.getvalue()).decode("utf-8")

    # Barcode (Code128 is robust for alphanumeric member numbers)
    Code128 = barcode.get_barcode_class("code128")
    bc = Code128(target["member_number"], writer=ImageWriter())
    bc_buf = io.BytesIO()
    bc.write(bc_buf, options={"write_text": False, "module_height": 12, "module_width": 0.3, "quiet_zone": 2})
    bc_data = base64.b64encode(bc_buf.getvalue()).decode("utf-8")

    return {
        "member_number": target["member_number"],
        "qr_payload": payload,
        "qr_png": f"data:image/png;base64,{data}",
        "barcode_png": f"data:image/png;base64,{bc_data}",
    }


# -----------------------------------------------------------------------------
# Access Codes
# -----------------------------------------------------------------------------
@api_router.post("/access-codes", response_model=AccessCodePublic)
async def create_access_code(
    payload: AccessCodeCreate,
    current: dict = Depends(require_role("admin", "super_admin")),
):
    # Admins can only create student codes
    if current["role"] == "admin" and payload.role != "student":
        raise HTTPException(status_code=403, detail="Admins can only issue student access codes")
    doc = {
        "id": str(uuid.uuid4()),
        "code": generate_access_code(),
        "role": payload.role,
        "max_uses": max(1, payload.max_uses),
        "used_count": 0,
        "note": payload.note,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    await db.access_codes.insert_one(doc)
    doc.pop("_id", None)
    return AccessCodePublic(**{**doc, "created_at": datetime.fromisoformat(doc["created_at"])})


@api_router.get("/access-codes", response_model=List[AccessCodePublic])
async def list_access_codes(current: dict = Depends(require_role("admin", "super_admin"))):
    query = {}
    if current["role"] == "admin":
        query["role"] = "student"
    codes = await db.access_codes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [
        AccessCodePublic(**{**c, "created_at": datetime.fromisoformat(c["created_at"]) if isinstance(c["created_at"], str) else c["created_at"]})
        for c in codes
    ]


@api_router.delete("/access-codes/{code_id}")
async def deactivate_access_code(code_id: str, current: dict = Depends(require_role("admin", "super_admin"))):
    res = await db.access_codes.update_one({"id": code_id}, {"$set": {"active": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Access code not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Payments
# -----------------------------------------------------------------------------
async def _payment_to_public(p: dict) -> PaymentPublic:
    user = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "name": 1})
    return PaymentPublic(
        id=p["id"],
        user_id=p["user_id"],
        user_name=user["name"] if user else None,
        amount=p["amount"],
        description=p["description"],
        due_date=datetime.fromisoformat(p["due_date"]) if p.get("due_date") else None,
        paid_date=datetime.fromisoformat(p["paid_date"]) if p.get("paid_date") else None,
        status=p["status"],
        created_at=datetime.fromisoformat(p["created_at"]) if isinstance(p["created_at"], str) else p["created_at"],
    )


@api_router.post("/payments", response_model=PaymentPublic)
async def create_payment(payload: PaymentCreate, current: dict = Depends(require_role("admin", "super_admin"))):
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current["role"] == "admin" and user["role"] != "student":
        raise HTTPException(status_code=403, detail="Admins can only bill students")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": payload.user_id,
        "amount": float(payload.amount),
        "description": payload.description,
        "due_date": payload.due_date.isoformat() if payload.due_date else None,
        "paid_date": None,
        "status": payload.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current["id"],
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return await _payment_to_public(doc)


@api_router.get("/payments", response_model=List[PaymentPublic])
async def list_payments(
    user_id: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    query = {}
    if current["role"] == "student":
        query["user_id"] = current["id"]
    elif user_id:
        query["user_id"] = user_id
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [await _payment_to_public(p) for p in payments]


@api_router.patch("/payments/{payment_id}", response_model=PaymentPublic)
async def update_payment(
    payment_id: str,
    payload: PaymentUpdate,
    current: dict = Depends(require_role("admin", "super_admin")),
):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    update = {}
    data = payload.model_dump(exclude_unset=True)
    if "status" in data:
        update["status"] = data["status"]
        if data["status"] == "paid":
            update["paid_date"] = datetime.now(timezone.utc).isoformat()
        else:
            update["paid_date"] = None
    if "amount" in data:
        update["amount"] = float(data["amount"])
    if "description" in data:
        update["description"] = data["description"]
    if "due_date" in data and data["due_date"]:
        update["due_date"] = data["due_date"].isoformat()
    await db.payments.update_one({"id": payment_id}, {"$set": update})
    refreshed = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    return await _payment_to_public(refreshed)


@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, current: dict = Depends(require_role("admin", "super_admin"))):
    res = await db.payments.delete_one({"id": payment_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Email (SMTP) helper
# -----------------------------------------------------------------------------
import aiosmtplib
from email.message import EmailMessage


async def send_email(to_email: str, subject: str, html: str, text: str) -> dict:
    """Send email via SMTP. Falls back to console logging if SMTP is not configured.
    Returns {sent: bool, mode: 'smtp'|'console', detail: str}.
    """
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or "587")
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    sender = os.environ.get("SMTP_FROM", user or "no-reply@yoshitaka.com").strip()
    use_tls = (os.environ.get("SMTP_USE_TLS", "true").lower() == "true")
    use_ssl = (os.environ.get("SMTP_USE_SSL", "false").lower() == "true")

    if not host:
        # Console fallback
        logger.info("=" * 60)
        logger.info(f"EMAIL (no SMTP configured) -> {to_email}")
        logger.info(f"Subject: {subject}")
        logger.info(f"--- Body ---\n{text}")
        logger.info("=" * 60)
        return {"sent": True, "mode": "console", "detail": "Logged to backend console (configure SMTP_HOST/USER/PASSWORD/FROM env vars to send real emails)"}

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=user or None,
            password=password or None,
            start_tls=use_tls and not use_ssl,
            use_tls=use_ssl,
            timeout=15,
        )
        return {"sent": True, "mode": "smtp", "detail": f"Sent via {host}:{port}"}
    except Exception as e:
        logger.error(f"SMTP send failed to {to_email}: {e}")
        return {"sent": False, "mode": "smtp", "detail": f"SMTP error: {e}"}


def _payment_email_template(payment: dict, user: dict) -> tuple[str, str, str]:
    """Returns (subject, html, text) for a payment reminder."""
    amount = f"${payment['amount']:.2f}"
    due = "soon"
    if payment.get("due_date"):
        try:
            d = datetime.fromisoformat(payment["due_date"])
            due = d.strftime("%B %d, %Y")
        except Exception:
            pass
    overdue = payment.get("status") == "overdue"
    headline = "Payment Overdue" if overdue else "Payment Reminder"
    color = "#D7263D" if overdue else "#1A7A3D"
    subject = f"[Yoshitaka Karate-Do] {headline}: {payment['description']} — {amount}"
    text = (
        f"Hello {user['name']},\n\n"
        f"This is a friendly reminder that your account has an outstanding balance at Yoshitaka Karate-Do.\n\n"
        f"  Description: {payment['description']}\n"
        f"  Amount:      {amount}\n"
        f"  Due:         {due}\n"
        f"  Status:      {payment['status'].upper()}\n\n"
        f"Please complete this payment at your earliest convenience or contact the dojo if you have any questions.\n\n"
        f"Thank you,\nYoshitaka Karate-Do"
    )
    html = f"""
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FBFAF6;padding:32px;color:#0F0F0F;">
      <table align="center" width="560" style="background:#fff;border:1px solid #DCD9CF;border-collapse:collapse;">
        <tr><td style="padding:32px 32px 0 32px;">
          <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#4A4A4A;margin-bottom:8px;">Yoshitaka Karate-Do</div>
          <h1 style="font-family:Georgia,serif;font-weight:500;font-size:28px;margin:0 0 12px 0;color:#0F0F0F;">{headline}</h1>
          <div style="width:80px;height:2px;background:{color};margin-bottom:24px;"></div>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <p style="margin:0 0 16px 0;color:#0F0F0F;line-height:1.55;">Hello <strong>{user['name']}</strong>,</p>
          <p style="margin:0 0 24px 0;color:#4A4A4A;line-height:1.6;">This is a friendly reminder that your account has an outstanding balance at Yoshitaka Karate-Do.</p>
          <table width="100%" style="border-top:1px solid #DCD9CF;border-bottom:1px solid #DCD9CF;border-collapse:collapse;">
            <tr><td style="padding:14px 0;width:130px;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Description</td><td style="padding:14px 0;color:#0F0F0F;">{payment['description']}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Amount</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-family:monospace;color:#0F0F0F;font-size:18px;">{amount}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Due</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;color:#0F0F0F;">{due}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Status</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;"><span style="display:inline-block;padding:4px 10px;border:1px solid {color};color:{color};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">{payment['status']}</span></td></tr>
          </table>
          <p style="margin:24px 0;color:#4A4A4A;line-height:1.6;">Please complete this payment at your earliest convenience, or reach out to the dojo if you have any questions.</p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #DCD9CF;">
          <div style="font-size:11px;color:#4A4A4A;letter-spacing:0.1em;">Thank you,<br/><strong style="color:#0F0F0F;">Yoshitaka Karate-Do</strong></div>
        </td></tr>
      </table>
    </div>
    """
    return subject, html, text


@api_router.post("/payments/{payment_id}/remind")
async def send_payment_reminder(
    payment_id: str,
    current: dict = Depends(require_role("admin", "super_admin")),
):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Payment is already paid")
    user = await db.users.find_one({"id": p["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Payment user not found")

    subject, html, text = _payment_email_template(p, user)
    result = await send_email(user["email"], subject, html, text)

    # Record reminder
    await db.payments.update_one(
        {"id": payment_id},
        {"$push": {"reminders": {
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": current["id"],
            "to": user["email"],
            "mode": result["mode"],
            "ok": result["sent"],
        }}, "$set": {"last_reminder_at": datetime.now(timezone.utc).isoformat()}},
    )

    if not result["sent"]:
        raise HTTPException(status_code=500, detail=result["detail"])
    return {"ok": True, **result, "to": user["email"]}


# -----------------------------------------------------------------------------
# Attendance (USB scanner sign-in)
# -----------------------------------------------------------------------------
class AttendanceScanRequest(BaseModel):
    code: str
    note: Optional[str] = None


class AttendancePublic(BaseModel):
    id: str
    user_id: str
    user_name: str
    member_number: str
    role: str
    belt_rank: Optional[str] = None
    scanned_at: datetime
    method: str
    note: Optional[str] = None
    scanned_by: Optional[str] = None


def _parse_scan_code(raw: str) -> str:
    """Return the member_number contained in the scanned text.
    Accepts:
      - 'YOSHITAKA|MEMBER|UUID' (QR payload)
      - 'MEMBER' (barcode payload, e.g. 'YK12345678')
      - whitespace-padded variations
    """
    s = (raw or "").strip()
    if not s:
        return ""
    if s.upper().startswith("YOSHITAKA|"):
        parts = s.split("|")
        if len(parts) >= 2:
            return parts[1].strip()
    return s


@api_router.post("/attendance/scan", response_model=AttendancePublic)
async def attendance_scan(
    payload: AttendanceScanRequest,
    current: dict = Depends(require_role("admin", "super_admin")),
):
    member_number = _parse_scan_code(payload.code)
    if not member_number:
        raise HTTPException(status_code=400, detail="Empty scan")

    user = await db.users.find_one({"member_number": member_number}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail=f"No member found for {member_number}")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Member is inactive")

    method = "qr" if payload.code.upper().startswith("YOSHITAKA|") else "barcode"
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "member_number": user["member_number"],
        "role": user["role"],
        "belt_rank": user.get("belt_rank"),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "method": method,
        "note": payload.note,
        "scanned_by": current["id"],
    }
    await db.attendance.insert_one(rec)
    return AttendancePublic(
        id=rec["id"],
        user_id=rec["user_id"],
        user_name=rec["user_name"],
        member_number=rec["member_number"],
        role=rec["role"],
        belt_rank=rec.get("belt_rank"),
        scanned_at=datetime.fromisoformat(rec["scanned_at"]),
        method=rec["method"],
        note=rec.get("note"),
        scanned_by=rec.get("scanned_by"),
    )


@api_router.get("/attendance", response_model=List[AttendancePublic])
async def list_attendance(
    user_id: Optional[str] = None,
    days: Optional[int] = None,
    limit: int = 200,
    current: dict = Depends(get_current_user),
):
    query: dict = {}
    if current["role"] == "student":
        query["user_id"] = current["id"]
    elif user_id:
        query["user_id"] = user_id
    if days and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query["scanned_at"] = {"$gte": cutoff}

    rows = await db.attendance.find(query, {"_id": 0}).sort("scanned_at", -1).to_list(max(1, min(limit, 1000)))
    out = []
    for r in rows:
        out.append(AttendancePublic(
            id=r["id"],
            user_id=r["user_id"],
            user_name=r["user_name"],
            member_number=r["member_number"],
            role=r["role"],
            belt_rank=r.get("belt_rank"),
            scanned_at=datetime.fromisoformat(r["scanned_at"]) if isinstance(r["scanned_at"], str) else r["scanned_at"],
            method=r["method"],
            note=r.get("note"),
            scanned_by=r.get("scanned_by"),
        ))
    return out


@api_router.delete("/attendance/{rec_id}")
async def delete_attendance(rec_id: str, current: dict = Depends(require_role("admin", "super_admin"))):
    res = await db.attendance.delete_one({"id": rec_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# CMS Pages
# -----------------------------------------------------------------------------
DEFAULT_PAGES = {
    "home": {
        "title": "Yoshitaka Karate-Do",
        "content": {
            "tagline": "Traditional Shotokan Karate",
            "hero_headline": "Forge Character. Refine Spirit.",
            "hero_sub": "A dojo devoted to the enduring practice of Shotokan karate — where discipline shapes the body and kata shapes the soul.",
            "kanji": "義孝空手道",
            "intro": "Since our founding, Yoshitaka Karate-Do has cultivated a community of students who pursue mastery through patience, repetition, and respect. Every class is a return to the fundamentals — stance, breath, and intent.",
        },
    },
    "about": {
        "title": "About the Sensei",
        "content": {
            "sensei_name": "Sensei Yoshitaka",
            "sensei_bio": "With over three decades of unbroken practice in traditional Shotokan karate, Sensei Yoshitaka has trained under masters in Japan and now dedicates his dojo to preserving the lineage. His teaching emphasizes kihon (basics), kata (forms), and kumite (sparring) as interwoven studies — never ornamental, always essential.",
            "philosophy": "Karate begins and ends with respect. The true opponent is always the one we face in the mirror.",
            "rank": "7th Dan, Shotokan",
        },
    },
    "programs": {
        "title": "Programs",
        "content": {
            "programs": [
                {"name": "Little Samurai (Ages 5–8)", "desc": "Foundational movement, focus, and respect — taught through games, partner drills, and short kata."},
                {"name": "Youth Karate (Ages 9–14)", "desc": "Full traditional curriculum: kihon, kata, and controlled kumite. Belt advancement through the Shotokan ranking system."},
                {"name": "Adult Karate-Do", "desc": "Rigorous traditional practice for teenagers and adults. Emphasis on form, power, and meditative focus."},
                {"name": "Black Belt Society", "desc": "Advanced study group for dan-ranked practitioners. Deep kata analysis, bunkai, and weapons introduction."},
            ]
        },
    },
    "schedule": {
        "title": "Weekly Schedule",
        "content": {
            "classes": [
                {"day": "Monday", "time": "5:30 PM – 6:30 PM", "class": "Little Samurai"},
                {"day": "Monday", "time": "6:45 PM – 8:00 PM", "class": "Youth Karate"},
                {"day": "Tuesday", "time": "7:00 PM – 8:30 PM", "class": "Adult Karate-Do"},
                {"day": "Wednesday", "time": "5:30 PM – 6:30 PM", "class": "Little Samurai"},
                {"day": "Wednesday", "time": "6:45 PM – 8:00 PM", "class": "Youth Karate"},
                {"day": "Thursday", "time": "7:00 PM – 8:30 PM", "class": "Adult Karate-Do"},
                {"day": "Saturday", "time": "9:00 AM – 10:30 AM", "class": "All Belts Open Training"},
                {"day": "Saturday", "time": "10:45 AM – 12:00 PM", "class": "Black Belt Society"},
            ]
        },
    },
    "news": {
        "title": "News & Events",
        "content": {
            "posts": [
                {"date": "2026-01-15", "title": "Winter Belt Testing Results", "body": "Twenty-three students advanced to their next rank. Congratulations to our dedicated kohai."},
                {"date": "2025-12-02", "title": "Winter Seminar with Sensei Tanaka", "body": "A three-day intensive focused on Heian kata bunkai. Open to all ranks 5th kyu and above."},
                {"date": "2025-10-20", "title": "Autumn Tournament Recap", "body": "Our dojo brought home five medals from the regional invitational. Special recognition to the junior kata team."},
            ]
        },
    },
    "contact": {
        "title": "Contact",
        "content": {
            "address": "123 Dojo Lane, Your City",
            "phone": "(555) 123-4567",
            "email": "info@yoshitaka.com",
            "hours": "Monday–Saturday, see class schedule",
        },
    },
}


@api_router.get("/cms/pages", response_model=List[CMSPagePublic])
async def list_cms_pages():
    pages = await db.cms_pages.find({}, {"_id": 0}).to_list(100)
    return [
        CMSPagePublic(
            slug=p["slug"],
            title=p["title"],
            content=p["content"],
            updated_at=datetime.fromisoformat(p["updated_at"]) if isinstance(p["updated_at"], str) else p["updated_at"],
        )
        for p in pages
    ]


@api_router.get("/cms/pages/{slug}", response_model=CMSPagePublic)
async def get_cms_page(slug: str):
    p = await db.cms_pages.find_one({"slug": slug}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Page not found")
    return CMSPagePublic(
        slug=p["slug"],
        title=p["title"],
        content=p["content"],
        updated_at=datetime.fromisoformat(p["updated_at"]) if isinstance(p["updated_at"], str) else p["updated_at"],
    )


@api_router.put("/cms/pages/{slug}", response_model=CMSPagePublic)
async def update_cms_page(slug: str, payload: CMSPageUpdate, current: dict = Depends(require_role("super_admin"))):
    now = datetime.now(timezone.utc).isoformat()
    await db.cms_pages.update_one(
        {"slug": slug},
        {"$set": {"slug": slug, "title": payload.title, "content": payload.content, "updated_at": now}},
        upsert=True,
    )
    return CMSPagePublic(slug=slug, title=payload.title, content=payload.content, updated_at=datetime.fromisoformat(now))


# -----------------------------------------------------------------------------
# Dashboard stats
# -----------------------------------------------------------------------------
@api_router.get("/stats")
async def stats(current: dict = Depends(require_role("admin", "super_admin"))):
    user_filter = {} if current["role"] == "super_admin" else {"role": "student"}
    total_users = await db.users.count_documents(user_filter)
    total_students = await db.users.count_documents({"role": "student"})
    total_admins = await db.users.count_documents({"role": "admin"})

    # payments due total
    payments = await db.payments.find({"status": {"$in": ["due", "overdue"]}}, {"_id": 0, "amount": 1, "user_id": 1}).to_list(5000)
    if current["role"] == "admin":
        # only students' payments
        student_ids = {u["id"] for u in await db.users.find({"role": "student"}, {"_id": 0, "id": 1}).to_list(5000)}
        payments = [p for p in payments if p["user_id"] in student_ids]
    total_due = sum(p["amount"] for p in payments)
    return {
        "users": total_users,
        "students": total_students,
        "admins": total_admins,
        "payments_due_total": round(total_due, 2),
        "payments_due_count": len(payments),
    }


# -----------------------------------------------------------------------------
# Startup
# -----------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("member_number", unique=True)
    await db.access_codes.create_index("code", unique=True)
    await db.access_codes.create_index("id", unique=True)
    await db.payments.create_index("id", unique=True)
    await db.cms_pages.create_index("slug", unique=True)
    await db.attendance.create_index("id", unique=True)
    await db.attendance.create_index([("user_id", 1), ("scanned_at", -1)])

    # Seed super admin
    sa_email = os.environ.get("SUPER_ADMIN_EMAIL", "superadmin@yoshitaka.com").lower()
    sa_pass = os.environ.get("SUPER_ADMIN_PASSWORD", "SuperAdmin2026!")
    sa_name = os.environ.get("SUPER_ADMIN_NAME", "Super Administrator")
    existing = await db.users.find_one({"email": sa_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": sa_email,
            "password_hash": hash_password(sa_pass),
            "name": sa_name,
            "role": "super_admin",
            "phone": None,
            "belt_rank": None,
            "member_number": generate_member_number(),
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded super admin: {sa_email}")
    elif not verify_password(sa_pass, existing["password_hash"]):
        await db.users.update_one({"email": sa_email}, {"$set": {"password_hash": hash_password(sa_pass)}})

    # Seed one starter admin access code if no codes exist
    code_count = await db.access_codes.count_documents({})
    if code_count == 0:
        super_admin = await db.users.find_one({"email": sa_email}, {"_id": 0})
        admin_code = generate_access_code()
        student_code = generate_access_code()
        await db.access_codes.insert_many([
            {
                "id": str(uuid.uuid4()),
                "code": admin_code,
                "role": "admin",
                "max_uses": 3,
                "used_count": 0,
                "note": "Starter admin code",
                "created_by": super_admin["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "active": True,
            },
            {
                "id": str(uuid.uuid4()),
                "code": student_code,
                "role": "student",
                "max_uses": 10,
                "used_count": 0,
                "note": "Starter student code",
                "created_by": super_admin["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "active": True,
            },
        ])
        logger.info(f"Seeded starter access codes - admin: {admin_code}, student: {student_code}")

    # Seed default CMS pages
    for slug, page in DEFAULT_PAGES.items():
        existing_page = await db.cms_pages.find_one({"slug": slug})
        if not existing_page:
            await db.cms_pages.insert_one({
                "slug": slug,
                "title": page["title"],
                "content": page["content"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Include router
@api_router.get("/")
async def health_check():
    return {"status": "ok", "service": "yoshitaka-karatedo-cms"}


app.include_router(api_router)


_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins if _cors_origins != ['*'] else [],
    allow_origin_regex=r"https?://([a-z0-9-]+\.)*(preview\.)?emergentagent\.com|http://localhost(:\d+)?|https?://([a-z0-9-]+\.)*hostingersite\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)

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
from barcode.writer import ImageWriter

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import engine, get_session, init_db
from models import (
    AccessCode,
    Attendance,
    CMSPage,
    PasswordResetToken,
    Payment,
    PaymentReminder,
    User,
)

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mask DB URL for boot log
_db_url = os.environ["DATABASE_URL"]
_masked_db = _db_url
if "@" in _masked_db and "://" in _masked_db:
    scheme, rest = _masked_db.split("://", 1)
    if "@" in rest:
        creds, host = rest.split("@", 1)
        if ":" in creds:
            u, _p = creds.split(":", 1)
            _masked_db = f"{scheme}://{u}:****@{host}"
print(f"[boot] DATABASE_URL = {_masked_db}", flush=True)
print(f"[boot] PORT         = {os.environ.get('PORT', '(default)')}", flush=True)
print(f"[boot] CORS_ORIGINS  = {os.environ.get('CORS_ORIGINS')}", flush=True)

app = FastAPI(title="Yoshitaka Karate-Do CMS")
api_router = APIRouter(prefix="/api")


# Surface the real exception in Render logs (was silently returning 500).
@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception):
    import traceback
    logger.error(
        "UNHANDLED %s %s -> %s: %s\n%s",
        request.method, request.url.path, type(exc).__name__, exc, traceback.format_exc(),
    )
    # If the DB pool got into a bad state (e.g. Hostinger killed all idle connections),
    # dispose it so the next request rebuilds clean connections.
    msg = str(exc).lower()
    if "operationalerror" in type(exc).__name__.lower() or "lost connection" in msg or "gone away" in msg:
        try:
            from db import engine as _eng
            await _eng.dispose()
            logger.warning("Engine disposed after DB error — will reconnect on next request.")
        except Exception:
            pass
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

# -----------------------------------------------------------------------------
# Pydantic response / request models (HTTP layer, separate from ORM tables)
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
# Auth / Password Helpers
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


def _strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
    """MariaDB DATETIME columns cannot accept tz-aware datetimes; store as naive UTC."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Naive datetimes from DB are treated as UTC; attach tzinfo for API output."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def user_to_public(u: User) -> UserPublic:
    return UserPublic(
        id=u.id,
        email=u.email,
        name=u.name,
        role=u.role,
        phone=u.phone,
        belt_rank=u.belt_rank,
        member_number=u.member_number,
        active=u.active,
        created_at=_as_utc(u.created_at),
    )


async def _get_user_by_id(session: AsyncSession, user_id: str) -> Optional[User]:
    res = await session.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def _get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    res = await session.execute(select(User).where(User.email == email))
    return res.scalar_one_or_none()


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
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
        user = await _get_user_by_id(session, payload["sub"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.active:
            raise HTTPException(status_code=403, detail="Account disabled")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
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
    return "YK" + "".join(secrets.choice("0123456789") for _ in range(8))


def generate_access_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2))


# -----------------------------------------------------------------------------
# Auth Endpoints
# -----------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(
    payload: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    email = payload.email.lower()
    if await _get_user_by_email(session, email):
        raise HTTPException(status_code=400, detail="Email already registered")

    res = await session.execute(
        select(AccessCode).where(
            AccessCode.code == payload.access_code.upper(),
            AccessCode.active == True,  # noqa: E712
        )
    )
    code_doc = res.scalar_one_or_none()
    if not code_doc:
        raise HTTPException(status_code=400, detail="Invalid or inactive access code")
    if code_doc.used_count >= code_doc.max_uses:
        raise HTTPException(status_code=400, detail="Access code has been used")

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=code_doc.role,
        phone=payload.phone,
        belt_rank="White" if code_doc.role == "student" else None,
        member_number=generate_member_number(),
        active=True,
        registered_with_code=code_doc.code,
        created_at=_strip_tz(datetime.now(timezone.utc)),
    )
    session.add(user)

    code_doc.used_count += 1
    code_doc.active = code_doc.used_count < code_doc.max_uses
    session.add(code_doc)

    await session.commit()
    await session.refresh(user)

    token = create_access_token(user.id, user.email, user.role)
    set_auth_cookie(response, token)
    pub = user_to_public(user)
    return {**pub.model_dump(), "token": token}


@api_router.post("/auth/login")
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    email = payload.email.lower()
    user = await _get_user_by_email(session, email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(user.id, user.email, user.role)
    set_auth_cookie(response, token)
    pub = user_to_public(user)
    return {**pub.model_dump(), "token": token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: dict, session: AsyncSession = Depends(get_session)):
    email = (payload.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    user = await _get_user_by_email(session, email)
    if user:
        token = secrets.token_urlsafe(32)
        prt = PasswordResetToken(
            token=token,
            user_id=user.id,
            email=email,
            expires_at=_strip_tz(datetime.now(timezone.utc) + timedelta(hours=1)),
            used=False,
            created_at=_strip_tz(datetime.now(timezone.utc)),
        )
        session.add(prt)
        await session.commit()
        frontend = os.environ.get("FRONTEND_URL", "")
        link = f"{frontend}/reset-password?token={token}" if frontend else f"/reset-password?token={token}"
        logger.info("=" * 60)
        logger.info(f"PASSWORD RESET LINK for {email}: {link}")
        logger.info(f"  Token: {token}")
        logger.info("=" * 60)
    return {"ok": True, "message": "If that email exists, a reset link has been issued."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: dict, session: AsyncSession = Depends(get_session)):
    token = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or ""
    if not token or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Invalid token or password too short")
    res = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,  # noqa: E712
        )
    )
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or already-used token")
    if _as_utc(record.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token has expired")
    user = await _get_user_by_id(session, record.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    user.password_hash = hash_password(new_password)
    record.used = True
    record.used_at = _strip_tz(datetime.now(timezone.utc))
    session.add_all([user, record])
    await session.commit()
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return user_to_public(user)


# -----------------------------------------------------------------------------
# User Management
# -----------------------------------------------------------------------------
@api_router.get("/users", response_model=List[UserPublic])
async def list_users(
    role: Optional[str] = None,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(User)
    if current.role == "admin":
        stmt = stmt.where(User.role == "student")
    elif role:
        stmt = stmt.where(User.role == role)
    res = await session.execute(stmt)
    return [user_to_public(u) for u in res.scalars().all()]


@api_router.get("/users/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: str,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if current.id == user_id:
        return user_to_public(current)
    if current.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await _get_user_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current.role == "admin" and target.role != "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user_to_public(target)


@api_router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    target = await _get_user_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if current.id == user_id:
        allowed = {"name", "phone"}
    elif current.role == "super_admin":
        allowed = {"name", "phone", "belt_rank", "active", "email", "role"}
    elif current.role == "admin":
        if target.role != "student":
            raise HTTPException(status_code=403, detail="Admins can only edit students")
        allowed = {"name", "phone", "belt_rank", "active"}
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k in allowed and v is not None}

    if "email" in data:
        data["email"] = data["email"].lower()
        other_res = await session.execute(
            select(User).where(User.email == data["email"], User.id != user_id)
        )
        if other_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email in use")

    if "role" in data and data["role"] != target.role:
        if target.role == "super_admin" and data["role"] != "super_admin":
            count_res = await session.execute(
                select(func.count()).select_from(User).where(
                    User.role == "super_admin",
                    User.active == True,  # noqa: E712
                    User.id != user_id,
                )
            )
            if (count_res.scalar() or 0) < 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last super admin")
        if data["role"] == "student" and not target.belt_rank:
            data["belt_rank"] = "White"
        elif data["role"] != "student":
            data["belt_rank"] = None

    for k, v in data.items():
        setattr(target, k, v)
    session.add(target)
    await session.commit()
    await session.refresh(target)
    return user_to_public(target)


@api_router.post("/users/{user_id}/password")
async def change_password(
    user_id: str,
    payload: PasswordChangeRequest,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    target = await _get_user_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current.id != user_id:
        if current.role == "super_admin":
            pass
        elif current.role == "admin" and target.role == "student":
            pass
        else:
            raise HTTPException(status_code=403, detail="Forbidden")
    target.password_hash = hash_password(payload.new_password)
    session.add(target)
    await session.commit()
    return {"ok": True}


@api_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current: User = Depends(require_role("super_admin")),
    session: AsyncSession = Depends(get_session),
):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await _get_user_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Clean up payments + reminders owned by this user first
    pay_res = await session.execute(select(Payment.id).where(Payment.user_id == user_id))
    pay_ids = [row[0] for row in pay_res.all()]
    if pay_ids:
        await session.execute(
            delete(PaymentReminder).where(PaymentReminder.payment_id.in_(pay_ids))
        )
        await session.execute(delete(Payment).where(Payment.id.in_(pay_ids)))
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id))
    await session.execute(delete(Attendance).where(Attendance.user_id == user_id))
    await session.delete(target)
    await session.commit()
    return {"ok": True}


# -----------------------------------------------------------------------------
# QR / Barcode
# -----------------------------------------------------------------------------
@api_router.get("/users/{user_id}/qrcode")
async def user_qrcode(
    user_id: str,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if current.id != user_id and current.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await _get_user_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    payload = f"YOSHITAKA|{target.member_number}|{target.id}"
    qr_img = qrcode.make(payload)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    data = base64.b64encode(buf.getvalue()).decode("utf-8")

    Code128 = barcode.get_barcode_class("code128")
    bc = Code128(target.member_number, writer=ImageWriter())
    bc_buf = io.BytesIO()
    bc.write(bc_buf, options={"write_text": False, "module_height": 12, "module_width": 0.3, "quiet_zone": 2})
    bc_data = base64.b64encode(bc_buf.getvalue()).decode("utf-8")

    return {
        "member_number": target.member_number,
        "qr_payload": payload,
        "qr_png": f"data:image/png;base64,{data}",
        "barcode_png": f"data:image/png;base64,{bc_data}",
    }


# -----------------------------------------------------------------------------
# Access Codes
# -----------------------------------------------------------------------------
def _access_code_public(c: AccessCode) -> AccessCodePublic:
    return AccessCodePublic(
        id=c.id,
        code=c.code,
        role=c.role,
        max_uses=c.max_uses,
        used_count=c.used_count,
        note=c.note,
        created_by=c.created_by,
        created_at=_as_utc(c.created_at),
        active=c.active,
    )


@api_router.post("/access-codes", response_model=AccessCodePublic)
async def create_access_code(
    payload: AccessCodeCreate,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    if current.role == "admin" and payload.role != "student":
        raise HTTPException(status_code=403, detail="Admins can only issue student access codes")
    code = AccessCode(
        id=str(uuid.uuid4()),
        code=generate_access_code(),
        role=payload.role,
        max_uses=max(1, payload.max_uses),
        used_count=0,
        note=payload.note,
        created_by=current.id,
        created_at=_strip_tz(datetime.now(timezone.utc)),
        active=True,
    )
    session.add(code)
    await session.commit()
    await session.refresh(code)
    return _access_code_public(code)


@api_router.get("/access-codes", response_model=List[AccessCodePublic])
async def list_access_codes(
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AccessCode).order_by(AccessCode.created_at.desc())
    if current.role == "admin":
        stmt = stmt.where(AccessCode.role == "student")
    res = await session.execute(stmt)
    return [_access_code_public(c) for c in res.scalars().all()]


@api_router.delete("/access-codes/{code_id}")
async def deactivate_access_code(
    code_id: str,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(AccessCode).where(AccessCode.id == code_id))
    code = res.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=404, detail="Access code not found")
    code.active = False
    session.add(code)
    await session.commit()
    return {"ok": True}


# -----------------------------------------------------------------------------
# Payments
# -----------------------------------------------------------------------------
async def _payment_to_public(session: AsyncSession, p: Payment) -> PaymentPublic:
    user = await _get_user_by_id(session, p.user_id)
    return PaymentPublic(
        id=p.id,
        user_id=p.user_id,
        user_name=user.name if user else None,
        amount=p.amount,
        description=p.description,
        due_date=_as_utc(p.due_date),
        paid_date=_as_utc(p.paid_date),
        status=p.status,
        created_at=_as_utc(p.created_at),
    )


@api_router.post("/payments", response_model=PaymentPublic)
async def create_payment(
    payload: PaymentCreate,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    target = await _get_user_by_id(session, payload.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current.role == "admin" and target.role != "student":
        raise HTTPException(status_code=403, detail="Admins can only bill students")
    p = Payment(
        id=str(uuid.uuid4()),
        user_id=payload.user_id,
        amount=float(payload.amount),
        description=payload.description,
        due_date=_strip_tz(payload.due_date),
        paid_date=None,
        status=payload.status,
        created_by=current.id,
        created_at=_strip_tz(datetime.now(timezone.utc)),
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return await _payment_to_public(session, p)


@api_router.get("/payments", response_model=List[PaymentPublic])
async def list_payments(
    user_id: Optional[str] = None,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Payment).order_by(Payment.created_at.desc())
    if current.role == "student":
        stmt = stmt.where(Payment.user_id == current.id)
    elif user_id:
        stmt = stmt.where(Payment.user_id == user_id)
    res = await session.execute(stmt)
    payments = res.scalars().all()
    return [await _payment_to_public(session, p) for p in payments]


@api_router.patch("/payments/{payment_id}", response_model=PaymentPublic)
async def update_payment(
    payment_id: str,
    payload: PaymentUpdate,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(Payment).where(Payment.id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    data = payload.model_dump(exclude_unset=True)
    if "status" in data:
        p.status = data["status"]
        p.paid_date = _strip_tz(datetime.now(timezone.utc)) if data["status"] == "paid" else None
    if "amount" in data:
        p.amount = float(data["amount"])
    if "description" in data:
        p.description = data["description"]
    if "due_date" in data and data["due_date"]:
        p.due_date = _strip_tz(data["due_date"])
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return await _payment_to_public(session, p)


@api_router.delete("/payments/{payment_id}")
async def delete_payment(
    payment_id: str,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(Payment).where(Payment.id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    await session.execute(delete(PaymentReminder).where(PaymentReminder.payment_id == payment_id))
    await session.delete(p)
    await session.commit()
    return {"ok": True}


# -----------------------------------------------------------------------------
# Email (SMTP) helper
# -----------------------------------------------------------------------------
import aiosmtplib
from email.message import EmailMessage


async def send_email(to_email: str, subject: str, html: str, text: str) -> dict:
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or "587")
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    sender = os.environ.get("SMTP_FROM", user or "no-reply@yoshitaka.com").strip()
    use_tls = (os.environ.get("SMTP_USE_TLS", "true").lower() == "true")
    use_ssl = (os.environ.get("SMTP_USE_SSL", "false").lower() == "true")

    if not host:
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


def _payment_email_template(payment: Payment, user: User) -> tuple[str, str, str]:
    amount = f"${payment.amount:.2f}"
    due = "soon"
    if payment.due_date:
        try:
            d = _as_utc(payment.due_date)
            due = d.strftime("%B %d, %Y")
        except Exception:
            pass
    overdue = payment.status == "overdue"
    headline = "Payment Overdue" if overdue else "Payment Reminder"
    color = "#D7263D" if overdue else "#1A7A3D"
    subject = f"[Yoshitaka Karate-Do] {headline}: {payment.description} — {amount}"
    text = (
        f"Hello {user.name},\n\n"
        f"This is a friendly reminder that your account has an outstanding balance at Yoshitaka Karate-Do.\n\n"
        f"  Description: {payment.description}\n"
        f"  Amount:      {amount}\n"
        f"  Due:         {due}\n"
        f"  Status:      {payment.status.upper()}\n\n"
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
          <p style="margin:0 0 16px 0;color:#0F0F0F;line-height:1.55;">Hello <strong>{user.name}</strong>,</p>
          <p style="margin:0 0 24px 0;color:#4A4A4A;line-height:1.6;">This is a friendly reminder that your account has an outstanding balance at Yoshitaka Karate-Do.</p>
          <table width="100%" style="border-top:1px solid #DCD9CF;border-bottom:1px solid #DCD9CF;border-collapse:collapse;">
            <tr><td style="padding:14px 0;width:130px;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Description</td><td style="padding:14px 0;color:#0F0F0F;">{payment.description}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Amount</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-family:monospace;color:#0F0F0F;font-size:18px;">{amount}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Due</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;color:#0F0F0F;">{due}</td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #DCD9CF;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#4A4A4A;">Status</td><td style="padding:14px 0;border-top:1px solid #DCD9CF;"><span style="display:inline-block;padding:4px 10px;border:1px solid {color};color:{color};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">{payment.status}</span></td></tr>
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
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(Payment).where(Payment.id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status == "paid":
        raise HTTPException(status_code=400, detail="Payment is already paid")
    user = await _get_user_by_id(session, p.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Payment user not found")

    subject, html, text = _payment_email_template(p, user)
    result = await send_email(user.email, subject, html, text)

    reminder = PaymentReminder(
        id=str(uuid.uuid4()),
        payment_id=payment_id,
        sent_at=_strip_tz(datetime.now(timezone.utc)),
        sent_by=current.id,
        to_email=user.email,
        mode=result["mode"],
        ok=result["sent"],
    )
    p.last_reminder_at = _strip_tz(datetime.now(timezone.utc))
    session.add_all([reminder, p])
    await session.commit()

    if not result["sent"]:
        raise HTTPException(status_code=500, detail=result["detail"])
    return {"ok": True, **result, "to": user.email}


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
    s = (raw or "").strip()
    if not s:
        return ""
    if s.upper().startswith("YOSHITAKA|"):
        parts = s.split("|")
        if len(parts) >= 2:
            return parts[1].strip()
    return s


def _attendance_public(a: Attendance) -> AttendancePublic:
    return AttendancePublic(
        id=a.id,
        user_id=a.user_id,
        user_name=a.user_name,
        member_number=a.member_number,
        role=a.role,
        belt_rank=a.belt_rank,
        scanned_at=_as_utc(a.scanned_at),
        method=a.method,
        note=a.note,
        scanned_by=a.scanned_by,
    )


@api_router.post("/attendance/scan", response_model=AttendancePublic)
async def attendance_scan(
    payload: AttendanceScanRequest,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    member_number = _parse_scan_code(payload.code)
    if not member_number:
        raise HTTPException(status_code=400, detail="Empty scan")

    res = await session.execute(select(User).where(User.member_number == member_number))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No member found for {member_number}")
    if not user.active:
        raise HTTPException(status_code=403, detail="Member is inactive")

    method = "qr" if payload.code.upper().startswith("YOSHITAKA|") else "barcode"
    rec = Attendance(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_name=user.name,
        member_number=user.member_number,
        role=user.role,
        belt_rank=user.belt_rank,
        scanned_at=_strip_tz(datetime.now(timezone.utc)),
        method=method,
        note=payload.note,
        scanned_by=current.id,
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return _attendance_public(rec)


@api_router.get("/attendance", response_model=List[AttendancePublic])
async def list_attendance(
    user_id: Optional[str] = None,
    days: Optional[int] = None,
    limit: int = 200,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Attendance).order_by(Attendance.scanned_at.desc())
    if current.role == "student":
        stmt = stmt.where(Attendance.user_id == current.id)
    elif user_id:
        stmt = stmt.where(Attendance.user_id == user_id)
    if days and days > 0:
        cutoff = _strip_tz(datetime.now(timezone.utc) - timedelta(days=days))
        stmt = stmt.where(Attendance.scanned_at >= cutoff)
    stmt = stmt.limit(max(1, min(limit, 1000)))
    res = await session.execute(stmt)
    return [_attendance_public(a) for a in res.scalars().all()]


@api_router.delete("/attendance/{rec_id}")
async def delete_attendance(
    rec_id: str,
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(Attendance).where(Attendance.id == rec_id))
    a = res.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(a)
    await session.commit()
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
                {"day": "Monday", "time": "7:00 PM – 8:00 PM", "class": "Teen"},
                {"day": "Monday", "time": "8:00 PM – 9:00 PM", "class": "Adult"},
                {"day": "Tuesday", "time": "4:00 PM – 5:00 PM", "class": "Child"},
                {"day": "Wednesday", "time": "7:00 PM – 8:00 PM", "class": "Teen"},
                {"day": "Wednesday", "time": "8:00 PM – 9:00 PM", "class": "Adult"},
                {"day": "Thursday", "time": "4:00 PM – 5:00 PM", "class": "Child"},
                {"day": "Friday", "time": "7:00 PM – 8:00 PM", "class": "Teen"},
                {"day": "Friday", "time": "8:00 PM – 9:00 PM", "class": "Adult"},
                {"day": "Saturday", "time": "4:00 PM – 5:00 PM", "class": "Child"},
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
    "idcard": {
        "title": "Member ID Card",
        "content": {
            "dojo_name": "Yoshitaka Karate-Do",
            "certificate_title": "Member Certificate",
            "kanji_top": "空手道",
            "kanji_bottom": "義孝",
            "issued_text": "Issued · Yoshitaka Dojo",
            "scan_text": "Scan to verify",
            "footer_label": "Member No.",
            "rank_label": "Rank",
            "role_label": "Role",
            "name_label": "Member",
            "accent_color": "#D7263D",
            "logo_url": "",
            "background_url": "",
        },
    },
}


def _cms_public(p: CMSPage) -> CMSPagePublic:
    return CMSPagePublic(
        slug=p.slug,
        title=p.title,
        content=p.content,
        updated_at=_as_utc(p.updated_at),
    )


@api_router.get("/cms/pages", response_model=List[CMSPagePublic])
async def list_cms_pages(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(CMSPage))
    return [_cms_public(p) for p in res.scalars().all()]


@api_router.get("/cms/pages/{slug}", response_model=CMSPagePublic)
async def get_cms_page(slug: str, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(CMSPage).where(CMSPage.slug == slug))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Page not found")
    return _cms_public(p)


@api_router.put("/cms/pages/{slug}", response_model=CMSPagePublic)
async def update_cms_page(
    slug: str,
    payload: CMSPageUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # ID card design is a shared admin/super_admin concern.
    # All other public pages stay super_admin only.
    if slug == "idcard":
        if current.role not in ("admin", "super_admin"):
            raise HTTPException(status_code=403, detail="Insufficient privileges")
    else:
        if current.role != "super_admin":
            raise HTTPException(status_code=403, detail="Insufficient privileges")
    res = await session.execute(select(CMSPage).where(CMSPage.slug == slug))
    p = res.scalar_one_or_none()
    now = _strip_tz(datetime.now(timezone.utc))
    if p:
        p.title = payload.title
        p.content = payload.content
        p.updated_at = now
    else:
        p = CMSPage(slug=slug, title=payload.title, content=payload.content, updated_at=now)
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return _cms_public(p)


# -----------------------------------------------------------------------------
# Dashboard stats
# -----------------------------------------------------------------------------
@api_router.get("/stats")
async def stats(
    current: User = Depends(require_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
):
    if current.role == "super_admin":
        total_users_res = await session.execute(select(func.count()).select_from(User))
    else:
        total_users_res = await session.execute(
            select(func.count()).select_from(User).where(User.role == "student")
        )
    total_users = total_users_res.scalar() or 0

    total_students_res = await session.execute(
        select(func.count()).select_from(User).where(User.role == "student")
    )
    total_students = total_students_res.scalar() or 0

    total_admins_res = await session.execute(
        select(func.count()).select_from(User).where(User.role == "admin")
    )
    total_admins = total_admins_res.scalar() or 0

    pay_stmt = select(Payment).where(Payment.status.in_(["due", "overdue"]))
    if current.role == "admin":
        # Only student payments for admin view. Join via subquery on students' ids.
        students_res = await session.execute(select(User.id).where(User.role == "student"))
        student_ids = [row[0] for row in students_res.all()]
        if student_ids:
            pay_stmt = pay_stmt.where(Payment.user_id.in_(student_ids))
        else:
            pay_stmt = pay_stmt.where(Payment.user_id.in_([""]))  # no matches
    pay_res = await session.execute(pay_stmt)
    payments = pay_res.scalars().all()
    total_due = sum(p.amount for p in payments)
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
    await init_db()

    from db import async_session_factory

    async with async_session_factory() as session:
        # Seed super admin
        sa_email = os.environ.get("SUPER_ADMIN_EMAIL", "superadmin@yoshitaka.com").lower()
        sa_pass = os.environ.get("SUPER_ADMIN_PASSWORD", "SuperAdmin2026!")
        sa_name = os.environ.get("SUPER_ADMIN_NAME", "Super Administrator")
        existing = await _get_user_by_email(session, sa_email)
        if not existing:
            sa = User(
                id=str(uuid.uuid4()),
                email=sa_email,
                password_hash=hash_password(sa_pass),
                name=sa_name,
                role="super_admin",
                phone=None,
                belt_rank=None,
                member_number=generate_member_number(),
                active=True,
                created_at=_strip_tz(datetime.now(timezone.utc)),
            )
            session.add(sa)
            await session.commit()
            logger.info(f"Seeded super admin: {sa_email}")
            existing = sa
        elif not verify_password(sa_pass, existing.password_hash):
            existing.password_hash = hash_password(sa_pass)
            session.add(existing)
            await session.commit()

        # Seed starter access codes if none exist
        count_res = await session.execute(select(func.count()).select_from(AccessCode))
        if (count_res.scalar() or 0) == 0:
            admin_code = generate_access_code()
            student_code = generate_access_code()
            now = _strip_tz(datetime.now(timezone.utc))
            session.add_all([
                AccessCode(
                    id=str(uuid.uuid4()), code=admin_code, role="admin",
                    max_uses=3, used_count=0, note="Starter admin code",
                    created_by=existing.id, created_at=now, active=True,
                ),
                AccessCode(
                    id=str(uuid.uuid4()), code=student_code, role="student",
                    max_uses=10, used_count=0, note="Starter student code",
                    created_by=existing.id, created_at=now, active=True,
                ),
            ])
            await session.commit()
            logger.info(f"Seeded starter access codes - admin: {admin_code}, student: {student_code}")

        # Seed default CMS pages
        now = _strip_tz(datetime.now(timezone.utc))
        for slug, page in DEFAULT_PAGES.items():
            res = await session.execute(select(CMSPage).where(CMSPage.slug == slug))
            if not res.scalar_one_or_none():
                session.add(CMSPage(slug=slug, title=page["title"], content=page["content"], updated_at=now))
        await session.commit()


@app.on_event("shutdown")
async def shutdown_db():
    await engine.dispose()


@api_router.get("/")
async def health_check():
    return {"status": "ok", "service": "yoshitaka-karatedo-cms"}


app.include_router(api_router)

# Social sign-in (Google + Microsoft)
from oauth import oauth_router  # noqa: E402
app.include_router(oauth_router)


_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins if _cors_origins != ['*'] else [],
    allow_origin_regex=r"https?://([a-z0-9-]+\.)*(preview\.)?emergentagent\.com|http://localhost(:\d+)?|https?://([a-z0-9-]+\.)*hostingersite\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)

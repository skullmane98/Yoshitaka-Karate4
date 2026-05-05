"""OAuth 2.0 social sign-in (Google + Microsoft).

Flow:
  1. Frontend redirects user to /api/auth/{provider}/start
  2. Backend redirects to provider's authorize URL with state cookie
  3. Provider redirects back to /api/auth/{provider}/callback?code=...&state=...
  4. Backend exchanges code, fetches user info
     - Email already in DB    -> mint JWT, redirect to FRONTEND/oauth/done?token=...
     - Email NOT in DB        -> mint short-lived "pending" JWT (10 min) carrying
                                 (email, name, provider), redirect to
                                 FRONTEND/oauth/complete?pending=...
  5. New users complete registration with /api/auth/oauth/complete which requires
     a valid access_code. Existing access-code gating is preserved.

Required env vars (set on Render):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
  OAUTH_FRONTEND_URL    e.g. https://yoshitakakaratedo.com  (where to send the user back)

REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
"""
import os
import secrets as _secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models import AccessCode, User

oauth_router = APIRouter(prefix="/api/auth", tags=["oauth"])

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
PENDING_TOKEN_TTL_MIN = 10
SESSION_TOKEN_TTL_MIN = 60 * 24

# Provider config -------------------------------------------------------------
PROVIDERS = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
    },
    "microsoft": {
        # Common endpoint accepts both work and personal accounts.
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
        "scope": "openid email profile User.Read",
        "client_id_env": "MICROSOFT_CLIENT_ID",
        "client_secret_env": "MICROSOFT_CLIENT_SECRET",
    },
}


def _provider_cfg(provider: str) -> dict:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown OAuth provider: {provider}")
    cid = os.environ.get(cfg["client_id_env"], "").strip()
    csec = os.environ.get(cfg["client_secret_env"], "").strip()
    if not cid or not csec:
        raise HTTPException(
            status_code=503,
            detail=f"{provider.title()} OAuth is not configured. Set {cfg['client_id_env']} and {cfg['client_secret_env']} on the server.",
        )
    return {**cfg, "client_id": cid, "client_secret": csec}


def _backend_redirect_uri(request: Request, provider: str) -> str:
    """The URL the provider will redirect to after consent.

    REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
    Built dynamically from the incoming request so the SAME backend works on
    preview, Render, and any custom domain — provided each one is listed in the
    provider's authorized redirect URI list.
    """
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


def _frontend_url() -> str:
    url = os.environ.get("OAUTH_FRONTEND_URL", "").strip().rstrip("/")
    if not url:
        raise HTTPException(
            status_code=503,
            detail="OAUTH_FRONTEND_URL is not configured. Set it on the server (e.g. https://yoshitakakaratedo.com).",
        )
    return url


def _mint_session_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=SESSION_TOKEN_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _mint_pending_token(email: str, name: str, provider: str) -> str:
    payload = {
        "email": email.lower(),
        "name": name or email.split("@")[0],
        "provider": provider,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=PENDING_TOKEN_TTL_MIN),
        "type": "oauth_pending",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_pending_token(token: str) -> dict:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if data.get("type") != "oauth_pending":
            raise HTTPException(status_code=400, detail="Invalid token type")
        return data
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Sign-in window expired. Try again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid token")


# Endpoints ------------------------------------------------------------------
@oauth_router.get("/{provider}/start")
async def oauth_start(provider: str, request: Request):
    cfg = _provider_cfg(provider)
    state = _secrets.token_urlsafe(24)
    redirect_uri = _backend_redirect_uri(request, provider)
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    qs = "&".join(f"{k}={httpx.QueryParams({k: v})[k]}" for k, v in params.items())
    auth_url = f"{cfg['authorize_url']}?{qs}"
    response = RedirectResponse(auth_url, status_code=302)
    # Short-lived state cookie — verified in callback.
    response.set_cookie(
        key=f"oauth_state_{provider}",
        value=state,
        max_age=600,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return response


@oauth_router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    frontend = _frontend_url()
    if error:
        return RedirectResponse(f"{frontend}/login?oauth_error={error}", status_code=302)
    if not code or not state:
        return RedirectResponse(f"{frontend}/login?oauth_error=missing_params", status_code=302)

    expected_state = request.cookies.get(f"oauth_state_{provider}")
    if not expected_state or expected_state != state:
        return RedirectResponse(f"{frontend}/login?oauth_error=state_mismatch", status_code=302)

    cfg = _provider_cfg(provider)
    redirect_uri = _backend_redirect_uri(request, provider)

    # Exchange code for tokens.
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            cfg["token_url"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            return RedirectResponse(
                f"{frontend}/login?oauth_error=token_exchange_failed",
                status_code=302,
            )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(
                f"{frontend}/login?oauth_error=no_access_token",
                status_code=302,
            )

        # Fetch user info.
        ui_resp = await client.get(
            cfg["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if ui_resp.status_code != 200:
            return RedirectResponse(
                f"{frontend}/login?oauth_error=userinfo_failed",
                status_code=302,
            )
        ui = ui_resp.json()

    # Normalize the email + name across providers.
    email = (ui.get("email") or "").lower().strip()
    name = (ui.get("name") or ui.get("displayName") or "").strip()
    if not email:
        return RedirectResponse(f"{frontend}/login?oauth_error=no_email", status_code=302)

    # Check for existing user.
    existing_q = await session.execute(select(User).where(User.email == email))
    existing = existing_q.scalar_one_or_none()

    response: RedirectResponse
    if existing:
        if not existing.active:
            response = RedirectResponse(
                f"{frontend}/login?oauth_error=account_disabled",
                status_code=302,
            )
        else:
            token = _mint_session_token(existing.id, existing.email, existing.role)
            response = RedirectResponse(f"{frontend}/oauth/done?token={token}", status_code=302)
    else:
        # New user — must complete registration with an access code.
        pending = _mint_pending_token(email, name, provider)
        response = RedirectResponse(
            f"{frontend}/oauth/complete?pending={pending}",
            status_code=302,
        )

    # Clear state cookie.
    response.delete_cookie(f"oauth_state_{provider}", path="/")
    return response


# Complete-registration endpoint ---------------------------------------------
class OAuthCompleteRequest(BaseModel):
    pending: str
    access_code: str


@oauth_router.post("/oauth/complete")
async def oauth_complete(
    payload: OAuthCompleteRequest,
    session: AsyncSession = Depends(get_session),
):
    """Finish registration for a brand-new OAuth user, gated by an access code."""
    info = _decode_pending_token(payload.pending)
    email = info["email"]
    name = info["name"]

    # Email might've been claimed in another tab between OAuth + form submit.
    dup_q = await session.execute(select(User).where(User.email == email))
    if dup_q.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered. Please use Sign in instead.")

    # Validate access code.
    code_q = await session.execute(
        select(AccessCode).where(
            AccessCode.code == payload.access_code.upper(),
            AccessCode.active == True,  # noqa: E712
        )
    )
    code = code_q.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=400, detail="Invalid or inactive access code")
    if code.used_count >= code.max_uses:
        raise HTTPException(status_code=400, detail="Access code has been used")

    # Create user with no password (OAuth-only) — store a random non-usable hash.
    member_number = "YK" + "".join(_secrets.choice("0123456789") for _ in range(8))
    random_hash = "OAUTH_NO_PASSWORD:" + _secrets.token_urlsafe(16)
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=random_hash,
        name=name,
        role=code.role,
        phone=None,
        belt_rank="White" if code.role == "student" else None,
        member_number=member_number,
        active=True,
        registered_with_code=code.code,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(user)
    code.used_count += 1
    code.active = code.used_count < code.max_uses
    session.add(code)
    await session.commit()
    await session.refresh(user)

    token = _mint_session_token(user.id, user.email, user.role)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "member_number": user.member_number,
        "token": token,
    }


@oauth_router.get("/oauth/providers")
async def oauth_providers():
    """Tell the frontend which OAuth providers are configured (for hiding buttons)."""
    out = {}
    for name, cfg in PROVIDERS.items():
        out[name] = bool(
            os.environ.get(cfg["client_id_env"], "").strip()
            and os.environ.get(cfg["client_secret_env"], "").strip()
        )
    return out

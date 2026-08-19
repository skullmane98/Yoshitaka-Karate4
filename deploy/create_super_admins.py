"""One-shot script to seed two super_admin accounts + reset the password of
the existing `superadmin@yoshitaka.com` account.

Run this from the backend directory on the Hostinger VPS (same box where the
FastAPI service reads its DATABASE_URL from `/etc/yoshitaka-api.env`):

    cd /path/to/backend
    sudo -u yoshitaka /path/to/venv/bin/python /app/deploy/create_super_admins.py

Or from the preview environment:

    cd /app/backend && python /app/deploy/create_super_admins.py

It reuses the backend's own DB engine + models + password hasher so behaviour
matches the running app exactly.

Accounts created / updated:
  1. username = karate-yoshi1admin   role = super_admin
  2. username = karate-yoshi2admin   role = super_admin
  3. email    = superadmin@yoshitaka.com  → password reset only

Passwords are baked into the constants below — change them BEFORE running if
the defaults have already been distributed.
"""
import asyncio
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure `backend/` is on sys.path so we can import server helpers directly.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# Load environment: try the VPS systemd env file first, then backend/.env
# (preview / local dev). VPS uses `/etc/yoshitaka-api.env` (chmod 600); if the
# script is run outside systemd context it won't have those vars in os.environ
# yet, so we load them ourselves.
try:
    from dotenv import load_dotenv
    for candidate in ("/etc/yoshitaka-api.env", ROOT / "backend" / ".env"):
        p = Path(candidate)
        if p.exists():
            load_dotenv(p, override=False)
            print(f"[env]  loaded {p}")
            break
except ImportError:
    pass

from sqlmodel import select  # noqa: E402

from db import async_session_factory, init_db  # noqa: E402
from models import User  # noqa: E402
from server import hash_password, _generate_qr_code, generate_member_number  # noqa: E402


# ---------------------------------------------------------------------------
# Accounts to seed / update. Edit these BEFORE running if you want your own
# passwords instead of the auto-generated ones printed by the E1 agent.
# ---------------------------------------------------------------------------
ACCOUNTS = [
    {
        "username": "karate-yoshi1admin",
        "password": "eqlHlbFnV8vAq7jK",
        "name": "Karate Yoshi Admin 1",
        "role": "super_admin",
        "email": None,
    },
    {
        "username": "karate-yoshi2admin",
        "password": "MmSaLvapeZsMNk1p",
        "name": "Karate Yoshi Admin 2",
        "role": "super_admin",
        "email": None,
    },
]

# Reset the existing super_admin's password too.
EXISTING_SUPERADMIN_EMAIL = "superadmin@yoshitaka.com"
EXISTING_SUPERADMIN_NEW_PASSWORD = "RoBWaLhIN8wsUjZ6"


def _uuid() -> str:
    import uuid
    return str(uuid.uuid4())


async def _upsert_user(session, spec: dict) -> tuple[str, User]:
    """Insert or update a super_admin user by username. Returns (action, user)."""
    res = await session.execute(select(User).where(User.username == spec["username"]))
    existing = res.scalar_one_or_none()
    if existing:
        existing.password_hash = hash_password(spec["password"])
        existing.role = spec["role"]
        existing.name = spec["name"] or existing.name
        existing.active = True
        if spec.get("email"):
            existing.email = spec["email"]
        session.add(existing)
        return "updated", existing

    member_number = generate_member_number()
    user = User(
        id=_uuid(),
        email=spec.get("email"),
        username=spec["username"],
        password_hash=hash_password(spec["password"]),
        name=spec["name"],
        role=spec["role"],
        member_number=member_number,
        qr_code=_generate_qr_code(member_number),
        active=True,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(user)
    return "created", user


async def _reset_password_by_email(session, email: str, new_password: str) -> str:
    res = await session.execute(select(User).where(User.email == email.lower().strip()))
    user = res.scalar_one_or_none()
    if not user:
        return f"skip · {email} not found"
    user.password_hash = hash_password(new_password)
    user.active = True
    session.add(user)
    return f"reset · {email}"


async def main() -> None:
    # Ensure schema exists (safe if already migrated).
    await init_db()

    async with async_session_factory() as session:
        for spec in ACCOUNTS:
            action, user = await _upsert_user(session, spec)
            print(f"{action:>8}  {user.username:<25} role={user.role}  member#={user.member_number}")

        status = await _reset_password_by_email(
            session, EXISTING_SUPERADMIN_EMAIL, EXISTING_SUPERADMIN_NEW_PASSWORD,
        )
        print(f"          {status}")

        await session.commit()

    print("\nDone. Verify by logging in at your portal with:")
    for spec in ACCOUNTS:
        print(f"  {spec['username']:<25} / {spec['password']}")
    print(f"  {EXISTING_SUPERADMIN_EMAIL:<25} / {EXISTING_SUPERADMIN_NEW_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())

"""Async SQLAlchemy / SQLModel engine + session dependency.

DATABASE_URL formats supported:
  • mysql+aiomysql://user:pass@host:port/dbname  (production — Hostinger VPS)
  • sqlite+aiosqlite:///./yoshitaka.db           (preview / local dev fallback)

Pooling: MySQL on a Hostinger VPS sits on the same box as FastAPI, so we use a
small standard pool with `pool_pre_ping` to transparently recycle stale
connections after idle drops. Set `DB_USE_NULLPOOL=1` to fall back to NullPool
(useful for remote-MySQL deployments where idle-drop is aggressive).
"""
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

DATABASE_URL = os.environ["DATABASE_URL"]
IS_SQLITE = DATABASE_URL.startswith("sqlite")
USE_NULLPOOL = os.environ.get("DB_USE_NULLPOOL", "0") == "1"

if IS_SQLITE:
    # SQLite has no concept of connection pooling that fights asyncio.
    engine = create_async_engine(DATABASE_URL, echo=False)
elif USE_NULLPOOL:
    # Remote MySQL with aggressive idle-drop — open a fresh connection per request.
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )
else:
    # Local-socket / VPS MySQL: keep a small warm pool, pre-ping to handle
    # the rare idle drop without surfacing an error to the user.
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"connect_timeout": 10},
    )

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables if they don't exist + lightweight column migrations."""
    # Import models so SQLModel.metadata knows about them before create_all.
    from models import (  # noqa: F401
        User,
        AccessCode,
        Payment,
        PaymentReminder,
        Attendance,
        CMSPage,
        PasswordResetToken,
        RolePermission,
        UserPermissionOverride,
        Notification,
        BlogPost,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    # Add new columns to existing tables (idempotent — ignore "duplicate column")
    await _migrate_add_columns()


async def _migrate_add_columns() -> None:
    """Lightweight per-column migration for already-deployed databases.

    Adds new optional User columns without nuking existing data. Safe to run on
    every boot — duplicate-column errors are swallowed. Both MySQL and SQLite
    accept this `ALTER TABLE … ADD COLUMN` syntax; we just translate the JSON
    spec for SQLite which has no native JSON column type.
    """
    from sqlalchemy import text
    # MySQL column specs.
    mysql_additions = [
        ("users", "date_of_birth", "VARCHAR(32) NULL"),
        ("users", "address", "TEXT NULL"),
        ("users", "emergency_contact_name", "VARCHAR(255) NULL"),
        ("users", "emergency_contact_phone", "VARCHAR(64) NULL"),
        ("users", "medical_notes", "TEXT NULL"),
        ("users", "notes", "TEXT NULL"),
        ("users", "photo_url", "TEXT NULL"),
        ("users", "idcard_template", "VARCHAR(32) NULL"),
        ("users", "idcard_overrides", "JSON NULL"),
        ("users", "username", "VARCHAR(64) NULL"),
        ("users", "qr_code", "VARCHAR(64) NULL"),
    ]
    # SQLite equivalents (TEXT covers VARCHAR + JSON).
    sqlite_additions = [
        (t, c, "TEXT" if "JSON" in s or "VARCHAR" in s or "TEXT" in s else s.split()[0])
        for t, c, s in mysql_additions
    ]
    additions = sqlite_additions if IS_SQLITE else mysql_additions
    async with engine.begin() as conn:
        for table, col, spec in additions:
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {spec}"))
            except Exception:
                # Column likely already exists — ignore.
                pass
        # MySQL-only: existing photo_url columns were created as TEXT (~64 KB),
        # which silently truncates base64 data URLs >64 KB. Promote to LONGTEXT
        # so member photos survive a round-trip. SQLite TEXT is unlimited.
        if not IS_SQLITE:
            try:
                await conn.execute(text("ALTER TABLE users MODIFY photo_url LONGTEXT NULL"))
            except Exception:
                pass
        # Unique indexes (idempotent — duplicate errors ignored).
        # SQLite supports "IF NOT EXISTS"; MySQL doesn't, so we just swallow
        # the duplicate-index error there.
        if_not_exists = "IF NOT EXISTS " if IS_SQLITE else ""
        for stmt in (
            f"CREATE UNIQUE INDEX {if_not_exists}ix_users_username ON users (username)",
            f"CREATE UNIQUE INDEX {if_not_exists}ix_users_qr_code ON users (qr_code)",
        ):
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass

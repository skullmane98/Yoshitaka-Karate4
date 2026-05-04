"""Async SQLAlchemy / SQLModel engine + session dependency.

DATABASE_URL format (async):
  mysql+aiomysql://user:pass@host:port/dbname

Configured with NullPool to avoid the aiomysql "TCPTransport closed" bug, which
fires when a pooled connection survives across asyncio event loops (common on
Render free tier and any environment that may dispose the loop). NullPool opens
a fresh connection per request — slightly slower, fully reliable on Hostinger
shared MySQL.
"""
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
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
    """Create tables if they don't exist. For production, swap to Alembic migrations."""
    # Import models so SQLModel.metadata knows about them before create_all.
    from models import (  # noqa: F401
        User,
        AccessCode,
        Payment,
        PaymentReminder,
        Attendance,
        CMSPage,
        PasswordResetToken,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

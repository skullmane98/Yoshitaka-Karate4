"""SQLModel table definitions for Yoshitaka Karate-Do CMS.

All primary keys are UUID strings (varchar 36) to keep parity with the prior Mongo schema
and to let frontend continue using the existing `id` field without any changes.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column, DateTime, Text
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlmodel import Field, SQLModel


# Photo URLs are stored inline as base64 data URLs (no S3 yet). A typical
# member photo at 1 MB raw becomes ~1.4 MB once base64-encoded, which blows
# past MySQL's plain TEXT cap (~64 KB) and silently truncates the column.
# LONGTEXT (4 GB) gives us comfortable headroom; on SQLite the variant just
# falls back to TEXT which is unlimited anyway.
PhotoColumn = LONGTEXT().with_variant(Text(), "sqlite")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(primary_key=True, max_length=36)
    email: str = Field(index=True, unique=True, max_length=255)
    username: Optional[str] = Field(default=None, max_length=64, index=True, unique=True)
    password_hash: str = Field(max_length=255)
    name: str = Field(max_length=255)
    role: str = Field(max_length=32)  # super_admin | admin | renshi | sensei | team_member | student
    phone: Optional[str] = Field(default=None, max_length=64)
    belt_rank: Optional[str] = Field(default=None, max_length=64)
    member_number: str = Field(unique=True, max_length=32)
    qr_code: Optional[str] = Field(default=None, max_length=64, unique=True, index=True)
    active: bool = Field(default=True)
    registered_with_code: Optional[str] = Field(default=None, max_length=32)
    # Extended profile information (manually entered by admins)
    date_of_birth: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, sa_column=Column(Text))
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=64)
    medical_notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    photo_url: Optional[str] = Field(default=None, sa_column=Column(PhotoColumn))
    # Per-user ID card overrides (JSON of custom fields, template name)
    idcard_template: Optional[str] = Field(default=None, max_length=32)  # student | team_class | sensei
    idcard_overrides: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class AccessCode(SQLModel, table=True):
    __tablename__ = "access_codes"

    id: str = Field(primary_key=True, max_length=36)
    code: str = Field(unique=True, index=True, max_length=32)
    role: str = Field(max_length=32)
    max_uses: int = Field(default=1)
    used_count: int = Field(default=0)
    note: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: str = Field(max_length=36)
    active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class Payment(SQLModel, table=True):
    __tablename__ = "payments"

    id: str = Field(primary_key=True, max_length=36)
    user_id: str = Field(index=True, max_length=36)
    amount: float = Field()
    description: str = Field(sa_column=Column(Text))
    due_date: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=False))
    )
    paid_date: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=False))
    )
    status: str = Field(default="due", max_length=16)  # due | paid | overdue
    created_by: str = Field(max_length=36)
    last_reminder_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=False))
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class PaymentReminder(SQLModel, table=True):
    __tablename__ = "payment_reminders"

    id: str = Field(primary_key=True, max_length=36)
    payment_id: str = Field(index=True, max_length=36)
    sent_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    sent_by: str = Field(max_length=36)
    to_email: str = Field(max_length=255)
    mode: str = Field(max_length=16)  # smtp | console
    ok: bool = Field(default=True)


class Attendance(SQLModel, table=True):
    __tablename__ = "attendance"

    id: str = Field(primary_key=True, max_length=36)
    user_id: str = Field(index=True, max_length=36)
    user_name: str = Field(max_length=255)
    member_number: str = Field(max_length=32)
    role: str = Field(max_length=32)
    belt_rank: Optional[str] = Field(default=None, max_length=64)
    scanned_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False, index=True),
    )
    method: str = Field(max_length=16)  # qr | barcode
    note: Optional[str] = Field(default=None, sa_column=Column(Text))
    scanned_by: Optional[str] = Field(default=None, max_length=36)


class CMSPage(SQLModel, table=True):
    __tablename__ = "cms_pages"

    slug: str = Field(primary_key=True, max_length=64)
    title: str = Field(max_length=255)
    content: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    token: str = Field(primary_key=True, max_length=128)
    user_id: str = Field(max_length=36, index=True)
    email: str = Field(max_length=255)
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=False), nullable=False))
    used: bool = Field(default=False)
    used_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=False))
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------
class RolePermission(SQLModel, table=True):
    """Per-role overrides of the default permission set."""
    __tablename__ = "role_permissions"

    id: str = Field(primary_key=True, max_length=36)
    role: str = Field(index=True, max_length=32)
    permission_key: str = Field(max_length=64)
    allowed: bool = Field(default=True)


class UserPermissionOverride(SQLModel, table=True):
    """Per-user overrides on top of role defaults."""
    __tablename__ = "user_permission_overrides"

    id: str = Field(primary_key=True, max_length=36)
    user_id: str = Field(index=True, max_length=36)
    permission_key: str = Field(max_length=64)
    allowed: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: str = Field(primary_key=True, max_length=36)
    user_id: str = Field(index=True, max_length=36)  # recipient, or "" for broadcast
    sender_id: str = Field(max_length=36)
    sender_name: str = Field(max_length=255)
    title: str = Field(max_length=255)
    body: str = Field(sa_column=Column(Text))
    link: Optional[str] = Field(default=None, max_length=512)
    read: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False, index=True),
    )


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------
class BlogPost(SQLModel, table=True):
    __tablename__ = "blog_posts"

    id: str = Field(primary_key=True, max_length=36)
    slug: str = Field(unique=True, max_length=128, index=True)
    title: str = Field(max_length=255)
    excerpt: Optional[str] = Field(default=None, sa_column=Column(Text))
    body: str = Field(sa_column=Column(Text))  # rich-text / markdown
    cover_image: Optional[str] = Field(default=None, sa_column=Column(Text))  # base64 or URL
    images: list = Field(default_factory=list, sa_column=Column(JSON))  # extra inline images
    author_id: str = Field(max_length=36)
    author_name: str = Field(max_length=255)
    published: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False, index=True),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )

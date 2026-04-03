"""User notifications: pin + monthly purge cursor on user

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_notifications", sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("notification_inbox_last_purge_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "notification_inbox_last_purge_at")
    op.drop_column("user_notifications", "is_pinned")

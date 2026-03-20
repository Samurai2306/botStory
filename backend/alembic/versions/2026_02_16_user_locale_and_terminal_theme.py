"""User locale and terminal_theme

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("locale", sa.String(length=10), nullable=False, server_default="ru"))
    op.add_column("users", sa.Column("terminal_theme", sa.String(length=20), nullable=False, server_default="linux"))


def downgrade() -> None:
    op.drop_column("users", "terminal_theme")
    op.drop_column("users", "locale")


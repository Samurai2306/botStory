"""User profile: bio, tagline, profile_preferences JSON

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-03-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("tagline", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("profile_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_preferences")
    op.drop_column("users", "tagline")
    op.drop_column("users", "bio")

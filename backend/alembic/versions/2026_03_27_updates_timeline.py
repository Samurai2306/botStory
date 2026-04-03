"""Community updates timeline with customization JSON

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-03-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    update_status = sa.Enum("DRAFT", "PUBLISHED", "ARCHIVED", name="updatestatus")
    update_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "community_updates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("summary", sa.String(length=420), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=60), server_default="general", nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("DRAFT", "PUBLISHED", "ARCHIVED", name="updatestatus", create_type=False),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("is_published", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("timeline_events", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("theme_config", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("layout_blocks", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_community_updates_id"), "community_updates", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_community_updates_id"), table_name="community_updates")
    op.drop_table("community_updates")
    sa.Enum(name="updatestatus").drop(op.get_bind(), checkfirst=True)

"""Achievements, transferable titles, equipped titles, level_progress no-loop flag

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-03-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "level_progress",
        sa.Column("completed_ever_without_loops", sa.Boolean(), server_default="false", nullable=False),
    )

    op.create_table(
        "achievement_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon_key", sa.String(length=64), nullable=True),
        sa.Column("rarity", sa.String(length=32), nullable=True),
        sa.Column("trigger_type", sa.String(length=64), nullable=False),
        sa.Column("trigger_config", sa.JSON(), nullable=True),
        sa.Column("is_hidden", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_achievement_definitions_id"), "achievement_definitions", ["id"], unique=False)
    op.create_index("ix_achievement_definitions_slug", "achievement_definitions", ["slug"], unique=True)

    op.create_table(
        "user_achievements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("achievement_id", sa.Integer(), nullable=False),
        sa.Column("earned_at", sa.DateTime(), nullable=False),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievement_definitions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )
    op.create_index(op.f("ix_user_achievements_id"), "user_achievements", ["id"], unique=False)

    op.create_table(
        "title_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("holder_mode", sa.String(length=32), nullable=False),
        sa.Column("max_holders", sa.Integer(), server_default="1", nullable=False),
        sa.Column("leader_metric", sa.String(length=64), nullable=False),
        sa.Column("metric_config", sa.JSON(), nullable=True),
        sa.Column("icon_key", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_title_definitions_id"), "title_definitions", ["id"], unique=False)
    op.create_index("ix_title_definitions_slug", "title_definitions", ["slug"], unique=True)

    op.create_table(
        "title_holder_state",
        sa.Column("title_id", sa.Integer(), nullable=False),
        sa.Column("holder_user_id", sa.Integer(), nullable=True),
        sa.Column("since_at", sa.DateTime(), nullable=True),
        sa.Column("metric_value", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["holder_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["title_id"], ["title_definitions.id"]),
        sa.PrimaryKeyConstraint("title_id"),
    )

    op.create_table(
        "title_holder_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title_id", sa.Integer(), nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=True),
        sa.Column("to_user_id", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=True),
        sa.Column("metric_value", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["title_id"], ["title_definitions.id"]),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_title_holder_history_id"), "title_holder_history", ["id"], unique=False)

    op.create_table(
        "user_equipped_titles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("title_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["title_id"], ["title_definitions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "slot", name="uq_user_equipped_slot"),
        sa.UniqueConstraint("user_id", "title_id", name="uq_user_equipped_title"),
    )
    op.create_index(op.f("ix_user_equipped_titles_id"), "user_equipped_titles", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_equipped_titles_id"), table_name="user_equipped_titles")
    op.drop_table("user_equipped_titles")
    op.drop_index(op.f("ix_title_holder_history_id"), table_name="title_holder_history")
    op.drop_table("title_holder_history")
    op.drop_table("title_holder_state")
    op.drop_index("ix_title_definitions_slug", table_name="title_definitions")
    op.drop_index(op.f("ix_title_definitions_id"), table_name="title_definitions")
    op.drop_table("title_definitions")
    op.drop_index(op.f("ix_user_achievements_id"), table_name="user_achievements")
    op.drop_table("user_achievements")
    op.drop_index("ix_achievement_definitions_slug", table_name="achievement_definitions")
    op.drop_index(op.f("ix_achievement_definitions_id"), table_name="achievement_definitions")
    op.drop_table("achievement_definitions")
    op.drop_column("level_progress", "completed_ever_without_loops")

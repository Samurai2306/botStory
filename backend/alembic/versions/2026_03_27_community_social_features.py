"""Community social features: avatars, mentions, bookmarks, subscriptions, reputation

Revision ID: c1d2e3f4a5b6
Revises: b9c0d1e2f3a4
Create Date: 2026-03-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_key", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("reputation_score", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "community_mentions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("target_user_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_community_mentions_id"), "community_mentions", ["id"], unique=False)
    op.create_index(op.f("ix_community_mentions_target_user_id"), "community_mentions", ["target_user_id"], unique=False)

    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_notifications_id"), "user_notifications", ["id"], unique=False)
    op.create_index(op.f("ix_user_notifications_user_id"), "user_notifications", ["user_id"], unique=False)

    op.create_table(
        "community_post_bookmarks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["community_posts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "post_id", name="uq_post_bookmark_user_post"),
    )
    op.create_index(op.f("ix_community_post_bookmarks_id"), "community_post_bookmarks", ["id"], unique=False)

    op.create_table(
        "community_category_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "category", name="uq_category_subscription_user_category"),
    )
    op.create_index(op.f("ix_community_category_subscriptions_id"), "community_category_subscriptions", ["id"], unique=False)

    op.create_table(
        "community_reputation_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=30), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=30), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_community_reputation_events_id"), "community_reputation_events", ["id"], unique=False)
    op.create_index(op.f("ix_community_reputation_events_user_id"), "community_reputation_events", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_community_reputation_events_user_id"), table_name="community_reputation_events")
    op.drop_index(op.f("ix_community_reputation_events_id"), table_name="community_reputation_events")
    op.drop_table("community_reputation_events")

    op.drop_index(op.f("ix_community_category_subscriptions_id"), table_name="community_category_subscriptions")
    op.drop_table("community_category_subscriptions")

    op.drop_index(op.f("ix_community_post_bookmarks_id"), table_name="community_post_bookmarks")
    op.drop_table("community_post_bookmarks")

    op.drop_index(op.f("ix_user_notifications_user_id"), table_name="user_notifications")
    op.drop_index(op.f("ix_user_notifications_id"), table_name="user_notifications")
    op.drop_table("user_notifications")

    op.drop_index(op.f("ix_community_mentions_target_user_id"), table_name="community_mentions")
    op.drop_index(op.f("ix_community_mentions_id"), table_name="community_mentions")
    op.drop_table("community_mentions")

    op.drop_column("users", "reputation_score")
    op.drop_column("users", "avatar_key")


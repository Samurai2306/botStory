"""Community: posts, comments, likes

Revision ID: a1b2c3d4e5f6
Revises: 6a8b8c14e729
Create Date: 2026-02-18

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6a8b8c14e729'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'community_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('category', sa.Enum('DISCUSSION', 'QUESTION', 'IDEA', 'ANNOUNCEMENT', name='postcategory'), nullable=True),
        sa.Column('pinned', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_posts_id'), 'community_posts', ['id'], unique=False)
    op.create_index(op.f('ix_community_posts_author_id'), 'community_posts', ['author_id'], unique=False)

    op.create_table(
        'community_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['post_id'], ['community_posts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_comments_id'), 'community_comments', ['id'], unique=False)
    op.create_index(op.f('ix_community_comments_post_id'), 'community_comments', ['post_id'], unique=False)

    op.create_table(
        'community_post_likes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['post_id'], ['community_posts.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_post_likes_id'), 'community_post_likes', ['id'], unique=False)
    op.create_unique_constraint('uq_community_post_likes_user_post', 'community_post_likes', ['user_id', 'post_id'])


def downgrade() -> None:
    op.drop_constraint('uq_community_post_likes_user_post', 'community_post_likes', type_='unique')
    op.drop_index(op.f('ix_community_post_likes_id'), table_name='community_post_likes')
    op.drop_table('community_post_likes')
    op.drop_index(op.f('ix_community_comments_post_id'), table_name='community_comments')
    op.drop_index(op.f('ix_community_comments_id'), table_name='community_comments')
    op.drop_table('community_comments')
    op.drop_index(op.f('ix_community_posts_author_id'), table_name='community_posts')
    op.drop_index(op.f('ix_community_posts_id'), table_name='community_posts')
    op.drop_table('community_posts')
    op.execute("DROP TYPE postcategory")

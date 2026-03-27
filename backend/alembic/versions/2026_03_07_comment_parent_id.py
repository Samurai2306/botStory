"""Add parent_id to community_comments for replies

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('community_comments', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_community_comments_parent_id',
        'community_comments', 'community_comments',
        ['parent_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_community_comments_parent_id', 'community_comments', type_='foreignkey')
    op.drop_column('community_comments', 'parent_id')

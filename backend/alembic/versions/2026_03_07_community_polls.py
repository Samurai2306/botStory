"""Community polls (опросы/голосования)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'community_polls',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('closed', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_polls_id'), 'community_polls', ['id'], unique=False)
    op.create_index(op.f('ix_community_polls_author_id'), 'community_polls', ['author_id'], unique=False)

    op.create_table(
        'community_poll_options',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('poll_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=True, server_default='0'),
        sa.ForeignKeyConstraint(['poll_id'], ['community_polls.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_poll_options_id'), 'community_poll_options', ['id'], unique=False)
    op.create_index(op.f('ix_community_poll_options_poll_id'), 'community_poll_options', ['poll_id'], unique=False)

    op.create_table(
        'community_poll_votes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('poll_id', sa.Integer(), nullable=False),
        sa.Column('option_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['option_id'], ['community_poll_options.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['poll_id'], ['community_polls.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'poll_id', name='uq_poll_vote_user_poll')
    )
    op.create_index(op.f('ix_community_poll_votes_id'), 'community_poll_votes', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_community_poll_votes_id'), table_name='community_poll_votes')
    op.drop_table('community_poll_votes')
    op.drop_index(op.f('ix_community_poll_options_poll_id'), table_name='community_poll_options')
    op.drop_index(op.f('ix_community_poll_options_id'), table_name='community_poll_options')
    op.drop_table('community_poll_options')
    op.drop_index(op.f('ix_community_polls_author_id'), table_name='community_polls')
    op.drop_index(op.f('ix_community_polls_id'), table_name='community_polls')
    op.drop_table('community_polls')

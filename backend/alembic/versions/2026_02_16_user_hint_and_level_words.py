"""User hint_word and level_words table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-16

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('hint_word', sa.String(100), nullable=True))
    op.create_table(
        'level_words',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('level_id', sa.Integer(), nullable=False),
        sa.Column('words', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['level_id'], ['levels.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'level_id', name='uq_level_words_user_level')
    )
    op.create_index(op.f('ix_level_words_id'), 'level_words', ['id'], unique=False)
    op.create_index(op.f('ix_level_words_user_id'), 'level_words', ['user_id'], unique=False)
    op.create_index(op.f('ix_level_words_level_id'), 'level_words', ['level_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_level_words_level_id'), table_name='level_words')
    op.drop_index(op.f('ix_level_words_user_id'), table_name='level_words')
    op.drop_index(op.f('ix_level_words_id'), table_name='level_words')
    op.drop_table('level_words')
    op.drop_column('users', 'hint_word')

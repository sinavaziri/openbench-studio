"""Add additional performance indexes

Revision ID: f6g7h8i9j012
Revises: e5f6g7h8i901
Create Date: 2026-02-14 19:43:00.000000

Add simple indexes for common filter operations on runs table.
These complement the existing composite indexes for better query flexibility.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'f6g7h8i9j012'
down_revision: Union[str, None] = 'e5f6g7h8i902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
    return index_name in indexes


def upgrade() -> None:
    """Add performance indexes for filtering."""
    # Index on status for filtering by run status
    if not index_exists('runs', 'ix_runs_status'):
        op.create_index(
            'ix_runs_status',
            'runs',
            ['status'],
            unique=False,
        )

    # Index on benchmark for filtering by benchmark type
    if not index_exists('runs', 'ix_runs_benchmark'):
        op.create_index(
            'ix_runs_benchmark',
            'runs',
            ['benchmark'],
            unique=False,
        )

    # Index on model for filtering by model
    if not index_exists('runs', 'ix_runs_model'):
        op.create_index(
            'ix_runs_model',
            'runs',
            ['model'],
            unique=False,
        )


def downgrade() -> None:
    """Remove performance indexes."""
    if index_exists('runs', 'ix_runs_status'):
        op.drop_index('ix_runs_status', table_name='runs')
    if index_exists('runs', 'ix_runs_benchmark'):
        op.drop_index('ix_runs_benchmark', table_name='runs')
    if index_exists('runs', 'ix_runs_model'):
        op.drop_index('ix_runs_model', table_name='runs')

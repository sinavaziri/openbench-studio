"""add_performance_indexes

Revision ID: c3d4e5f6g789
Revises: b2c3d4e5f678
Create Date: 2026-02-14 17:30:00.000000

Add composite indexes for common query patterns to improve performance.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g789'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f678'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
    return index_name in indexes


def upgrade() -> None:
    """Add performance indexes."""
    # Composite index for common list_runs query (user_id + created_at for sorting)
    if not index_exists('runs', 'ix_runs_user_created'):
        op.create_index(
            'ix_runs_user_created', 
            'runs', 
            ['user_id', 'created_at'], 
            unique=False
        )
    
    # Index for created_at DESC (most common sort order)
    if not index_exists('runs', 'ix_runs_created_at_desc'):
        op.create_index(
            'ix_runs_created_at_desc', 
            'runs', 
            ['created_at'],
            unique=False,
            # SQLite doesn't support DESC in CREATE INDEX, but this still helps
        )
    
    # Composite index for filtering by status + created_at
    if not index_exists('runs', 'ix_runs_status_created'):
        op.create_index(
            'ix_runs_status_created', 
            'runs', 
            ['status', 'created_at'], 
            unique=False
        )
    
    # Composite index for filtering by benchmark + created_at
    if not index_exists('runs', 'ix_runs_benchmark_created'):
        op.create_index(
            'ix_runs_benchmark_created', 
            'runs', 
            ['benchmark', 'created_at'], 
            unique=False
        )


def downgrade() -> None:
    """Remove performance indexes."""
    if index_exists('runs', 'ix_runs_user_created'):
        op.drop_index('ix_runs_user_created', table_name='runs')
    if index_exists('runs', 'ix_runs_created_at_desc'):
        op.drop_index('ix_runs_created_at_desc', table_name='runs')
    if index_exists('runs', 'ix_runs_status_created'):
        op.drop_index('ix_runs_status_created', table_name='runs')
    if index_exists('runs', 'ix_runs_benchmark_created'):
        op.drop_index('ix_runs_benchmark_created', table_name='runs')

"""add_notes_column

Revision ID: b2c3d4e5f678
Revises: ae436ad4b481
Create Date: 2026-02-14 16:51:00.000000

Adds a notes column to the runs table for user notes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f678'
down_revision: Union[str, Sequence[str], None] = 'ae436ad4b481'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add notes column to runs table."""
    if not column_exists('runs', 'notes'):
        with op.batch_alter_table('runs') as batch_op:
            batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove notes column from runs table."""
    if column_exists('runs', 'notes'):
        with op.batch_alter_table('runs') as batch_op:
            batch_op.drop_column('notes')

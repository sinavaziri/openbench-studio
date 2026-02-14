"""add_run_templates

Revision ID: c3d4e5f6g789
Revises: b2c3d4e5f678
Create Date: 2026-02-14 17:30:00.000000

Adds run_templates table and template reference columns to runs table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6g7h890'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6g789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
    return index_name in indexes


def upgrade() -> None:
    """Upgrade schema - add run_templates table and template columns to runs."""
    # Create run_templates table if it doesn't exist
    if not table_exists('run_templates'):
        op.create_table(
            'run_templates',
            sa.Column('template_id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('benchmark', sa.String(), nullable=False),
            sa.Column('model', sa.String(), nullable=False),
            sa.Column('config_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
            sa.PrimaryKeyConstraint('template_id'),
        )
    
    # Add run_templates indexes
    if table_exists('run_templates'):
        if not index_exists('run_templates', 'ix_run_templates_user_id'):
            op.create_index('ix_run_templates_user_id', 'run_templates', ['user_id'], unique=False)
    
    # Add template_id and template_name columns to runs table
    if table_exists('runs'):
        with op.batch_alter_table('runs') as batch_op:
            if not column_exists('runs', 'template_id'):
                batch_op.add_column(sa.Column('template_id', sa.String(), nullable=True))
            if not column_exists('runs', 'template_name'):
                batch_op.add_column(sa.Column('template_name', sa.String(), nullable=True))
        
        # Add index for template_id
        if not index_exists('runs', 'ix_runs_template_id'):
            op.create_index('ix_runs_template_id', 'runs', ['template_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema - remove run_templates table and template columns from runs."""
    # Remove template columns from runs
    if table_exists('runs'):
        with op.batch_alter_table('runs') as batch_op:
            if column_exists('runs', 'template_id'):
                batch_op.drop_column('template_id')
            if column_exists('runs', 'template_name'):
                batch_op.drop_column('template_name')
    
    # Drop run_templates table
    if table_exists('run_templates'):
        op.drop_table('run_templates')

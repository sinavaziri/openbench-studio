"""initial_schema

Revision ID: ae436ad4b481
Revises: 
Create Date: 2026-02-14 15:10:42.279018

This migration establishes the baseline schema. For existing databases,
run `alembic stamp head` to mark this migration as applied without
executing it. For fresh databases, this creates all tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'ae436ad4b481'
down_revision: Union[str, Sequence[str], None] = None
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
    """Upgrade schema."""
    # Create users table if it doesn't exist
    if not table_exists('users'):
        op.create_table(
            'users',
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('hashed_password', sa.String(), nullable=False),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('is_active', sa.Integer(), nullable=False, server_default='1'),
            sa.PrimaryKeyConstraint('user_id'),
            sa.UniqueConstraint('email'),
        )
    
    # Add email index if it doesn't exist
    if table_exists('users') and not index_exists('users', 'ix_users_email'):
        op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # Create api_keys table if it doesn't exist
    if not table_exists('api_keys'):
        op.create_table(
            'api_keys',
            sa.Column('key_id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('provider', sa.String(), nullable=False),
            sa.Column('encrypted_key', sa.String(), nullable=False),
            sa.Column('key_preview', sa.String(), nullable=False),
            sa.Column('custom_env_var', sa.String(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
            sa.PrimaryKeyConstraint('key_id'),
            sa.UniqueConstraint('user_id', 'provider', name='uix_user_provider'),
        )
    else:
        # Add custom_env_var column if it doesn't exist (for existing databases)
        if not column_exists('api_keys', 'custom_env_var'):
            with op.batch_alter_table('api_keys') as batch_op:
                batch_op.add_column(sa.Column('custom_env_var', sa.String(), nullable=True))
    
    # Add api_keys indexes
    if table_exists('api_keys'):
        if not index_exists('api_keys', 'ix_api_keys_user_id'):
            op.create_index('ix_api_keys_user_id', 'api_keys', ['user_id'], unique=False)
        if not index_exists('api_keys', 'ix_api_keys_provider'):
            op.create_index('ix_api_keys_provider', 'api_keys', ['provider'], unique=False)
    
    # Create runs table if it doesn't exist
    if not table_exists('runs'):
        op.create_table(
            'runs',
            sa.Column('run_id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=True),
            sa.Column('benchmark', sa.String(), nullable=False),
            sa.Column('model', sa.String(), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default='queued'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('started_at', sa.String(), nullable=True),
            sa.Column('finished_at', sa.String(), nullable=True),
            sa.Column('artifact_dir', sa.String(), nullable=True),
            sa.Column('exit_code', sa.Integer(), nullable=True),
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('config_json', sa.Text(), nullable=True),
            sa.Column('primary_metric', sa.Float(), nullable=True),
            sa.Column('primary_metric_name', sa.String(), nullable=True),
            sa.Column('tags_json', sa.Text(), nullable=True, server_default='[]'),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
            sa.PrimaryKeyConstraint('run_id'),
        )
    else:
        # Add columns that might be missing in existing databases
        with op.batch_alter_table('runs') as batch_op:
            if not column_exists('runs', 'primary_metric'):
                batch_op.add_column(sa.Column('primary_metric', sa.Float(), nullable=True))
            if not column_exists('runs', 'primary_metric_name'):
                batch_op.add_column(sa.Column('primary_metric_name', sa.String(), nullable=True))
            if not column_exists('runs', 'user_id'):
                batch_op.add_column(sa.Column('user_id', sa.String(), nullable=True))
            if not column_exists('runs', 'tags_json'):
                batch_op.add_column(sa.Column('tags_json', sa.Text(), nullable=True, server_default='[]'))
    
    # Add runs indexes
    if table_exists('runs'):
        if not index_exists('runs', 'ix_runs_user_id'):
            op.create_index('ix_runs_user_id', 'runs', ['user_id'], unique=False)
        if not index_exists('runs', 'ix_runs_benchmark'):
            op.create_index('ix_runs_benchmark', 'runs', ['benchmark'], unique=False)
        if not index_exists('runs', 'ix_runs_model'):
            op.create_index('ix_runs_model', 'runs', ['model'], unique=False)
        if not index_exists('runs', 'ix_runs_status'):
            op.create_index('ix_runs_status', 'runs', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema - drops all tables."""
    op.drop_table('runs')
    op.drop_table('api_keys')
    op.drop_table('users')

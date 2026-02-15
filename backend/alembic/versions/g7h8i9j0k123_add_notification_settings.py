"""Add notification settings and webhook logs tables.

Revision ID: g7h8i9j0k123
Revises: f6g7h8i9j012
Create Date: 2026-02-14 19:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7h8i9j0k123'
down_revision: Union[str, None] = 'f6g7h8i9j012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create notification_settings table
    op.create_table(
        'notification_settings',
        sa.Column('settings_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('webhook_url', sa.String(), nullable=True),
        sa.Column('webhook_enabled', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notify_on_complete', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('notify_on_failure', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('settings_id'),
    )
    op.create_index('ix_notification_settings_user_id', 'notification_settings', ['user_id'], unique=True)

    # Create webhook_logs table
    op.create_table(
        'webhook_logs',
        sa.Column('log_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=True),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('webhook_url', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('payload_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('log_id'),
    )
    op.create_index('ix_webhook_logs_user_id', 'webhook_logs', ['user_id'], unique=False)
    op.create_index('ix_webhook_logs_run_id', 'webhook_logs', ['run_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_webhook_logs_run_id', table_name='webhook_logs')
    op.drop_index('ix_webhook_logs_user_id', table_name='webhook_logs')
    op.drop_table('webhook_logs')
    op.drop_index('ix_notification_settings_user_id', table_name='notification_settings')
    op.drop_table('notification_settings')

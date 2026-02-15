"""Add scheduled_for column to runs table

Revision ID: e5f6g7h8i902
Revises: e5f6g7h8i901
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6g7h8i902'
down_revision = 'e5f6g7h8i901'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add scheduled_for column to runs table
    op.add_column('runs', sa.Column('scheduled_for', sa.String(), nullable=True))
    
    # Create index for efficient querying of scheduled runs
    op.create_index('ix_runs_scheduled_for', 'runs', ['scheduled_for'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_runs_scheduled_for', table_name='runs')
    op.drop_column('runs', 'scheduled_for')

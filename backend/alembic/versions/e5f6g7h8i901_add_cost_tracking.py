"""Add cost tracking fields to runs

Revision ID: e5f6g7h8i901
Revises: d4e5f6g7h890
Create Date: 2024-02-14 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6g7h8i901'
down_revision: Union[str, None] = 'd4e5f6g7h890'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add cost tracking columns to runs table."""
    # Add input_tokens column
    op.add_column('runs', sa.Column('input_tokens', sa.Integer(), nullable=True))
    
    # Add output_tokens column
    op.add_column('runs', sa.Column('output_tokens', sa.Integer(), nullable=True))
    
    # Add total_tokens column
    op.add_column('runs', sa.Column('total_tokens', sa.Integer(), nullable=True))
    
    # Add estimated_cost column
    op.add_column('runs', sa.Column('estimated_cost', sa.Float(), nullable=True))


def downgrade() -> None:
    """Remove cost tracking columns from runs table."""
    op.drop_column('runs', 'estimated_cost')
    op.drop_column('runs', 'total_tokens')
    op.drop_column('runs', 'output_tokens')
    op.drop_column('runs', 'input_tokens')

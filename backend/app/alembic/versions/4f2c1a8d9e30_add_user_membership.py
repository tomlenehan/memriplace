"""Store subscription state supplied by a billing provider.

Revision ID: 4f2c1a8d9e30
Revises: d91e0a43b7c2
"""
import sqlalchemy as sa
from alembic import op

revision = "4f2c1a8d9e30"
down_revision = "d91e0a43b7c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usermembership",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_code", sa.String(length=32), nullable=False, server_default="plus"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("provider_customer_id", sa.String(length=128), nullable=True),
        sa.Column("provider_subscription_id", sa.String(length=128), nullable=True),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("provider_customer_id"),
        sa.UniqueConstraint("provider_subscription_id"),
    )
    op.create_index("ix_usermembership_user_id", "usermembership", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_usermembership_user_id", table_name="usermembership")
    op.drop_table("usermembership")

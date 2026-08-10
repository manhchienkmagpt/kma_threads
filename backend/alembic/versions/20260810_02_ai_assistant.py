"""Add per-user AI assistant preference.

Revision ID: 20260810_02
Revises: 20260810_01
"""

import sqlalchemy as sa

from alembic import op

revision = "20260810_02"
down_revision = "20260810_01"
branch_labels = None
depends_on = None


def has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {item["name"] for item in inspector.get_columns(table)}


def upgrade() -> None:
    if not has_column("users", "ai_assistant_enabled"):
        op.add_column(
            "users",
            sa.Column(
                "ai_assistant_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    if has_column("users", "ai_assistant_enabled"):
        op.drop_column("users", "ai_assistant_enabled")

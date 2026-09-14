"""Add encrypted per-user Google API keys and media ordering.

Revision ID: 20260914_03
Revises: 20260810_02
"""

import sqlalchemy as sa

from alembic import op

revision = "20260914_03"
down_revision = "20260810_02"
branch_labels = None
depends_on = None


def has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {item["name"] for item in inspector.get_columns(table)}


def upgrade() -> None:
    if not has_column("users", "google_api_key_encrypted"):
        op.add_column("users", sa.Column("google_api_key_encrypted", sa.Text(), nullable=True))
    if not has_column("media", "position"):
        op.add_column(
            "media",
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    if has_column("media", "position"):
        op.drop_column("media", "position")
    if has_column("users", "google_api_key_encrypted"):
        op.drop_column("users", "google_api_key_encrypted")

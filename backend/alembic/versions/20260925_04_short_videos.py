"""Add short video posts.

Revision ID: 20260925_04
Revises: 20260914_03
"""

import sqlalchemy as sa

from alembic import op

revision = "20260925_04"
down_revision = "20260914_03"
branch_labels = None
depends_on = None


def has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {item["name"] for item in inspector.get_columns(table)}


def upgrade() -> None:
    if not has_column("posts", "is_short"):
        op.add_column(
            "posts",
            sa.Column("is_short", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.create_index("ix_posts_is_short", "posts", ["is_short"])


def downgrade() -> None:
    if has_column("posts", "is_short"):
        op.drop_index("ix_posts_is_short", table_name="posts")
        op.drop_column("posts", "is_short")

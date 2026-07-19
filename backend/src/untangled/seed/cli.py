"""CLI entrypoint for ``make seed`` / ``python -m untangled.seed``."""

from __future__ import annotations

import argparse
import sys

from untangled.persistence.connection import connect, database_url
from untangled.seed import seed_users
from untangled.seed.users import SEED_USERS, password_for


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description=(
            "Idempotently seed local baseline users (admin, readonly, readwrite). "
            "Assumes schema is already migrated. Uses DATABASE_URL or the local default."
        ),
    )


def main(argv: list[str] | None = None) -> int:
    build_parser().parse_args(argv)
    print(f"seed: database={database_url()}")
    with connect() as conn:
        usernames = seed_users(conn)
    print(f"seed: upserted users: {', '.join(usernames)}")
    for seed in SEED_USERS:
        print(
            f"seed:   {seed.username}  "
            f"(intent={seed.intent}; "
            f"password from {seed.password_env} or default {password_for(seed)!r})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

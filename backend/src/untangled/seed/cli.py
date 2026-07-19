"""CLI entrypoint for ``make seed`` / ``python -m untangled.seed``."""

from __future__ import annotations

import argparse
import sys

from untangled.persistence.connection import connect, database_url
from untangled.seed import seed_all
from untangled.seed.rbac_catalog import SEED_ROLES, SEED_USER_ROLES
from untangled.seed.users import SEED_USERS, password_for


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description=(
            "Idempotently seed local baseline users and RBAC "
            "(roles, permissions, attachments). "
            "Assumes schema is already migrated. Uses DATABASE_URL or the local default."
        ),
    )


def main(argv: list[str] | None = None) -> int:
    build_parser().parse_args(argv)
    print(f"seed: database={database_url()}")
    with connect() as conn:
        summary = seed_all(conn)
    usernames = summary["users"]
    rbac = summary["rbac"]
    assert isinstance(usernames, list)
    assert isinstance(rbac, dict)
    print(f"seed: upserted users: {', '.join(usernames)}")
    for seed in SEED_USERS:
        print(
            f"seed:   {seed.username}  "
            f"(intent={seed.intent}; "
            f"password from {seed.password_env} or default {password_for(seed)!r})"
        )
    print(
        "seed: upserted RBAC: "
        f"roles={rbac['roles']}, permissions={rbac['permissions']}, "
        f"role_permissions={rbac['role_permissions']}, user_roles={rbac['user_roles']}"
    )
    role_by_id = {role.id: role.name for role in SEED_ROLES}
    user_by_id = {user.id: user.username for user in SEED_USERS}
    for link in SEED_USER_ROLES:
        print(
            f"seed:   {user_by_id[link.user_id]} → role {role_by_id[link.role_id]!r}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""CLI entrypoint for ``make migrate`` / ``python -m untangled.schema``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from untangled.persistence.connection import connect, database_url
from untangled.schema.migrate import DestructivePlanError, migrate


def _repo_root_from_package() -> Path:
    # backend/src/untangled/schema/cli.py → repo root is parents[4]
    return Path(__file__).resolve().parents[4]


def default_definitions_dir(repo_root: Path | None = None) -> Path:
    """Return the monorepo class-definitions directory."""
    root = repo_root or _repo_root_from_package()
    return root / "backend" / "class-definitions"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Reconcile PostgreSQL to YAML class definitions via diff-based migrate. "
            "Uses DATABASE_URL (or the documented local default)."
        ),
    )
    definitions = default_definitions_dir()
    parser.add_argument(
        "--definitions",
        type=Path,
        default=definitions,
        help=f"Directory of YAML class definitions (default: {definitions})",
    )
    parser.add_argument(
        "--allow-destructive",
        action="store_true",
        help=(
            "Apply plans that include destructive operations "
            "(drop table/column, type changes, etc.). Default: reject."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(f"migrate: database={database_url()}")
    print(f"migrate: definitions={args.definitions}")

    with connect() as conn:
        try:
            result = migrate(
                conn,
                args.definitions,
                allow_destructive=args.allow_destructive,
                progress=print,
            )
        except DestructivePlanError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    if result.applied:
        print(
            f"migrate: applied schema version {result.version_id} "
            f"({len(result.plan.ops)} op(s))"
        )
    else:
        print("migrate: database already matches definitions (no-op)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

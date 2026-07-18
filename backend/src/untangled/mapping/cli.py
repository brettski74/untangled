"""CLI entrypoint for ``make models`` / ``python -m untangled.mapping.cli``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from untangled.mapping.generate import generate_models


def _repo_root_from_package() -> Path:
    # backend/src/untangled/mapping/cli.py → repo root is parents[4]
    return Path(__file__).resolve().parents[4]


def default_paths(repo_root: Path | None = None) -> tuple[Path, Path, Path]:
    """Return (definitions_dir, pydantic_out, zod_out) for the monorepo layout."""
    root = repo_root or _repo_root_from_package()
    definitions = root / "backend" / "class-definitions"
    pydantic_out = root / "backend" / "src" / "untangled" / "generated"
    zod_out = root / "frontend" / "app" / "generated"
    return definitions, pydantic_out, zod_out


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate Pydantic and Zod models from YAML class definitions.",
    )
    definitions, pydantic_out, zod_out = default_paths()
    parser.add_argument(
        "--definitions",
        type=Path,
        default=definitions,
        help=f"Directory of YAML class definitions (default: {definitions})",
    )
    parser.add_argument(
        "--pydantic-out",
        type=Path,
        default=pydantic_out,
        help=f"Output directory for Pydantic modules (default: {pydantic_out})",
    )
    parser.add_argument(
        "--zod-out",
        type=Path,
        default=zod_out,
        help=f"Output directory for Zod modules (default: {zod_out})",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = generate_models(args.definitions, args.pydantic_out, args.zod_out)
    print(
        f"generated {len(result.definitions)} class(es): "
        f"{', '.join(d.name_kebab for d in result.definitions)}"
    )
    print(f"  pydantic → {args.pydantic_out}")
    print(f"  zod      → {args.zod_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

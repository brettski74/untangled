"""Unit tests for the migrate CLI (no live DB required)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from untangled.schema.cli import build_parser, default_definitions_dir, main
from untangled.schema.migrate import DestructivePlanError, MigrateResult
from untangled.schema.plan import DropTable, MigrationPlan


def test_default_definitions_dir_under_repo(repo_root: Path) -> None:
    assert default_definitions_dir(repo_root) == repo_root / "backend" / "class-definitions"


def test_parser_defaults_and_allow_destructive(repo_root: Path) -> None:
    parser = build_parser()
    args = parser.parse_args([])
    assert args.definitions == default_definitions_dir()
    assert args.allow_destructive is False

    allowed = parser.parse_args(["--allow-destructive", "--definitions", str(repo_root)])
    assert allowed.allow_destructive is True
    assert allowed.definitions == repo_root


def test_main_noop_success(tmp_path: Path) -> None:
    result = MigrateResult(
        definitions=(),
        desired=MagicMock(),
        plan=MigrationPlan(ops=()),
        applied=False,
        version_id=None,
        restore_point_name=None,
    )
    conn = MagicMock()
    with (
        patch("untangled.schema.cli.connect") as connect_mock,
        patch("untangled.schema.cli.migrate", return_value=result) as migrate_mock,
        patch("untangled.schema.cli.database_url", return_value="postgresql://test"),
    ):
        connect_mock.return_value.__enter__.return_value = conn
        connect_mock.return_value.__exit__.return_value = None
        code = main(["--definitions", str(tmp_path)])

    assert code == 0
    migrate_mock.assert_called_once()
    kwargs = migrate_mock.call_args.kwargs
    assert kwargs["allow_destructive"] is False
    assert kwargs["progress"] is print


def test_main_applied_success(tmp_path: Path) -> None:
    result = MigrateResult(
        definitions=(),
        desired=MagicMock(),
        plan=MigrationPlan(ops=(DropTable(table_name="demo_item"),)),
        applied=True,
        version_id=3,
        restore_point_name="untangled_schema_v3",
    )
    conn = MagicMock()
    with (
        patch("untangled.schema.cli.connect") as connect_mock,
        patch("untangled.schema.cli.migrate", return_value=result),
        patch("untangled.schema.cli.database_url", return_value="postgresql://test"),
    ):
        connect_mock.return_value.__enter__.return_value = conn
        connect_mock.return_value.__exit__.return_value = None
        code = main(["--definitions", str(tmp_path), "--allow-destructive"])

    assert code == 0


def test_main_destructive_refusal_exits_nonzero(tmp_path: Path) -> None:
    plan = MigrationPlan(ops=(DropTable(table_name="demo_item"),))
    conn = MagicMock()
    with (
        patch("untangled.schema.cli.connect") as connect_mock,
        patch(
            "untangled.schema.cli.migrate",
            side_effect=DestructivePlanError(plan),
        ),
        patch("untangled.schema.cli.database_url", return_value="postgresql://test"),
    ):
        connect_mock.return_value.__enter__.return_value = conn
        connect_mock.return_value.__exit__.return_value = None
        code = main(["--definitions", str(tmp_path)])

    assert code == 1

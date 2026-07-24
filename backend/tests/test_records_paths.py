"""Path resolution for class-definitions and generated models (Compose vs src)."""

from __future__ import annotations

from pathlib import Path

import pytest

from untangled.records import deps


@pytest.fixture(autouse=True)
def _clear_path_caches() -> None:
    deps.ensure_generated_package.cache_clear()
    deps._definitions_by_kebab.cache_clear()
    yield
    deps.ensure_generated_package.cache_clear()
    deps._definitions_by_kebab.cache_clear()


def test_definitions_dir_prefers_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "from-env"
    target.mkdir()
    monkeypatch.setenv(deps.DEFINITIONS_DIR_ENV, str(target))
    assert deps.resolve_definitions_dir() == target.resolve()


def test_definitions_dir_source_tree_layout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(deps.DEFINITIONS_DIR_ENV, raising=False)
    backend = tmp_path / "backend"
    records = backend / "src" / "untangled" / "records"
    records.mkdir(parents=True)
    defs = backend / "class-definitions"
    defs.mkdir()
    fake_deps = records / "deps.py"
    fake_deps.write_text("# stub\n", encoding="utf-8")
    cwd_other = tmp_path / "elsewhere"
    cwd_other.mkdir()
    (cwd_other / "class-definitions").mkdir()
    resolved = deps.resolve_definitions_dir(records_file=fake_deps, cwd=cwd_other)
    assert resolved == defs.resolve()


def test_definitions_dir_falls_back_to_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(deps.DEFINITIONS_DIR_ENV, raising=False)
    defs = tmp_path / "class-definitions"
    defs.mkdir()
    # site-packages-like path: no src/untangled/records layout
    installed = tmp_path / "site-packages" / "untangled" / "records" / "deps.py"
    installed.parent.mkdir(parents=True)
    installed.write_text("# stub\n", encoding="utf-8")
    resolved = deps.resolve_definitions_dir(records_file=installed, cwd=tmp_path)
    assert resolved == defs.resolve()


def test_definitions_dir_missing_raises(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(deps.DEFINITIONS_DIR_ENV, raising=False)
    installed = tmp_path / "site-packages" / "untangled" / "records" / "deps.py"
    installed.parent.mkdir(parents=True)
    installed.write_text("# stub\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match=deps.DEFINITIONS_DIR_ENV):
        deps.resolve_definitions_dir(records_file=installed, cwd=tmp_path)


def test_pydantic_out_under_package_root(tmp_path: Path) -> None:
    pkg = tmp_path / "untangled"
    pkg.mkdir()
    assert deps.resolve_pydantic_out(package_root=pkg) == pkg / "generated"


def test_ensure_generated_noop_when_create_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "generated"
    out.mkdir()
    (out / "incident.py").write_text("class IncidentCreate:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(deps, "resolve_pydantic_out", lambda: out)
    calls: list[tuple[Path, Path, Path]] = []

    def _boom(definitions: Path, pydantic_out: Path, zod_out: Path) -> None:
        calls.append((definitions, pydantic_out, zod_out))

    monkeypatch.setattr(deps, "generate_models", _boom)
    deps.ensure_generated_package()
    assert calls == []


def test_ensure_generated_regens_from_source_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, repo_definitions: Path
) -> None:
    out = tmp_path / "generated"
    out.mkdir()
    (out / "incident.py").write_text("class Incident:\n    pass\n", encoding="utf-8")
    monkeypatch.setattr(deps, "resolve_pydantic_out", lambda: out)
    monkeypatch.setattr(deps, "resolve_definitions_dir", lambda: repo_definitions)
    monkeypatch.setattr(
        deps,
        "_source_tree_definitions",
        lambda records_file=None: repo_definitions,
    )
    deps.ensure_generated_package()
    text = (out / "incident.py").read_text(encoding="utf-8")
    assert "class IncidentCreate" in text


def test_ensure_generated_fail_fast_without_source_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "generated"
    out.mkdir()
    monkeypatch.setattr(deps, "resolve_pydantic_out", lambda: out)
    monkeypatch.setattr(deps, "_source_tree_definitions", lambda records_file=None: None)
    with pytest.raises(RuntimeError, match="missing Create/Update"):
        deps.ensure_generated_package()

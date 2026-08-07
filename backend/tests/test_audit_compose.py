"""Static checks that Compose / env ship the audit log volume (AC9)."""

from __future__ import annotations

import re
from pathlib import Path


def test_compose_ships_audit_volume_mount(repo_root: Path) -> None:
    compose = (repo_root / "compose.yaml").read_text(encoding="utf-8")
    assert "UNTANGLED_AUDIT_LOG_DIR" in compose
    assert "untangled_audit:/var/log/untangled/audit" in compose
    assert re.search(r"(?m)^  untangled_audit:\s*$", compose), (
        "named volume untangled_audit must be declared under top-level volumes"
    )


def test_env_example_documents_audit_log_dir(repo_root: Path) -> None:
    example = (repo_root / ".env.example").read_text(encoding="utf-8")
    assert "UNTANGLED_AUDIT_LOG_DIR=/var/log/untangled/audit" in example
    assert "untangled_audit" in example


def test_local_dev_docs_cover_audit_sink(repo_root: Path) -> None:
    docs = (repo_root / "docs" / "local-development.md").read_text(encoding="utf-8")
    assert "untangled_audit" in docs
    assert "UNTANGLED_AUDIT_LOG_DIR" in docs
    assert "does not prune" in docs.lower() or "does **not** prune" in docs.lower()
    assert "#67" in docs or "67" in docs

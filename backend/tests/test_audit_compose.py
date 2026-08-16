"""Static checks that Compose / env ship the audit log volume (AC9)."""

from __future__ import annotations

import re
from pathlib import Path


def test_compose_ships_audit_volume_mount(repo_root: Path) -> None:
    compose = (repo_root / "compose.yaml").read_text(encoding="utf-8")
    assert "UNTANGLED_AUDIT_LOG_DIR" in compose
    assert compose.count("${UNTANGLED_AUDIT_MOUNT:-untangled_audit}:/var/log/untangled/audit") == 2
    assert re.search(r"(?m)^  untangled_audit:\s*$", compose), (
        "named volume untangled_audit must be declared under top-level volumes"
    )


def test_env_example_documents_audit_log_dir(repo_root: Path) -> None:
    example = (repo_root / ".env.example").read_text(encoding="utf-8")
    assert "UNTANGLED_AUDIT_LOG_DIR=/var/log/untangled/audit" in example
    assert "untangled_audit" in example
    assert ".run/audit" in example


def test_local_dev_docs_cover_audit_sink(repo_root: Path) -> None:
    docs = (repo_root / "docs" / "local-development.md").read_text(encoding="utf-8")
    assert "untangled_audit" in docs
    assert "UNTANGLED_AUDIT_LOG_DIR" in docs
    assert "does not prune" in docs.lower() or "does **not** prune" in docs.lower()
    assert "#67" in docs or "67" in docs
    # Wording regression only — not evidence of multi-replica sink behaviour.
    assert "multiple API replicas" in docs
    assert ".run/audit" in docs
    assert "make up" in docs
    assert "named volume" in docs.lower()
    assert "bind" in docs.lower()


def test_make_up_bind_mounts_run_audit(repo_root: Path) -> None:
    makefile = (repo_root / "Makefile").read_text(encoding="utf-8")
    assert "UNTANGLED_AUDIT_MOUNT=./$(RUN_DIR)/audit" in makefile
    up_start = makefile.index("\nup:")
    up_body = makefile[up_start : makefile.index("\ndown:")]
    assert "mkdir -p $(RUN_DIR)/audit" in up_body
    assert "chown" not in up_body


def test_deploy_preps_named_audit_volume_before_up(repo_root: Path) -> None:
    deploy = (repo_root / "deploy.sh").read_text(encoding="utf-8")
    match = re.search(r"^compose\(\) \{.*?^\}", deploy, re.S | re.M)
    assert match is not None
    compose_fn = match.group(0)
    assert "UNTANGLED_AUDIT_MOUNT=" in compose_fn
    assert "COMPOSE_PROFILES=" in compose_fn

    prep_at = deploy.index("step: prepare audit volume")
    up_at = deploy.index("step: up stack")
    assert prep_at < up_at

    prep = deploy[prep_at:up_at]
    assert "--rm" in prep
    assert "--user 0" in prep
    assert "--entrypoint" in prep
    assert "mkdir -p /var/log/untangled/audit" in prep
    assert "chown 1000:1000 /var/log/untangled/audit" in prep
    assert "chown -R" not in prep
    assert "chmod 0775 /var/log/untangled/audit" in prep
    assert "dist/main.js" not in prep
    assert "node dist" not in prep
    assert "[audit-prep]" in prep

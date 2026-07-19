"""Behavioural tests for the generate pipeline (no golden file comparisons)."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from untangled.mapping.generate import generate_models
from untangled.mapping.system_fields import SYSTEM_FIELD_NAMES


def _load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _valid_demo_payload() -> dict:
    return {
        "id": "01901234-5678-7abc-89ab-cdef01234567",
        "created_at": datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 18, 12, 30, tzinfo=timezone.utc),
        "created_by": "01901234-5678-7abc-89ab-cdef01234568",
        "updated_by": "01901234-5678-7abc-89ab-cdef01234569",
        "title": "Widget",
        "summary": "A sample row",
        "is_active": True,
        "quantity": 3,
        "unit_price": 1.5,
        "fixed_amount": Decimal("19.99"),
        "due_at": datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc),
    }


def test_generate_demo_pydantic_accepts_and_rejects(
    repo_definitions: Path, tmp_path: Path
) -> None:
    pydantic_out = tmp_path / "pydantic"
    zod_out = tmp_path / "zod"
    result = generate_models(repo_definitions, pydantic_out, zod_out)
    assert {d.name_snake for d in result.definitions} == {
        "demo_item",
        "demo_link",
        "permission",
        "refresh_token",
        "role",
        "role_permission",
        "user",
        "user_role",
    }
    assert (pydantic_out / "demo_item.py").is_file()
    assert (pydantic_out / "demo_link.py").is_file()
    assert (pydantic_out / "user.py").is_file()
    assert (pydantic_out / "role.py").is_file()
    assert (pydantic_out / "permission.py").is_file()
    assert (zod_out / "demo_item.ts").is_file()
    assert (zod_out / "demo_link.ts").is_file()
    assert (zod_out / "user.ts").is_file()
    assert (zod_out / "role.ts").is_file()
    assert (zod_out / "permission.ts").is_file()

    module = _load_module(pydantic_out / "demo_item.py", "generated_demo_item")
    demo_item = module.DemoItem
    assert "Demo Item" in (demo_item.__doc__ or "")
    assert "fixture class" in (demo_item.__doc__ or "").lower()

    model = demo_item.model_validate(_valid_demo_payload())
    assert model.title == "Widget"
    assert model.summary == "A sample row"
    assert model.quantity == 3
    assert model.fixed_amount == Decimal("19.99")
    assert model.created_at.tzinfo is not None
    assert model.created_at.utcoffset() == timedelta(0)
    for name in SYSTEM_FIELD_NAMES:
        assert hasattr(model, name)

    with pytest.raises(ValidationError):
        demo_item.model_validate({**_valid_demo_payload(), "title": None})

    with pytest.raises(ValidationError):
        demo_item.model_validate({**_valid_demo_payload(), "quantity": "nope"})

    naive = {
        **_valid_demo_payload(),
        "created_at": datetime(2026, 7, 18, 12, 0),
    }
    with pytest.raises(ValidationError):
        demo_item.model_validate(naive)

    offset = {
        **_valid_demo_payload(),
        "created_at": datetime(
            2026, 7, 18, 8, 0, tzinfo=timezone(timedelta(hours=-4))
        ),
    }
    normalized = demo_item.model_validate(offset)
    assert normalized.created_at == datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def test_generate_demo_zod_accepts_and_rejects(
    repo_definitions: Path, tmp_path: Path, repo_root: Path
) -> None:
    pydantic_out = tmp_path / "pydantic"
    zod_out = tmp_path / "zod"
    generate_models(repo_definitions, pydantic_out, zod_out)

    zod_pkg = repo_root / "frontend" / "node_modules" / "zod"
    assert zod_pkg.is_dir(), "frontend zod dependency missing; run make frontend-install"

    helper = repo_root / "backend" / "tests" / "helpers" / "zod_validate.mjs"
    env = {
        **os.environ,
        "NODE_PATH": str(repo_root / "frontend" / "node_modules"),
    }

    valid = {
        "id": "01901234-5678-7abc-89ab-cdef01234567",
        "created_at": "2026-07-18T12:00:00Z",
        "updated_at": "2026-07-18T12:30:00+00:00",
        "created_by": "01901234-5678-7abc-89ab-cdef01234568",
        "updated_by": "01901234-5678-7abc-89ab-cdef01234569",
        "title": "Widget",
        "summary": "A sample row",
        "is_active": True,
        "quantity": 3,
        "unit_price": 1.5,
        "fixed_amount": "19.99",
        "due_at": "2026-08-01T00:00:00Z",
    }
    invalid = {**valid, "quantity": "nope"}

    def run_case(payload: dict) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "node",
                str(helper),
                str(zod_out / "demo_item.ts"),
                "DemoItemSchema",
                json.dumps(payload),
            ],
            cwd=str(repo_root / "frontend"),
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )

    ok = run_case(valid)
    assert ok.returncode == 0, ok.stdout + ok.stderr
    assert json.loads(ok.stdout)["ok"] is True

    bad = run_case(invalid)
    assert bad.returncode != 0
    assert json.loads(bad.stdout)["ok"] is False

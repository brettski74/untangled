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
from untangled.seed.users import SEED_ADMIN_ID


def _load_module_from_source(path: Path, module_name: str, source: str):
    path.write_text(source, encoding="utf-8")
    return _load_module(path, module_name)


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
        "change_request",
        "demo_item",
        "demo_link",
        "incident",
        "permission",
        "refresh_token",
        "role",
        "role_permission",
        "system_config",
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
    assert result.field_meta_path.is_file()
    assert result.field_meta_path.name == "field_meta.ts"
    field_meta = result.field_meta_path.read_text(encoding="utf-8")
    assert "CLASS_FIELD_META" in field_meta
    assert '"incident"' in field_meta
    # YAML / IR order for Incident: number is first; meta must not reorder.
    assert 'friendly_id_attr: "number"' in field_meta
    number_pos = field_meta.index('name_snake: "number"')
    summary_pos = field_meta.index('name_snake: "summary"')
    assigned_pos = field_meta.index('name_snake: "assigned_user_id"')
    assert number_pos < summary_pos < assigned_pos
    assert 'references: "user"' in field_meta
    assert 'type_name: "text"' in field_meta
    assert 'type_name: "status"' in field_meta
    assert "create_default: " in field_meta
    assert 'create_default: "new"' in field_meta
    assert 'create_default: "draft"' in field_meta
    assert f'create_default: "{SEED_ADMIN_ID}"' in field_meta
    # order indices match array position for Incident attributes.
    assert "order: 0" in field_meta
    assert "order: 1" in field_meta

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

    fractional = {
        **_valid_demo_payload(),
        "created_at": datetime(2026, 7, 18, 12, 0, 0, 600_000, tzinfo=timezone.utc),
        "due_at": datetime(2026, 8, 1, 0, 0, 0, 400_000, tzinfo=timezone.utc),
    }
    rounded = demo_item.model_validate(fractional)
    assert rounded.created_at == datetime(2026, 7, 18, 12, 0, 1, tzinfo=timezone.utc)
    assert rounded.due_at == datetime(2026, 8, 1, 0, 0, 0, tzinfo=timezone.utc)
    dumped = json.loads(rounded.model_dump_json())
    assert dumped["created_at"] == "2026-07-18T12:00:01Z"
    assert dumped["due_at"] == "2026-08-01T00:00:00Z"
    assert "." not in dumped["created_at"]
    assert "." not in dumped["due_at"]


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

    fractional = {
        **valid,
        "created_at": "2026-07-18T12:00:00.600Z",
        "due_at": "2026-08-01T00:00:00.400Z",
    }
    frac_ok = run_case(fractional)
    assert frac_ok.returncode == 0, frac_ok.stdout + frac_ok.stderr
    assert json.loads(frac_ok.stdout)["ok"] is True
    # Transform normalizes; re-parse via helper only reports ok — assert emit source.
    zod_src = (zod_out / "demo_item.ts").read_text(encoding="utf-8")
    assert "toSecondPrecisionUtcIso" in zod_src
    assert ".transform(toSecondPrecisionUtcIso)" in zod_src

    bad = run_case(invalid)
    assert bad.returncode != 0
    assert json.loads(bad.stdout)["ok"] is False


def test_field_meta_order_and_create_defaults(
    repo_definitions: Path, tmp_path: Path
) -> None:
    from untangled.mapping.definition import load_definitions
    from untangled.mapping.emit_field_meta import emit_field_meta_module

    definitions = load_definitions(repo_definitions)
    source = emit_field_meta_module(definitions)
    incident = next(d for d in definitions if d.name_kebab == "incident")
    assert [a.name_snake for a in incident.attributes][:4] == [
        "number",
        "summary",
        "description",
        "status",
    ]
    assert incident.attributes[1].type_name == "text"
    assert incident.attributes[3].create_default == "new"

    change = next(d for d in definitions if d.name_kebab == "change-request")
    requested = next(a for a in change.attributes if a.name_snake == "requested_by")
    assert requested.create_default == str(SEED_ADMIN_ID)

    assert 'name_snake: "summary"' in source
    assert 'type_name: "text"' in source
    assert "order: 1" in source
    assert 'create_default: "new"' in source
    assert f'create_default: "{SEED_ADMIN_ID}"' in source
    assert "create_default: null" not in source


def test_min_max_on_create_update_not_full_model(tmp_path: Path) -> None:
    from pydantic import ValidationError

    from untangled.mapping.definition import load_definition
    from untangled.mapping.emit_field_meta import emit_field_meta_module
    from untangled.mapping.emit_pydantic import emit_pydantic_module

    path = tmp_path / "bounded-item.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bounded-item",
                "display-name: Bounded Item",
                "description: Numeric bounds.",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
                "    min-value: 1",
                "    max-value: 10",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    defn = load_definition(path)
    module = _load_module_from_source(
        tmp_path / "bounded_item.py",
        "gen_bounded_item",
        emit_pydantic_module(defn),
    )
    module.BoundedItemCreate.model_validate({"quantity": 5})
    with pytest.raises(ValidationError):
        module.BoundedItemCreate.model_validate({"quantity": 0})
    with pytest.raises(ValidationError):
        module.BoundedItemCreate.model_validate({"quantity": 11})
    module.BoundedItemUpdate.model_validate({"quantity": 3})
    with pytest.raises(ValidationError):
        module.BoundedItemUpdate.model_validate({"quantity": 99})
    module.BoundedItemUpdate.model_validate({})

    full = {
        "id": "01901234-5678-7abc-89ab-cdef01234567",
        "created_at": datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 18, 12, 30, tzinfo=timezone.utc),
        "created_by": "01901234-5678-7abc-89ab-cdef01234568",
        "updated_by": "01901234-5678-7abc-89ab-cdef01234569",
        "quantity": 0,
    }
    assert module.BoundedItem.model_validate(full).quantity == 0

    meta = emit_field_meta_module([defn])
    assert "min_value: 1" in meta
    assert "max_value: 10" in meta
    assert "public: false" in meta

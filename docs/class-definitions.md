# Class definitions and model generation

YAML class definitions are the source of truth for persisted object shapes. A
build-time pipeline generates Pydantic (Python) and Zod (JavaScript/TypeScript)
validation models from those definitions. Runtime persistence materializes
PostgreSQL tables from the same definitions and round-trips rows with explicit
SQL (see `untangled.persistence`).

## Where definitions live

Human-authored YAML files live under:

```text
backend/class-definitions/
```

Filenames and YAML keys use **kebab-case**. Ship one file per class (for example
`demo-item.yaml`).

The generator takes a **definitions directory path** as an input. Core fixtures
and a later custom-class feature can invoke the same pipeline with different
trees; it does not assume definitions only exist as committed engineer-owned
files in one fixed package path.

## Definition shape

Each file declares at least:

| Key | Meaning |
| --- | ------- |
| `name` | Logical class name (kebab-case), e.g. `demo-item` |
| `display-name` | Human-readable label (not a table/column identifier) |
| `description` | Purpose and other details configurers/users should know |
| `attributes` | Map of attribute name → `{ type, required }` |

Attribute names in YAML are kebab-case. They map mechanically to snake_case in
SQL, JSON, Python, and JavaScript.

### Type vocabulary (M1)

| YAML `type` | Meaning | PostgreSQL |
| ----------- | ------- | ---------- |
| `string` | UTF-8 text | `text` |
| `boolean` | True/false | `boolean` |
| `integer` | Whole number | `integer` |
| `float` | Floating-point number | `double precision` |
| `decimal` | Fixed-point decimal (exact; JSON string at boundaries) | `numeric` |
| `uuid` | UUID (hyphenated string at JSON boundaries) | `uuid` |
| `datetime` | Timezone-aware timestamp; **UTC** in storage and mapped attributes | `timestamptz` |

Keep this vocabulary small.

### Injected system fields

Every generated model (and every materialized table) includes these fields.
**Do not declare them in YAML** — definitions that redefine any of them are
rejected:

| Field | Role |
| ----- | ---- |
| `id` | Primary key (UUIDv7) |
| `created_at` | Created time (UTC) |
| `updated_at` | Last updated time (UTC) |
| `created_by` | Creating user id (uuid; no FK yet) |
| `updated_by` | Last updating user id (uuid; no FK yet) |

Until auth lands, `created_by` / `updated_by` are stamped with a temporary
well-known UUID (`STUB_ACTOR_ID` in `untangled.persistence.actor`). That constant
is intentionally easy to replace with an authenticated principal later.

## Naming conventions

| Layer | Convention | Example |
| ----- | ---------- | ------- |
| YAML keys / filenames / `name` | kebab-case | `demo-item`, `display-name` |
| SQL / JSON / JS / Python identifiers | snake_case | `demo_item`, `created_at` |
| Generated class / schema type names | PascalCase | `DemoItem`, `DemoItemSchema` |

Maps: `demo-item` ↔ `demo_item` ↔ `DemoItem`.

## Define or update a class

1. Add or edit a YAML file under `backend/class-definitions/`.
2. Run **`make models`** from the repository root.
3. Use the generated Pydantic modules under `backend/src/untangled/generated/`
   and Zod modules under `frontend/app/generated/`.
4. Apply / sync PostgreSQL tables from the same definitions via
   `untangled.persistence.apply_schema` (recreate-friendly for demo/dev/test;
   formal versioned migrations are a later ticket).

Generated outputs are **not** committed; regenerate locally and in CI as needed.
Tests invoke the same generate pipeline and assert behavioural accept/reject
behaviour (they do not compare golden file text).

## Persistence write rules

- **Create:** generate UUIDv7 `id`; stamp `created_at`, `updated_at`, `created_by`,
  `updated_by` (actor stub today).
- **Update:** stamp `updated_at` and `updated_by` only; leave `id` and `created_*`
  unchanged.
- Datetimes are stored as `timestamptz` UTC and exposed as UTC on mapped
  attributes / JSON.

Postgres for local work and `make test` is started with `make db-up`
(`compose.yaml`). Issue #5 may reshape that Compose layout; the persistence API
should remain the mapping-layer access path.

## Datetime / UTC policy

- Mapped datetime attributes are timezone-aware.
- Values are normalized to **UTC** in generated Pydantic models.
- JSON / Zod boundaries use ISO-8601 strings with an explicit offset (`Z` or
  `+00:00`).
- Local-time conversion for display is out of scope here.

## Commands

```bash
make models        # YAML → Pydantic + Zod
make db-up         # start PostgreSQL (Compose)
make db-down       # stop PostgreSQL
make clean-models  # remove generated artefacts only
make clean         # same as clean-models (clean source tree of codegen output)
make test          # includes generation + DB-backed persistence tests
make lint
```

Pipeline entrypoints (same library API the Makefile uses):

```bash
backend/.venv/bin/python -m untangled.mapping
backend/.venv/bin/python -m untangled.mapping --definitions /path/to/defs \
  --pydantic-out /tmp/pydantic --zod-out /tmp/zod
```

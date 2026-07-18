# Class definitions and model generation

YAML class definitions are the source of truth for persisted object shapes. A
build-time pipeline generates Pydantic (Python) and Zod (JavaScript/TypeScript)
validation models from those definitions. PostgreSQL persistence is a later
child of the mapping-layer epic; this document covers definitions and codegen
only.

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

| YAML `type` | Meaning |
| ----------- | ------- |
| `string` | UTF-8 text |
| `boolean` | True/false |
| `integer` | Whole number |
| `float` | Floating-point number |
| `decimal` | Fixed-point decimal (exact; JSON string at boundaries) |
| `uuid` | UUID (hyphenated string at JSON boundaries) |
| `datetime` | Timezone-aware timestamp; **UTC** in storage and mapped attributes |

Keep this vocabulary small. The persistence child will map these types to
PostgreSQL columns.

### Injected system fields

Every generated model includes these fields. **Do not declare them in YAML** —
definitions that redefine any of them are rejected:

| Field | Role |
| ----- | ---- |
| `id` | Primary key (UUIDv7) |
| `created_at` | Created time (UTC) |
| `updated_at` | Last updated time (UTC) |
| `created_by` | Creating user id (uuid; no FK yet) |
| `updated_by` | Last updating user id (uuid; no FK yet) |

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
4. Schema apply / persistence follows in the next mapping-layer child ticket.

Generated outputs are **not** committed; regenerate locally and in CI as needed.
Tests invoke the same generate pipeline and assert behavioural accept/reject
behaviour (they do not compare golden file text).

## Datetime / UTC policy

- Mapped datetime attributes are timezone-aware.
- Values are normalized to **UTC** in generated Pydantic models.
- JSON / Zod boundaries use ISO-8601 strings with an explicit offset (`Z` or
  `+00:00`).
- Local-time conversion for display is out of scope here.

## Commands

```bash
make models        # YAML → Pydantic + Zod
make clean-models  # remove generated artefacts only
make clean         # same as clean-models (clean source tree of codegen output)
make test          # includes generation/validation/naming tests (no Postgres)
make lint
```

Pipeline entrypoints (same library API the Makefile uses):

```bash
backend/.venv/bin/python -m untangled.mapping
backend/.venv/bin/python -m untangled.mapping --definitions /path/to/defs \
  --pydantic-out /tmp/pydantic --zod-out /tmp/zod
```

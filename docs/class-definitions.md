# Class definitions and schema migrate

YAML class definitions are the source of truth for **schema intent** and for
persisted object shapes. A build-time pipeline generates Pydantic (Python) and
Zod (JavaScript/TypeScript) validation models from those definitions. Runtime
persistence round-trips rows with explicit SQL (see `untangled.persistence`).

**Migrate** is the derived apply path: YAML → Schema IR → diff → plan → SQL →
PostgreSQL. Plans are computed from definitions vs the live database; they are
history of how we got there, not a second source of truth.

## Where definitions live

Human-authored YAML files live under:

```text
backend/class-definitions/
```

Filenames and YAML keys use **kebab-case**. Ship one file per class (for example
`demo-item.yaml`).

The generator and migrate CLI take a **definitions directory path** as an input.
Core fixtures and a later custom-class feature can invoke the same pipelines with
different trees; they do not assume definitions only exist as committed
engineer-owned files in one fixed package path.

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
| `created_by` | Creating user id (uuid; FK to `user.id` when a `user` class exists) |
| `updated_by` | Last updating user id (uuid; FK to `user.id` when a `user` class exists) |

Optional attribute flag: `unique: true` adds a unique index on that column
(e.g. `user.username`).

`created_by` / `updated_by` may still be stamped with `STUB_ACTOR_ID`
(`untangled.persistence.actor`) on non-HTTP library paths; that constant matches
the seeded **admin** user id so audit FKs stay valid. Protected domain APIs should
pass the authenticated principal once they land.

## Naming conventions

| Layer | Convention | Example |
| ----- | ---------- | ------- |
| YAML keys / filenames / `name` | kebab-case | `demo-item`, `display-name` |
| SQL / JSON / JS / Python identifiers | snake_case | `demo_item`, `created_at` |
| Generated class / schema type names | PascalCase | `DemoItem`, `DemoItemSchema` |

Maps: `demo-item` ↔ `demo_item` ↔ `DemoItem`.

## Define or update a class

1. Add or edit a YAML file under `backend/class-definitions/`.
2. Run **`make models`** from the repository root (codegen).
3. Apply schema with **`make migrate`** (or the production CLI below). Migrate is
   **intentional** — it is not part of `make up` / Compose start.
4. Use the generated Pydantic modules under `backend/src/untangled/generated/`
   and Zod modules under `frontend/app/generated/`.

Generated outputs are **not** committed; regenerate locally and in CI as needed.
Tests invoke the same generate pipeline and assert behavioural accept/reject
behaviour (they do not compare golden file text).

## Schema migrate

### Production CLI

Real environments run the same entrypoint Make wraps:

```bash
# Uses DATABASE_URL, or the documented local default:
# postgresql://untangled:untangled@127.0.0.1:5432/untangled
backend/.venv/bin/python -m untangled.schema

backend/.venv/bin/python -m untangled.schema \
  --definitions /path/to/defs \
  --allow-destructive
```

`make migrate` is a thin local/dev wrapper around that command. Pass extra flags
via `MIGRATE_ARGS`, e.g. `make migrate MIGRATE_ARGS=--allow-destructive`.

### Destructive gate

**Default (safe):** if the plan includes destructive operations (drop table or
column, type changes treated as data-losing, etc.), migrate **rejects**, exits
non-zero, and lists the ops that would run if allowed.

**Explicit allow:** re-run with `--allow-destructive` to apply the full plan.

Applies always print progress, use transactional DDL (one transaction for the
plan), and create a named Postgres restore point before changing DDL.

### Version history and hashes

Bootstrap tables `schema_versions` and `schema_version_class_hashes` are
intentional exceptions to YAML class definitions. Each successful migrate that
changes schema records:

| Field | Role |
| ----- | ---- |
| Monotonic `id` | Primary identifier of the version row |
| `schema_hash` | SHA-256 of canonical whole-schema IR serialization |
| Per-class hashes | SHA-256 of each table/class IR slice for that version |
| `created_at` | When this version became current |
| `superseded_at` | When a later migrate replaced it (`NULL` while current) |
| `restore_point_name` | WAL marker created immediately before this migrate’s DDL |

Same whole-schema hash ⇒ equivalent full schema intent. Same per-class hash for
a given class name ⇒ equivalent shape for that class. Hashes may recur across
history when the same intent is re-applied; temporal queries use `created_at` /
`superseded_at`.

Re-applying an older YAML shape is a forward reconcile (new monotonic id), not a
downgrade script.

### Restore points and PITR

Before DDL, migrate creates a named restore point
`untangled_schema_v{monotonic_id}` via `pg_create_restore_point`. That call needs
a role permitted to create restore points (local Compose `untangled` is a
superuser; production may need an explicit grant).

**Caveat:** a restore point is a WAL marker, not a backup. Point-in-time recovery
requires **base backups + WAL archiving**. How far back you can restore is
limited by **archive retention / storage**, not by app-level cleanup of restore
point objects. Local Compose may lack archiving — the marker is still recorded,
but it is not an operational recovery path until PITR is configured.

`pg_dump` / logical backups remain an optional manual operator step; migrate does
not automate dumps or retention.

## Persistence write rules

- **Create:** generate UUIDv7 `id`; stamp `created_at`, `updated_at`, `created_by`,
  `updated_by` (actor stub today).
- **Update:** stamp `updated_at` and `updated_by` only; leave `id` and `created_*`
  unchanged.
- Datetimes are stored as `timestamptz` UTC and exposed as UTC on mapped
  attributes / JSON.

Postgres for local work and `make test` is started with `make db-up`
(`compose.yaml`). Tests apply schema via the same `migrate()` library path.

## Datetime / UTC policy

- Mapped datetime attributes are timezone-aware.
- Values are normalized to **UTC** in generated Pydantic models.
- JSON / Zod boundaries use ISO-8601 strings with an explicit offset (`Z` or
  `+00:00`).
- Local-time conversion for display is out of scope here.

## Commands

```bash
make models        # YAML → Pydantic + Zod
make migrate       # YAML intent → PostgreSQL (intentional; not on up)
make db-up         # start PostgreSQL (Compose)
make db-down       # stop PostgreSQL
make clean-models  # remove generated artefacts only
make clean         # same as clean-models (clean source tree of codegen output)
make test          # includes generation + DB-backed tests (migrate path)
make lint
```

Pipeline entrypoints (same library APIs the Makefile uses):

```bash
backend/.venv/bin/python -m untangled.mapping
backend/.venv/bin/python -m untangled.mapping --definitions /path/to/defs \
  --pydantic-out /tmp/pydantic --zod-out /tmp/zod
backend/.venv/bin/python -m untangled.schema
backend/.venv/bin/python -m untangled.schema --allow-destructive
```

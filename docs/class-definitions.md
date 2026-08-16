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

Filenames and YAML **functional identifiers** (structural keys, class `name`,
attribute map keys, type tokens, well-known `${…}` names) use **snake_case**.
The live loader **fails closed** on non-snake forms for those fields. Ship one
file per class (for example `demo_item.yaml`). Display labels, display-derived
list URL slugs, role names, and nav data values are **not** snake-enforced.
PascalCase language/runtime type names stay as a distinct identifier-compatible
convention.

The generator and migrate CLI take a **definitions directory path** as an input.
Core fixtures and a later custom-class feature can invoke the same pipelines with
different trees; they do not assume definitions only exist as committed
engineer-owned files in one fixed package path.

## Definition shape

Each file declares at least:

| Key | Meaning |
| --- | ------- |
| `name` | Logical class name (snake_case), e.g. `demo_item` |
| `display_name` | Human-readable **class label** (not a table/column identifier; not related-record display identity) |
| `description` | Purpose and other details configurers/users should know |
| `display_attribute` | Optional. Snake_case attribute name used as limited related-record display identity (see below) |
| `public` | Optional boolean, default `false`. When `true`, every **authenticated** caller has effective **read** and **search** authorization for whatever of those endpoints are mounted, without `{class}:read` / `{class}:search`. Writes still use `{class}:{op}` / `admin`. Unauthenticated callers still have no access. Loader rejects `public: true` unless `read` and/or `search` is declared. Mounting is independent of `public` — declare standard permissions to mount endpoints. |
| `permissions` | Optional list of snake_case permission names (default empty). Standard names `create`, `read`, `update`, `delete`, and `search` each mount the matching generic record endpoint **and** seed `{class}:{name}` into the permission catalog. Additional names (e.g. future custom ops) are catalog-only and do not mount endpoints. Empty/omitted list → no generic `/api/v2/{class}` mounts. Declaring a standard name always mounts that endpoint (coupled tradeoff). |
| `check_constraint` | Optional SQL CHECK expression (string) or list of expressions. Snake_case SQL identifiers. `${snake_name}` literals are substituted at definition load. |
| `attributes` | Map of attribute name → `{ type, required, … }` |

Attribute names in YAML are snake_case. The same spelling is used in SQL,
JSON, Python, and JavaScript — no identity translation on the live path.

Attribute declaration order under `attributes` is **semantic** (default
presentation order). See
[`architecture/decisions/004-yaml-attribute-order-is-semantic.md`](../architecture/decisions/004-yaml-attribute-order-is-semantic.md).
Order is preserved through load → generated field meta (explicit `order`
ordinal). Consumers must order by that ordinal and **fail closed** if it is
missing — do not invent a sort. Tooling must not alphabetize attribute maps.

### Type vocabulary (M1)

| YAML `type` | Meaning | PostgreSQL |
| ----------- | ------- | ---------- |
| `compact_text` | Free-form UTF-8 text (compact UI section) | `text` |
| `choice` | Restricted value set later; M1 unconstrained text (compact UI) | `text` |
| `status` | Special choice later; M1 unconstrained text (compact UI) | `text` |
| `text` | UTF-8 text (full-width single-line UI section) | `text` |
| `multiline_text` | UTF-8 text (full-width multiline UI section) | `text` |
| `string` | **Deprecated** alias for `compact_text` (still accepted) | `text` |
| `boolean` | True/false | `boolean` |
| `integer` | Whole number | `integer` |
| `float` | Floating-point number | `double precision` |
| `decimal` | Fixed-point decimal (exact; JSON string at boundaries) | `numeric` |
| `uuid` | UUID (hyphenated string at JSON boundaries) | `uuid` |
| `datetime` | Timezone-aware timestamp; **UTC** in storage and mapped attributes | `timestamptz` |
| `friendly_id` | Server-assigned operational id (`prefix` + zero-padded sequence) | `text` |

Keep this vocabulary small.

**Text storage family:** `compact_text`, `choice`, `status`, `text`,
`multiline_text`, and deprecated `string` are storage-equivalent (all
PostgreSQL `text`). Intra-family type renames must **not** emit migrate DDL.
UI / search semantics follow the YAML type; migrate Schema IR stores only
the PostgreSQL type.

**`choice` / `status` in M1:** types reserve distinct future behaviour
(pickers, permissions). Generated Pydantic/Zod treat them as unconstrained
strings until value sets land — prefer documented vocabularies in class
descriptions, not validator enums yet.

**Deprecating `string`:** still accepted so external/custom trees do not
hard-break. The loader emits a visible warning (`DeprecatedStringTypeWarning`)
when `string` appears; behaviour matches `compact_text`. Prefer migrating
definitions off `string`.

### Create-time attribute defaults

Optional YAML key **`create_default`** on an attribute declares a create-form
prefill (and values the generic new-record path must include in create POST
bodies for non-editable fields). It is **not** a lasting PostgreSQL column
DEFAULT. For **required** attributes, the same literal is also the migrate
add-time backfill: `ADD COLUMN … NOT NULL DEFAULT <value>` then `DROP DEFAULT`
in the same transaction so existing rows receive the value
([ADR 012](../architecture/decisions/012-create_default-migrate-backfill.md);
ADD-COLUMN half of [#62](https://github.com/brettski74/untangled/issues/62)).
Required adds **without** `create_default` still use `ADD … NOT NULL` with no
DEFAULT and fail on non-empty tables.

- Omit the key when there is no default (do not write `create_default: null`).
- Generated field meta exposes `create_default` only when declared.
- Persistence create does not auto-apply these yet; callers (SSR new-record
  action, API clients) must supply them until a later server-apply story.
- `friendly_id` cannot have `create_default` (server-assigned).
- Declaring `create_default` on a required attribute backfills **all existing
  rows** when the column is added — treat that as data-migration intent.

M1 Change Request `requested-by` uses the baseline seed-catalog admin UUID
(`01900000-0000-7000-8000-000000000001`). That default is valid only when the
intentional baseline seed has been applied; it is scoped debt pending
`current-user` substitution / an FK picker — do not generalize seed-identity
defaults to other actor-typed attributes.

### Friendly-id attributes

At most **one** `friendly_id` attribute per class. Across the definitions tree,
`prefix` values must be unique **case-insensitively** (sequence names use the
lowercased prefix).

| YAML key | Required | Meaning |
| -------- | -------- | ------- |
| `prefix` | yes | Literal prefix stored on every value (e.g. `INC`, `CHG`) |
| `pad_width` | no | Zero-pad width; **default 8**; reject values **&lt; 4** |
| `start_at` | no | Sequence start when first created; if omitted, migrate uses max(numeric portion of matching existing values)+1, or 1 |

Sequence name: `friendly_id_{prefix_lower}` (e.g. prefix `CHG` → `friendly_id_chg`).
Migrate owns `CREATE SEQUENCE` (and the unique index on the column). Persistence
owns `nextval` + formatting on create. Clients must not supply the friendly_id
on create or update.

**Pad overflow:** if the decimal body is longer than `pad_width`, emit the full
digits (no truncate/wrap/modulo). Padding only left-zero-fills shorter values.

**Start policy:** `start_at` / max+1 applies only when the sequence is **created**.
Re-migrate does not rewrite live sequence starts. Do not race writers during
migrate when relying on max+1.

**Identity:** UUIDv7 `id` remains the portable primary key. Friendly numbers are
**environment-local** (sequences diverge across databases).

**Locators:** fetch / update / delete may use either the UUID `id` or the class’s
friendly_id value as a single path locator. Junk locators → 422.

### Injected system fields

Every generated model (and every materialized table) includes these fields.
**Do not declare them in YAML** — definitions that redefine any of them are
rejected:

| Field | Role |
| ----- | ---- |
| `id` | Primary key (UUIDv7) |
| `created_at` | Created time (UTC) |
| `updated_at` | Last updated time (UTC) |
| `created_by` | Creating user id (uuid; FK to required system `user.id`) |
| `updated_by` | Last updating user id (uuid; FK to required system `user.id`) |

### `display_attribute` (class-scoped related-record identity)

Optional top-level key naming which attribute may appear as limited related-record
identity when another class’s foreign key points at this class (for example on
`/api/v2` fetch/search/create/update responses).

| YAML | Effective result |
| ---- | ---------------- |
| omitted | If the class declares an attribute literally named `display_name` with type **exactly** `compact_text`, that attribute is used; otherwise the class has no display attribute |
| `display_attribute: null` | Explicit opt-out: no display identity (suppresses the implicit `display_name` default) |
| `display_attribute: some_attr` | Must be a declared snake_case attribute whose type is exactly `compact_text` |

Invalid explicit values (missing attribute, wrong type including deprecated
`string` / `text` / `friendly_id`, non-snake, non-string) fail definition
loading/generation with an error that identifies the class, value, and reason.

This metadata is **presentation/protocol only**: it is emitted on generated
TypeScript `ClassFieldMeta.display_attribute` (snake_case name or null) and used
by versioned read projection. It does **not** change PostgreSQL columns,
constraints, schema hashes, migrate plans, or DDL.

**Security:** declaring (or defaulting to) a display attribute is an intentional
API exposure decision. Callers who may read a *referencing* record receive that
one target field as limited identity even without permission to read the target
record itself. Do not point it at secret material merely because the field is
`compact_text` (for example never `password_hash`). Use explicit `null` when
exposure is inappropriate.

On the wire, the stable member name is always `display_name` regardless of which
`compact_text` attribute the metadata names.

The platform definition set **requires** the system `user` class. Missing `user`
fails full-platform generation, migrate planning/application, and API/runtime
bootstrap. Audit foreign keys always target `user`.

Optional attribute flag: `unique: true` adds a unique index on that column
(e.g. `user.username`).

Optional numeric bounds: `min_value` / `max_value` on `integer`, `float`, or
`decimal` attributes. Enforced on generated Pydantic/Zod **create and update**
models only (not on the full/read model). Omit either key independently; reject
`min_value` > `max_value` at definition load.

### Well-known substitution (`${…}`)

YAML string values that opt into substitution may contain `${snake_name}` tokens.
Static UUID literals resolve from the well-known catalog
(`untangled.mapping.well_known`). Clock tokens are an evaluation-environment
overlay (`clock_env`), not catalog entries.

- **Names** are snake_case. Registered now:
  - `${system_config_id}` (stable singleton UUID
    `01900000-0000-7000-8000-000000000050`)
  - `${system_user_id}` (platform attribution principal UUID
    `01900000-0000-7000-8000-000000000006`; not available in substitution
    contexts yet)
  - Clock tokens `${now}` and `${tomorrow}` are **not** catalog constants.
    Callers pass them via an evaluation-environment overlay (`clock_env`).
    `${tomorrow}` is `${now}` plus 86400 seconds. Both are whole-second UTC
    ISO-8601 with a `Z` suffix — ordinary datetime strings, not SQL `now()`.
- **Resolution is per context**, not per variable. Each context declares which
  names are available and when evaluation runs.
  - `check_constraint`: available `${system_config_id}`; evaluate at definition
    load (before Schema IR / migrate DDL).
  - `nav_bar`: available `${system_config_id}`; evaluate when product nav YAML
    is loaded (`load_default_nav`). Generated `WELL_KNOWN` /
    `SUBSTITUTION_CONTEXTS` in `frontend/app/generated/well_known.ts` are the
    allowlist source; the FE apply helper fails closed like Python.
  - `create_default`: available `${now}` / `${tomorrow}`; evaluate at migrate
    start (one clock for the whole run, including required-column backfill)
    and once per SSR create. `${now}` on create/backfill is an intentional
    force-change for `user.password_expires_at`.
  - `data_load`: available `${now}` / `${tomorrow}` (seed/data-load evaluation).
- **Fail closed:** unknown name, unknown context, or a name not available in that
  context is an error. Tokens are never left unsubstituted. `env` cannot
  introduce names outside the context allowlist.
- Generated constants and substitution catalog (`make models`):
  `untangled.generated.well_known` and `frontend/app/generated/well_known.ts`
  (constants plus `WELL_KNOWN` / `SUBSTITUTION_CONTEXTS` on the TS side).
  Application code must import those (or substitute through the catalog)—do not
  copy the UUID literal.

SQL check expressions stay snake_case identifiers with `${…}` only for literals,
for example `id = '${system_config_id}'::uuid`.

### Many-to-many joins

There is no dedicated M2M YAML syntax. Model join tables as **first-class
classes** with their own UUID primary keys and `references:` foreign keys (see
`user_role.yaml` / `role_permission.yaml`). Composite uniqueness on join pairs
is not expressible in YAML today; seeds and application logic keep pairs
idempotent via stable row ids.

Non-HTTP writes stamp `created_by` / `updated_by` with `SYSTEM_USER_ID`
(`${system_user_id}` / `untangled.mapping.well_known`). That is a **platform
attribution principal**, not a login account and not the seeded admin. Migrate
always ensures the `system` user row (including no-op schema plans): inactive,
unusable password verifier, no roles. It also upserts before audit `ADD FOREIGN
KEY` so existing system-actor stamps do not block the constraint. Do not
activate this principal; future user-admin UI must not treat it as a
reactivatable deactivated human. Migrate also insert-once ensures the
`system_config` singleton (`SYSTEM_CONFIG_ID`), attributed with this principal,
and never overwrites operator updates on re-migrate. Full local **login**
credentials still come from **`make seed`**. Protected domain APIs should pass
the authenticated principal.

### System configuration class

`system_config` is the durable home for **general, non-sensitive,
environment-local system settings** (operators may tune per deployment without
a Git promote cycle). It is `public: true` with declared permissions
`read` and `update` only (no create/delete/search mounts). Authenticated
callers may fetch without `system_config:read`; among seed roles, only `admin`
can update (no dedicated permission grants).

Initial attributes (YAML min/max on create/update; list will grow):

| Attribute | Default | Purpose |
| --------- | ------- | ------- |
| `max-search-nesting-depth` | 3 | Max search predicate nesting depth (root depth 1) |
| `max-search-nesting-length` | 20 | Max children in one logical `and`/`or` predicates array |
| `max-search-total-predicates` | 50 | Max predicates counted recursively |
| `max-search-total-regexp` | 3 | Max regexp predicates in a search tree |
| `system_config-cache-ttl-seconds` | 900 | In-process helper cache TTL |

In-process helpers (`untangled.system_config`) always address the well-known id,
**fail closed** if the row is unreadable (no fabricated defaults), and **clamp**
numeric attributes into YAML min/max from class-definition metadata. HTTP fetch
returns stored values as-is (out-of-bounds HTTP read policy is #151). Helpers
cache the full object; expiry uses the clamped TTL from that object; call
`invalidate()` to clear for a future flush broadcast (no flush bus yet —
workers may serve stale values until TTL). Search API validation consumes these
helpers for the four nesting/budget attributes (depth, length, total predicates,
total regexp): breach → **422**; unreadable config → search refuses (**503**).
Search-editor progressive limit UX remains #152. The product nav includes a
top-level **System Configuration**
`section-type: object` entry with a real detail href to the singleton
(`${system_config_id}`), visible when the user can read the class (`public` /
`{class}:read` / `admin`). Default post-login landing remains list-oriented and
does not treat object sections as a home route.

Relevant follow-ups: #117 (legacy read removal), #139 (audit), #146 (auto-mount),
#150 (kebab/snake), #151 (HTTP OOB reads), #152 (search-editor UX),
#167 (lazy FE Zod registry loading).

## Naming conventions

| Layer | Convention | Example |
| ----- | ---------- | ------- |
| YAML keys / filenames / `name` | snake_case | `demo_item`, `display_name` |
| SQL / JSON / JS / Python identifiers | snake_case | `demo_item`, `created_at` |
| Generated class / schema type names | PascalCase | `DemoItem`, `DemoItemSchema` |

Class `name` and attribute names use snake_case end-to-end; generated language types use PascalCase (`DemoItem`).

## Define or update a class

1. Add or edit a YAML file under `backend/class-definitions/`.
2. Run **`make models`** from the repository root (codegen).
3. Apply schema with **`make migrate`** (or the production CLI below). Migrate is
   **intentional** — it is not part of `make up` / Compose start.
4. Use the generated Pydantic modules under `backend/src/untangled/generated/`
   Zod modules, and class field metadata under `frontend/app/generated/`.

Generated outputs are **not** committed; regenerate locally and in CI as needed.
Tests invoke the same generate pipeline and assert behavioural accept/reject
behaviour (they do not compare golden file text).

## Schema migrate

### Production CLI

Real environments run the same entrypoint Make wraps:

```bash
# Uses DATABASE_URL, or the documented local default:
# postgresql://untangled:untangled@localhost:5432/untangled
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
  `updated_by`; assign `friendly_id` via sequence when the class defines one.
- **Update:** stamp `updated_at` and `updated_by` only; leave `id`, `created_*`,
  and friendly_id unchanged.
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

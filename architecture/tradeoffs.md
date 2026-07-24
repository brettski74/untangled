# Tradeoffs

Known compromises and the reasoning behind them.

> Claims are **inferred** unless marked **confirmed**. Do not record short-lived milestone delivery limits here.

## Modular monolith vs microservices

- **Choice:** modular monolith with strict internal boundaries first.
- **Why:** avoid premature distributed complexity; keep consistency and a single deploy story while boundaries stay enforceable.
- **Cost:** later extraction of workers/event processors will need deliberate cuts along those boundaries.
- *(inferred, high — AGENTS §3.1)*

## Thin mapping + generated validators vs heavy ORM

- **Choice:** convention-based mapping and visible SQL; Pydantic/Zod for **persisted** class/record shapes **generated from YAML**, never hand-coded. Operation protocol models (HTTP envelopes, query/body contracts) may be hand-authored.
- **Why:** single YAML intent for persisted validation across Python and JS; operations can define protocol without inventing YAML for every non-persisted wire shape.
- **Cost:** more explicit persistence patterns; less automatic relationship loading; reviewers must distinguish protocol models from persisted domain models.
- *(confirmed)*

## YAML class definitions as schema source of truth vs migration history

- **Choice:** YAML definitions drive intent; migrate computes plans from definitions vs live DB.
- **Why:** Git-friendly intent; plans are history of apply, not a competing truth.
- **Cost:** operators must understand “intent then derive,” not “edit migration files as primary.”
- *(inferred, high — docs/class-definitions.md)*

## UUIDv7 vs sequential or UUIDv4 IDs

- **Choice:** UUIDv7 everywhere for PKs.
- **Why:** global uniqueness across environments, Git-safe workflows, better index locality than v4.
- **Cost:** larger keys than integers; tooling must handle UUID strings consistently.
- *(inferred, high — AGENTS §3.5)*

## Auth + RBAC on every endpoint vs open exploration APIs

- **Choice:** require authentication on all endpoints (optional minimal health check); enforce RBAC on endpoints.
- **Why:** enterprise security posture; avoid dual paths and late lock-down risk.
- **Cost:** clients and `/docs` must obtain and present credentials.
- *(confirmed)*

## AGPL core vs customization outside copyleft

- **Choice:** AGPL for core; explicit carve-out so tenant-specific customizations (often confidential) are not treated as AGPL’d core.
- **Why:** open core without forcing customers’ business logic into licence disputes.
- **Cost:** boundary must be legally precise (addendum **#26**); YAML/JS alone is insufficient because core uses both.
- *(confirmed intent; legal text open on #26)*

## Intentional migrate/seed vs auto-apply on compose up

- **Choice:** compose bring-up does not migrate or seed; operators apply migrate/seed deliberately.
- **Why:** schema apply is consequential; keep it explicit.
- **Cost:** extra steps for new environments; footgun if forgotten.
- *(inferred, high — README)*

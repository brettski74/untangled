# Boundaries

Module and responsibility boundaries (what owns what).

> Layout claims are **inferred** from the monorepo unless marked **confirmed**.

## Repository roots

| Path | Owns | Does not own |
| ---- | ---- | ------------ |
| `backend/` | FastAPI API, schema/migrate, mapping codegen, persistence, auth, RBAC, seed | UI rendering |
| `frontend/` | React Router v7 SSR web app | Domain persistence / schema apply |
| `docs/` | Developer-facing how-tos (local dev, class defs, frontend stack) | Binding architectural intent (that lives in `/architecture/`) |
| `AGENTS.md` | Agent/engineering conventions and principles digest | Runtime behaviour; architect intent store |
| `/architecture/` | Architect intent store (this tree) | Implementation minutiae; guidance for non-architect skills |
| `.cursor/skills/` | Agent skills and git-ai scripts | Product domain logic |

Do not add parallel application roots; extend `backend/` and `frontend/` in place. *(inferred, high — docs/README.md)*

## Backend packages (`backend/src/untangled/`)

| Package | Responsibility |
| ------- | ---------------- |
| `schema/` | YAML → Schema IR → diff → plan → SQL migrate; version history |
| `mapping/` | Load class definitions; **generate** Pydantic/Zod for **persisted** class/record shapes (never hand-authored) |
| `persistence/` | Thin explicit SQL create/fetch/update |
| `auth/` | Password hashing, tokens, HTTP auth routes |
| `rbac/` | Role/permission store and enforcement helpers |
| `seed/` | Intentional local baseline seed (users/RBAC catalog) |
| `generated/` | Build output from model generation (gitignored) — not a source of truth |

Human-authored class definitions live in `backend/class-definitions/` (kebab-case YAML). They are the source of truth for schema intent and **persisted** shapes; migrate plans are derived, not a second source of truth. *(inferred, high — docs/class-definitions.md)*

**Protocol vs persisted models:** Hand-authored request/response (and similar) models for operations live with the owning API/records surface. They define wire protocol, not persisted class shape, and must not become a parallel YAML schema source of truth. *(confirmed)*

## Cross-cutting ownership

- **AuthN / AuthZ:** every endpoint authenticates (health-check exception optional); every protected endpoint enforces RBAC. *(confirmed)*
- **Audit identity on writes:** HTTP handlers use the authenticated current user; non-HTTP paths may use an aligned stub actor where no request context exists. *(inferred, medium — backend README)*
- **Core vs customization:** legal/product boundary is not “YAML/JS vs not” — core ships both; delineation tracked in **#26**. *(confirmed)*
- **Internal event bus / workers / customization runtime:** intended platform capabilities; package boundaries TBD when introduced. *(inferred, low — AGENTS; absent from tree)*
- **CMDB / discovery / workflows:** in product scope for enterprise ITSM; module boundaries TBD as those areas land. *(confirmed product scope; inferred layout TBD)*

## Agent skill boundary

- **Only** architect skills may read or write `/architecture/` or anything contained therein.
- **No** other skill may read or write that tree. *(confirmed)*

# Unknowns

Unresolved questions, risks, and open architectural gaps.

> Prefer promoting settled answers into `constraints.md` / `principles.md` / `decisions/` — not leaving them only in chat. Do not encode short-lived milestone delivery limits here.

## Open

| ID | Question | Why it matters | Confidence it is still open |
| -- | -------- | -------------- | --------------------------- |
| U1 | Exact sandbox for JS customization (V8 isolate product/API, isolation model, host bridges) | Safe extensibility invariant | high |
| U2 | Internal event bus shape (in-process vs broker; delivery guarantees; idempotency) | Modular monolith + future workers | high |
| U3 | Customization-driven schema changes (customer-added attributes/classes/FKs) without assuming only engineers ship DDL | Config-as-code at enterprise scale | high |
| U4 | Metadata-driven dynamic schema (beyond system tables + YAML class defs) — timing and model | AGENTS data-layer roadmap | medium |
| U5 | CMDB class model and standards alignment | Large design surface for enterprise CI counts | high |
| U6 | Git-backed config engine + Draft → Review → Publish UX for non-Git users | First-class Git integration not yet built | high |
| U7 | Environment promotion / validation / rollback mechanics | Multi-env portability | medium |
| U8 | Full search predicate model (OR, ranges, contains, relative dates, etc.) | API consistency as predicates grow | medium |
| U9 | Production HTTPS / cookie vs Bearer delivery for SSR app | Auth shape must not need rewrite | medium |
| U10 | When/how workers and event processors split from the API process | Horizontal scaling claim | medium |
| U11 | Legal text of the AGPL customization boundary / licence addendum | Confirmed intent; customers need enforceable clarity | high — tracked as **#26** |

## Closed during seed

| ID | Resolution |
| -- | ---------- |
| (product framing) | Enterprise-grade ITSM, not “developer-grade” / toy — see `principles.md` |
| (auth posture) | Auth required on all endpoints except optional minimal health check; RBAC enforced — see `constraints.md` |
| (FK naming) | `<object>_id` / `<prefix>_<object>_id`; user FKs usually `<actioned>_by` — see `constraints.md` |
| (validators) | Pydantic/Zod generated from YAML only — see `constraints.md` |
| (architecture access) | Only architect skills may read/write `/architecture/` — see `constraints.md` / `boundaries.md` |

# Deterministic UUIDv5 permission primary keys

## Context

Confirmed architecture requires UUIDv7 for primary keys (global uniqueness, Git-safe workflows, better index locality than v4). Issue #185 requires permission catalog row ids — including bare `admin` — to be derived as UUIDv5 from a fixed platform namespace and the canonical permission key string, so the same key yields the same UUID across environments without an ordinal id table or hard-coded id map. UUIDv7 assign-once plus reconcile-by-key is environment-local unless ids are also shipped as a second map, which #185 removes. Meeting the accepted READY acceptance criterion therefore needs a narrow exception to UUIDv7-everywhere.

## Decision

Permission catalog primary keys (rows in the `permission` class / table, including the bare `admin` permission) MAY use UUIDv5(`PERMISSION_KEY_NAMESPACE`, canonical permission key). All other primary keys remain UUIDv7. Seed and runtime identity for these rows reconcile by canonical key; the derived UUIDv5 is the stable row id for that key.

## Alternatives Considered

- **UUIDv7 assign-once + reconcile-by-key only:** Satisfies the general PK rule but does not give cross-environment deterministic ids from the key alone without retaining an ordinal or hard-coded id map.
- **Ship a hard-coded key→UUIDv7 map:** Preserves v7 shape but reintroduces a second catalog of ids alongside keys — the coupling #185 removes.
- **Non-UUID or string PKs for permissions:** Conflicts harder with the uuid PK and API identity model.

## Consequences

- Permission ids are deterministic and portable across environments given the same key and namespace constant; namespace and key spelling become part of the identity contract and must not change casually.
- Index locality for permission rows is weaker than UUIDv7 (name-based, not time-ordered); acceptable for a small, relatively static catalog.
- Callers must not generalize this exception to other classes; new deterministic-id needs require their own decision.
- Main constraints/tradeoffs docs still state UUIDv7 as the default; this ADR is the governing carve-out until a later `review-arch` folds it into those docs.

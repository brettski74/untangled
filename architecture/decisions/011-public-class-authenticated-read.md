# Class `public` is authenticated read

## Context

Class access is enforced through `{class}:{op}` grants plus `admin`. Constraints require authentication on all HTTP endpoints (optional minimal health check excepted) and RBAC on protected surfaces. Durable security intent models ordinary class read as a `{class}:read` grant with class-wide row access (TM-REV-001 THR-011 / ASM-019; SREQ-REV-001).

Epic #142 / issue #153 needs classes that every authenticated user can read without a dedicated `{class}:read` grant (first production use: `system-config` in a later child). An RBAC-only alternative — seeding a universal or per-role read grant — was considered in refinement and **overruled by the human**: a class-level `public` metadata attribute is required and must be standard permission-model behaviour, not a router or seed special case.

Leaving that as ticket-local detail would invite later surfaces to invent their own “everyone can read this” bypasses, and would leave “enforce RBAC” readable as forbidding the required outcome.

## Decision

A class definition may declare optional `public` (YAML `public`, default `false`). This is part of the **standard class-access permission model**:

1. When `public` is true, an **authenticated** caller is granted **read** (fetch, search, list, reference-read, and equivalent read operations) without `{class}:read`.
2. Unauthenticated callers remain denied. Authentication still runs first; `public` is not anonymous access and does not enlarge the SEC-API-001 anonymous surface.
3. Create, update, delete, and other non-read operations stay permission-gated (`{class}:{op}` or `admin`). `public` is not a write grant.
4. Enforcement belongs in the shared permission helpers (and matching frontend read gating for UX). Call sites must not pass a forgettable per-route flag as the only control, and must not special-case individual class names.
5. `public` is not a seed permission grant. Role catalogs do not need a matching `{class}:read` row for a public class to be readable.

## Alternatives Considered

- **RBAC-only (seed `*:read` or grant every role `{class}:read`).** Overruled by the human. Couples “readable by every authenticated user” to role-catalog churn; new roles can silently omit the grant.
- **Router or class-name special case (e.g. only `system-config`).** Rejected: breaks consistency-above-all; the next singleton or catalog class would fork another bypass.
- **Anonymous / unauthenticated read.** Rejected: violates the authentication constraint and SEC-API-001.

## Consequences

- Ordinary read authority becomes `{class}:read` **or** `admin` **or** class `public`. SEC-AUTHZ-001 enrichment and any other read gate must use that same rule or UX and API will disagree.
- For a `public` class, THR-011-style bulk read extends to every authenticated principal (search still depends on whether the search route exists). Only classes whose full corpus is appropriate for org-wide authenticated read should set the flag.
- Configuration that can set `public: true` is an authorization change expressed as YAML. Class tiering (ASM-021 / #116) is still the intended bound on who may alter such metadata; it is not implemented in this decision.
- A later `review-arch` may add a short pointer in `constraints.md`; until then this ADR is the binding source for `public`.
- Primary agents must include this ADR file in commits with the work that introduced it; the human should be informed (may warrant later `review-arch`).

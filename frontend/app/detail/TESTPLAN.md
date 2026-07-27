# Detail view (#81) — test plan

Child of epic [#71](https://github.com/brettski74/untangled/issues/71), slice 2: **route + read layout**.

## Scope

- Detail route `/:collection/:locator` (UUID or friendly-id)
- SSR GET-by-locator (no browser domain client)
- Context bar: menu / title / refresh / copy-link / disabled save-check
- Rule-based compact + text layout from field meta
- FK read-only select + open-related control
- Ignore unknown `view=`

## Out of scope (not tested as product behaviour here)

- In-place edit, dirty, Save enablement, Ctrl+S/Z (#82)
- New-record create (#83)
- FK picker / friendly-id enrichment (#73 / #87)
- Token refresh (#14)

## Prerequisites

```bash
# From repo root — generated Zod + field_meta must exist (gitignored)
make models   # or: backend/.venv/bin/python -m untangled.mapping

cd frontend && npm test
```

Touched automated suites:

| Suite | Path |
| ----- | ---- |
| Layout partition | `app/detail/default_layout.test.ts` |
| FK open-related | `app/detail/fk_open_related.test.ts` |
| Fetch seam | `app/records/fetch.server.test.ts` |
| Detail loader | `app/routes/destination_detail.test.ts` |

## Acceptance criteria → cases

| AC (issue #81) | Cases |
| -------------- | ----- |
| Open INC/CHG by UUID or friendly-id; compact + text; no class-specific branches | D1–D3, L1–L9 |
| Context bar menu / title / refresh / copy-link per epic | C1–C5 (manual + handle wiring); D1 title/copy_path |
| FK open-related real hyperlink when set; non-navigable when unset | F1–F4 |
| Audit fields read-only; `id` omitted from form body | L5, L6, D1 |
| No browser domain fetch; loader mirrors 400/422/404/403 | S1–S5, D4–D8 (domain junk locator is **422**, not 400) |

---

## Automated test cases

### A. Layout partition (`default_layout.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| L1 | compact + `text` + `multiline-text` | Text section only those attrs, declaration order |
| L2 | Compact-only | Empty text section |
| L3 | Friendly-id present | Pinned first compact; others keep order |
| L4 | No friendly-id | First non-text author attr leads compact |
| L5 | Audit append | `created_at`, `created_by`, `updated_at`, `updated_by` after author compact |
| L6 | `id` in meta | Never in compact or text |
| L7 | Two-column split | Left then right; `ceil(n/2)` left length |
| L8 | Missing/invalid `order` | Throws (fail closed) |
| L9 | `string` / `choice` / `status` | Compact |

### B. FK open-related (`fk_open_related.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| F1 | Set + mapped `references` | Navigable `href` via `record_detail_path` |
| F2 | Unset | Non-navigable, `href` null |
| F3 | Set + unmapped (`user`) | Non-navigable fail-closed |
| F4 | Tooltip | `Open {uuid}` when set |

### C. SSR fetch (`fetch.server.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| S1 | 200 object | Parsed record; GET path called |
| S2 | 404 / 422 | Thrown `Response` with same status |
| S3 | 403 from api helper | `ApiForbiddenError` |
| S4 | 401 from api helper | `ApiUnauthorizedError` |
| S5 | Non-object JSON | Reject / throw |

### D. Detail loader (`destination_detail.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| D1 | INC friendly-id | Loader data + layout; friendly-id first; no `id` slot |
| D2 | INC UUID | Title prefers friendly-id; copy_path friendly-id form |
| D3 | CHG friendly-id | change-request meta/layout |
| D4 | Unknown collection | 404; no fetch |
| D5 | API 404 | 404 |
| D6 | API 422 | 422 |
| D7 | API 403 | 403 Forbidden |
| D8 | No session | Redirect (302) |
| D9 | `?view=unknown` | Still loads default |
| D10 | Fetch once | collection + locator only |

### E. Context bar (automated coverage + manual)

| ID | Case | Expect | Mode |
| -- | ---- | ------ | ---- |
| C1 | Detail `handle.render_context_bar` | Shell renders toolbar (not `aria-hidden`) | Manual / smoke |
| C2 | List/home (no handle) | Decorative empty bar | Manual |
| C3 | Title with friendly-id | `{display name} {number}` | D1 + Manual |
| C4 | Title without friendly-id | UUID fallback | Unit via `detail_title_token` path in D2 when number missing — prefer Manual if no fixture |
| C5 | Refresh / copy / menu / save-check | Revalidator; clipboard absolute URL; menu items disabled; save disabled | Manual |

---

## Manual / UAT

| ID | Case | Expect |
| -- | ---- | ------ |
| M1 | Open INC/CHG from list friendly-id link | Detail renders; Network tab shows no browser→API domain GET (SSR only) |
| M2 | Compact 2-col + full-width text | Labels right-aligned compact; text labels above; multiline ≥4 rows |
| M3 | FK open-related | New tab when set + mapped; disabled when unset / user FK |
| M4 | Refresh | Reloads server data |
| M5 | Copy link | Clipboard gets absolute detail URL (friendly-id preferred) |
| M6 | Read-only | Fields not editable; Save does not persist |
| M7 | User without `{class}:read` | 403 page, not empty form |

## Definition of done

1. Generated models present (`make models` / mapping CLI)
2. `cd frontend && npm test` green (includes suites above)
3. `npm run typecheck` / `make frontend-lint` as used by CI
4. This TESTPLAN checked in; AC↔case table complete
5. No backend product changes for this slice

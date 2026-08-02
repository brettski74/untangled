# Detail view (#82) — test plan

Child of epic [#71](https://github.com/brettski74/untangled/issues/71), slice 3: **edit, dirty, save, undo**.

Slice 2 (#81) read-layout cases remain covered by existing suites; this plan owns edit/save/undo.

## Scope

- In-place edit; dirty vs clean; Save icon + Ctrl+S via SSR PATCH
- Ctrl+Z undo chunks (app-owned, form-subtree scoped)
- Focus glow; tab order inherits slice 2 ordinal DOM order
- `{class}:update` fail-closed (UI + action 403)
- No browser-originated domain update calls

## Out of scope (not tested as product behaviour here)

- New-record create (#83) — see [`TESTPLAN-83.md`](./TESTPLAN-83.md)
- Unsaved-navigation prompt (deferred)
- Lost-update / optimistic concurrency (deferred)
- Redo (Ctrl+Y)
- FK picker / `current-user` defaults
- Slice 2-only layout/FK/fetch cases (still run; not re-specified here)

## Prerequisites

```bash
# From repo root — generated Zod + field_meta must exist (gitignored)
make models

cd frontend && npm test
# CI-equivalent:
make frontend-test
make frontend-lint
```

Touched automated suites:

| Suite | Path |
| ----- | ---- |
| Update permission helper | `app/shell/nav.test.ts` (`can_update_class`) |
| SSR PATCH seam | `app/records/update.server.test.ts` |
| Editor / registry / Zod status | `app/detail/detail_editor.test.ts` |
| Detail loader + action | `app/routes/destination_detail.test.ts` |
| Prior slice 2 | `default_layout`, `fk_open_related`, `fetch.server` |

## Acceptance criteria → cases

| AC (issue #82) | Cases |
| -------------- | ----- |
| Edits dirty the page; Save icon reflects dirty/clean; Save/Ctrl+S persist via SSR when permitted | E1–E4, A1, M1–M3 |
| Refresh reloads from DB and clears dirty/undo | E5–E6, M4 |
| Ctrl+Z undoes in reverse chunk order; exhausting undo → clean; successful save clears undo | E7–E11, M5–M6 |
| Update RBAC fail-closed (UI + 403) | P1–P3, A3, M7 |
| No browser-originated domain update calls | U1–U5, A1, M8 |
| Implement plan documents coherent Ctrl+Z approach | Plan (implement chat); M5 verifies behaviour |

---

## Automated test cases

### P. Permissions (`can_update_class`)

| ID | Case | Expect |
| -- | ---- | ------ |
| P1 | `admin` | true for any class |
| P2 | `{class}:update` | true for that class only |
| P3 | only `{class}:read` | false |

### U. SSR update seam (`update.server.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| U1 | 200 object | Parsed record; PATCH path + JSON body |
| U2 | Domain 404 / 422 / 400 | Thrown `Response` with same status |
| U3 | 403 from api helper | `ApiForbiddenError` |
| U4 | 401 from api helper | `ApiUnauthorizedError` |
| U5 | Module posture | `.server.ts` uses `api_fetch_with_token` + PATCH |

### R / E. Editor + registry (`detail_editor.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| R1 | Known class | Update schema resolves |
| R2 | Unknown class | Observable `null` miss |
| R3 | Partial body | Optional fields accepted |
| E1 | Edit one field | Dirty |
| E2 | Values match baseline | Clean |
| E3 | Contiguous same-field edits | One undo chunk |
| E4 | Focus/target change | New chunk |
| E5/E9 | Reset from record | Undo cleared; clean |
| E6 | (manual / wiring) Incidental revalidation | Does not call reset while dirty |
| E7/E8 | Undo / exhaust | Reverse order; clean |
| E10 | Failed save | Caller keeps snapshot |
| E11 | Editable set | Author non-FK only |

### A. Detail action (`destination_detail.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| A1 | Valid PATCH | `ok` + record; `update_record` called |
| A2 | Domain 422 | Propagates 422 |
| A3 | Forbidden | 403 |
| A4 | Not found | 404 |
| A5 | Unrecognized attributes | 400; no update call |
| A6 | Field type failure | 422; no update call |
| A8 | No session | Redirect 302 |
| A9 | Non-object JSON | 400 |

### C. Context bar wiring

| ID | Case | Expect | Mode |
| -- | ---- | ------ | ---- |
| C1 | Portal via `ShellContextBar` | No handle delivery | Automated source assert |
| C2 | Clean → `SaveCheck`; dirty → `Save` | Icon tracks dirty only | Manual |
| C3 | No update permission | Save disabled; Ctrl+S no-op | Manual |

---

## Manual / UAT

| ID | Case | Expect |
| -- | ---- | ------ |
| M1 | Dirty + Save | Edit → `Save` icon → Save → persists, `SaveCheck` |
| M2 | Ctrl+S | Same success path as Save |
| M3 | Error surface | Rejected save → dismissible error; stays dirty |
| M4 | Refresh | Dirty → Refresh → DB values; clean; undo empty |
| M5 | Ctrl+Z chunks | Two-field chunks undo in reverse → clean |
| M6 | Undo after save | Save clears buffer; Ctrl+Z does not resurrect |
| M7 | No `{class}:update` | RO fields; Save disabled; Ctrl+S no-op; action 403 |
| M8 | Network | No browser→domain PATCH; same-origin action only |
| M9 | Focus / tab | Focus glow; left→right→text order |
| M10 | Always-RO | friendly-id / audit / FK not editable with update |
| M11 | Shell undo isolation | Ctrl+Z outside form subtree not stolen by empty stack |

## Definition of done

1. Generated models present (`make models`)
2. `make frontend-test` green
3. `make frontend-lint` / typecheck green
4. This TESTPLAN checked in; AC↔case table complete
5. Manual M1–M11 smoke (or deferred items noted)
6. No domain API contract changes; no browser domain update client

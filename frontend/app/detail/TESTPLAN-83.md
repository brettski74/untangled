# Detail view: new record (#83) — test plan

Child of epic [#71](https://github.com/brettski74/untangled/issues/71), slice 4: **new record**.

Slice 3 (#82) edit/save/undo cases remain covered by [`TESTPLAN.md`](./TESTPLAN.md); this plan owns create-path behaviour. Follow-on UI bugs from #82 verify — [#109](https://github.com/brettski74/untangled/issues/109) (datetime dual-control) and [#113](https://github.com/brettski74/untangled/issues/113) (Save chrome order/label) — must not recur on new.

## Scope

- Replace `/:collection/new` placeholder with shared default detail layout
- Prefill from schema `create_default` (generic); create POST includes RO defaults
- Save creates via SSR action; navigate to detail (friendly-id preferred)
- Refresh on new = reset to schema create defaults; clear undo
- Save UX: icon = dirty/clean; may enable while clean if create-valid
- `{class}:create` fail-closed (loader + action 403)
- No browser-originated domain create calls; unversioned `POST /{collection}` (not `/api/v1`)

## Out of scope (not tested as product behaviour here)

- FK picker / `current-user` defaults
- Unsaved-navigation guard (#107)
- Optimistic concurrency (#105)
- Generated Create/Update schema registry emitter (#106)
- Detail PATCH behaviour beyond shared chrome reuse
- Putting create under `/api/v1`
- Full browser E2E (Playwright/Cypress) — not introduced; residual interactive smoke only below

## Prerequisites

```bash
make models
cd frontend && npm test
# CI-equivalent:
make frontend-test
make frontend-lint
make test
```

Touched automated suites:

| Suite | Path |
| ----- | ---- |
| SSR create seam | `app/records/create.server.test.ts` |
| Defaults / merge / save enablement / create-valid | `app/detail/create_defaults.test.ts` |
| New loader + action + wiring | `app/routes/destination_new.test.ts` |
| Context bar functional (#113) | `app/detail/detail_context_bar.functional.test.tsx` (+ source lock `detail_context_bar.test.ts`) |
| New-form functional (#83 / #109) | `app/detail/detail_form_new.functional.test.tsx` (+ `detail_form.test.ts`) |
| Nav expand on `/new` | `app/shell/nav.test.ts` (`open_class_for_path`) |

Harness: vitest + jsdom + Testing Library for `*.test.tsx` (no Playwright).

## Acceptance criteria → cases

| AC (issue #83) | Automated | Residual manual |
| -------------- | --------- | --------------- |
| SSR create → detail URL (friendly-id) | C1, A1, A10, L1–L2 | M-H1, M-I1, M-I2 (live navigate) |
| Schema defaults + RO defaults in POST | D1–D2, M1–M4, A2, F-C1, F-C2, V1–V4 | — |
| Refresh resets to defaults | (editor `reset_editor_from_record` covered in #82 suite) | M-G1 (live chrome) |
| Create RBAC 403 | N3, A3–A4, S1, F-no-create | M-A1 (live HTTP page) |
| No browser→domain create | C5 | M-F7 (Network tab) |
| #109 / #113 locks | F-E1, F-B2/B3/B4, functional suites | — |

---

## Automated test cases

### C. SSR create seam (`create.server.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| C1 | 201 object | Parsed record; POST `/{collection}` not `/api/v1` |
| C2 | Domain 404 / 422 / 400 | Thrown `Response` with same status |
| C3 | 403 from api helper | `ApiForbiddenError` |
| C4 | 401 from api helper | `ApiUnauthorizedError` |
| C5 | Module posture | `.server.ts`; POST; no `/api/v1`; no `parse_v1_record` |

### D / M / R / S / V. Defaults + enablement (`create_defaults.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| D1 | INC seed | `status=new`; friendly-id/audit null |
| D2 | CHG seed | `status=draft`; `requested_by` seed UUID |
| M1–M4 | Merge RO/editable defaults; strip system | As named |
| L1–L2 | Locator preference | Friendly-id, else id |
| R1–R2 | Create schema registry | Hit / miss |
| S1–S5 | `new_save_enabled` | Permission / clean-valid / clean-invalid / dirty-invalid / schema-miss |
| V1–V4 | Create-valid from merged body | INC/CHG incomplete vs complete |

### N / A / W. New route (`destination_new.test.ts`)

| ID | Case | Expect |
| -- | ---- | ------ |
| N1–N6 | Loader | Seed, CHG defaults, 403, 404, auth redirect, `view=` |
| W1–W2 | Wiring | Shared context bar + DetailForm/LocalDatetimeInput |
| A1–A10 | Action | Merge create, RO default retained, RBAC 403, Zod 422, domain 422, friendly-id nav path |

### F. Functional DOM (`*.functional.test.tsx`)

| ID | Case | Expect |
| -- | ---- | ------ |
| F-B2/B3/B4 | Context bar | Save→Copy→Refresh; labelled bordered Save; dirty title |
| F-F5 | Save disabled | `save_enabled=false` |
| F-cluster | Right controls only | Save, Copy link, Refresh |
| F-C1/B8/B9 | INC new form | status=new; no id; number empty RO |
| F-C2/B11 | CHG new form | status=draft; requested_by UUID RO FK |
| F-E1 | CHG datetime | `type=date` + Time text; no `datetime-local` |
| F-B10 | Audit on new | Empty disabled date chrome |
| F-D1/D6 | Edit / RO rules | Summary editable; FK/friendly-id not |
| F-layout | Sections | Compact + text regions |
| F-no-create | can_update false | Author fields read-only |

---

## Residual manual / UAT (before merge)

Still need a live app for end-to-end feel and Network tab. **Prerequisites:** `make up` → migrate → seed.

| ID | Steps | Expect | Why not automated |
| -- | ----- | ------ | ----------------- |
| M-A1 | Browser: user without create → `/incidents/new` | Full 403 page | Full SSR document |
| M-B6 | Copy link on new | Clipboard has absolute `/…/new` | Clipboard API |
| M-B7 | Nav accordion on `/new` | Section expanded | Full shell (logic covered in `nav.test.ts`) |
| M-D2–D5 | Ctrl+Z chunks / shell isolation | ADR 007: form-scoped undo; click nav then Ctrl+Z must not undo into Severity (blur on outside pointer) | Keyboard + focus across shell |
| M-F2/F3 | Fill + Save → land on friendly-id detail | Live navigate + v1 FK labels | Full RR navigate + API |
| M-F6 | Server error popup dismiss | Draft kept | Full page fetcher UX |
| M-F7 | Network tab on Save | No browser→domain create | Browser DevTools |
| M-G1 | Dirty → Refresh | Reset to defaults in chrome | Full page state |
| M-H1 | Reload landed detail URL | Record persists | Browser |
| M-I1/I2 | INC + CHG happy path smoke | End-to-end create | Integration |

### Suggested residual run (~10 min)

1. M-A1, M-F7  
2. M-F2, M-F3, M-H1  
3. M-G1, M-B6  

---

## Definition of done

1. `make models` as needed  
2. `make frontend-test` / `make test` green (**356+** frontend tests including functional DOM)  
3. `make frontend-lint` / typecheck green  
4. This `TESTPLAN-83.md` checked in; AC↔case table complete  
5. Residual manual M-* above executed (or noted); **automated AC + #109/#113 locks are not deferrable**  
6. No domain create under `/api/v1`; no browser domain create client  

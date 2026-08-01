# Untangled ITSM Security Requirements

Status: Draft
Revision: SREQ-REV-001
Source revision: None
Supersedes: None
Prepared date:
Accepted date: Not accepted
Accepted by: Not accepted

## 1. Purpose and scope

### Purpose

<!-- Describe the durable security intent governed by this document. -->

### In scope

- 

### Out of scope

- 

### Delivery horizon

- 

## 2. Input snapshot

### Governing architecture inputs

| Input | Revision | Source commit | SHA-256 |
| --- | --- | --- | --- |
| Threat model |  |  |  |
| Previous security requirements | None | None | None |

### Security-review inputs

| Run ID | Findings path | Source commit | SHA-256 | Scope |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### Human design context

| Decision context | Human-confirmed position | Date |
| --- | --- | --- |
|  |  |  |

## 3. Security design principles

<!-- Record concise principles needed to interpret requirements; do not duplicate general architecture. -->

- 

## 4. Requirement summary

| Priority | Requirement ID | Requirement | Status | Delivery horizon | Related threats |
| --- | --- | --- | --- | --- | --- |
| Critical / High / Medium / Low | SEC-AUTH-001 |  | Required / Deferred / Superseded / Retired |  |  |

This table is derived from the detailed requirement records, which are authoritative.

## 5. Detailed requirements

<!-- Repeat for every active, deferred, superseded, or retired requirement. Preserve IDs. -->

### SEC-AUTH-001 — Requirement title

- Status: Required / Deferred / Superseded / Retired
- Priority: Critical / High / Medium / Low
- Applicability:
- Delivery horizon:
- Related threats:
- Source findings:
- Prior requirements:
- Supersedes: None
- Dependencies:
- Human decision reference:

#### Normative requirement

<!-- State the required outcome. Use uppercase MUST, SHOULD, or MAY only with RFC 2119/8174 meaning. -->

#### Rationale

<!-- Explain why this outcome is required and which risk it addresses. -->

#### Implementation flexibility

<!-- State which implementation choices remain open and any mechanism that is intentionally required. -->

#### Verification criteria

1. 

#### Operational and failure considerations

- 

#### Deferral terms

<!-- Required when Status is Deferred; otherwise state Not applicable. -->

- Interim treatment:
- Owner or decision path:
- Review trigger or deadline:
- Risk while deferred:

#### Review and supersession triggers

- 

## 6. Design-input disposition ledger

<!-- Every source <run-id>/<FND|DSG|PRA|HDN>-NNN appears exactly once. -->

| Source key | Input type | Disposition | Resulting requirements or decision | Rationale | Human authority | Review trigger |
| --- | --- | --- | --- | --- | --- | --- |
| <run-id>/FND-001 | Finding | Accepted as requirement / Covered by existing requirement / Mitigated by verified existing control / Deferred / Accepted risk / Rejected / Validation required |  |  |  |  |
| <run-id>/DSG-001 | Disagreement | Resolved by requirement / Resolved by human decision / Linked to finding disposition / Accepted risk / Deferred / Validation required |  |  |  |  |
| <run-id>/PRA-001 | Prior-risk reassessment | Resolved by requirement / Resolved by human decision / Linked to finding disposition / Accepted risk / Deferred / Validation required |  |  |  |  |
| <run-id>/HDN-001 | Human decision | Resolved by requirement / Resolved by human decision / Linked to finding disposition / Accepted risk / Deferred / Validation required |  |  |  |  |

## 7. Accepted risks

<!-- Prior acceptance is revisitable. Keep each accepted weakness visible with explicit review conditions. -->

| Source findings | Related threats | Risk accepted | Existing or interim controls | Rationale | Accepted by and date | Review trigger |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 8. Deferred controls

| Requirement or finding | Reason for deferral | Interim treatment | Owner or decision path | Target or trigger | Residual risk |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## 9. Rejected recommendations

<!-- Rejection means the human declined the candidate recommendation; it does not erase the underlying evidence. -->

| Source finding | Recommendation rejected | Rationale and evidence | Human authority | Reconsideration trigger |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 10. Validation-required items

| Source finding or disagreement | Validation needed | Why it blocks disposition | Safe validation path | Owner or decision path |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 11. Traceability matrix

| Requirement | Threats | Findings | Verification criteria | Suggested refinement targets |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 12. Architecture conflicts and decisions

| Security requirement or finding | Conflicting architecture intent | Human ruling | ADR, if required | Resolution status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 13. Implementation refinement handoff

<!-- This index helps later refinement; it does not mutate or authorize implementation issues. -->

| Requirement group | Requirement IDs | Existing or suggested issue | Dependencies | Refinement emphasis |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 14. Open human decisions

| Related requirement or finding | Decision needed | Options or tradeoff | Consequence of delay |
| --- | --- | --- | --- |
|  |  |  |  |

An Accepted document may contain explicit open decisions only when they do not make active requirements contradictory or ambiguous.

## 15. Revision history

| Revision | Date | Status | Source runs or trigger | Author or agent | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| SREQ-REV-001 |  | Draft | Initial design |  | Not accepted |

## 16. Completion

Design-input disposition counts:

- Accepted as requirement:
- Covered by existing requirement:
- Mitigated by verified existing control:
- Deferred:
- Accepted risk:
- Rejected:
- Validation required:
- FND inputs:
- DSG inputs:
- PRA inputs:
- HDN inputs:
- Total source inputs:
- Accounted source inputs:
- Unaccounted source inputs:

Requirement counts:

- Required:
- Deferred:
- Superseded:
- Retired:

Completion checks:

- [ ] Threat model and review inputs match pinned commits and hashes.
- [ ] Every run-qualified FND, DSG, PRA, and HDN source key has exactly one disposition.
- [ ] Every requirement has stable traceability to threats, findings, or a human decision.
- [ ] Every active requirement is normative, scoped, and verifiable.
- [ ] Every deferral has interim treatment and a review trigger.
- [ ] Every accepted risk remains visible with rationale and a review trigger.
- [ ] Every rejection preserves rationale and reconsideration conditions.
- [ ] Every unresolved disagreement or validation need remains explicit.
- [ ] Cross-architecture conflicts have a human ruling and ADR where required.
- [ ] No finding is silently treated as accepted implementation authority.
- [ ] Unaccounted source inputs equal zero.
- [ ] Summary tables match authoritative detailed records.

Set the document header to `Status: Accepted` only after explicit human acceptance and commit authorization, updating all acceptance metadata and the current revision-history row together.

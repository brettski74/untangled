# Untangled ITSM Threat Model

Status: Draft
Revision: TM-REV-001
Source revision: None
Supersedes: None
Scope:
Prepared date:
Accepted date: Not accepted
Accepted by: Not accepted

## 1. Executive summary

### System and scope

<!-- Concisely describe what is modelled and why. -->

### Highest-priority risks

<!-- List THR IDs and concise reasons. -->

### Material uncertainty

<!-- List assumptions or open questions capable of changing priorities. -->

## 2. Scope

### In scope

- 

### Out of scope

- 

### Environments and deployment contexts

| Environment or context | Relevant characteristics | Evidence |
| --- | --- | --- |
|  |  | Human-confirmed / Architecture / Implementation-observed / Assumption |

### Input snapshot

| Input | Revision or reference |
| --- | --- |
| Architecture intent |  |
| Repository commit |  |
| Change scope or diff | None |
| Previous threat-model revision | None |

## 3. Security objectives

| Objective | Description | Priority | Evidence |
| --- | --- | --- | --- |
|  |  | Critical / High / Medium / Low |  |

## 4. Assets

| ID | Asset | Security properties | Sensitivity or business impact | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| AST-001 |  | Confidentiality / Integrity / Availability / Privacy / Auditability |  |  | Active |

## 5. Actors

| ID | Actor | Capabilities and access | Security expectations | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| ACT-001 |  |  |  |  | Active |

Include legitimate users, privileged users, services, integrations, operators, and relevant attacker classes.

## 6. Trust boundaries and data flows

| ID | Boundary or flow | From / to | Data and protocol | Trust change | Existing controls | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TB-001 |  |  |  |  |  |  | Active |

## 7. Data classification and lifecycle

| Data class | Examples | Collection or creation | Storage | Transit | Retention, export, and deletion | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 8. Assumptions and constraints

| ID | Assumption or constraint | Evidence | Confidence | Consequence if false | Validation owner or path | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ASM-001 |  | Assumption | High / Medium / Low |  |  | Open |

Do not hide unresolved design decisions in prose. Record them here as explicit assumptions or constraints.

## 9. Risk-rating method

### Impact

- `Critical`: System-wide compromise, catastrophic or regulated-data exposure, unrecoverable integrity loss, or prolonged loss of a critical service.
- `High`: Major unauthorized access, sensitive-data exposure, material integrity loss, or sustained service disruption.
- `Medium`: Limited-scope compromise or disruption with bounded impact and practical recovery.
- `Low`: Minor exposure or disruption with little business impact and straightforward recovery.

### Likelihood

- `High`: Expected or readily repeatable with realistic attacker access and few preconditions.
- `Medium`: Plausible with meaningful prerequisites, timing, access, or attacker effort.
- `Low`: Requires uncommon access, difficult conditions, or a fragile chain of events.

### Overall priority

| Impact \ Likelihood | High | Medium | Low |
| --- | --- | --- | --- |
| Critical | Critical | High | High |
| High | High | High | Medium |
| Medium | High | Medium | Low |
| Low | Medium | Low | Low |

Elevate a matrix result only when threat chaining, blast radius, irreversibility, or material uncertainty justifies it; record the reason.

## 10. Threat catalogue

<!-- Repeat this subsection for every active or retired threat. Preserve IDs. -->

### THR-001 — Threat title

- Status: Active
- STRIDE categories:
- Related assets:
- Relevant actors:
- Trust boundaries:
- Preconditions:
- Attack path:
- Legitimate-user abuse case:
- Existing controls:
- Control gaps:
- Impact: Critical / High / Medium / Low
- Impact justification:
- Likelihood: High / Medium / Low
- Likelihood justification:
- Overall priority: Critical / High / Medium / Low
- Confidence: High / Medium / Low
- Evidence:
- Security objectives:
- Uncertainty or disagreement:
- Supersedes: None

## 11. Prioritized risk register

| Priority | Threat ID | Threat | Impact | Likelihood | Confidence | Primary rationale |
| --- | --- | --- | --- | --- | --- | --- |
| Critical / High / Medium / Low | THR-001 |  |  |  |  |  |

Order by priority, then threat ID. Ratings must be justified in the threat catalogue; do not rely on the table alone.

## 12. Abuse cases

| Threat ID | Legitimate capability | Misuse path | Affected asset or boundary | Existing constraint | Remaining exposure |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## 13. Threat chains

| Chain | Component threats | Combined attack path | Why composition changes risk |
| --- | --- | --- | --- |
|  |  |  |  |

## 14. Existing control coverage

| Threat ID | Existing preventive controls | Existing detective controls | Existing recovery controls | Material gaps |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Existing controls are observations, not proof of effectiveness. Record uncertainty where controls have not been verified.
The threat catalogue is authoritative. This table is a derived summary and must be updated whenever a threat’s control coverage changes.

## 15. Accepted risks and unresolved questions

### Human-accepted risks

| Threat ID | Decision | Rationale | Accepted by | Review trigger |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### Open questions

| Related ID | Question | Why it matters | Owner or decision path |
| --- | --- | --- | --- |
|  |  |  |  |

## 16. Change assessment

### Changes covered by this revision

- 

### Newly introduced or materially changed threats

- 

### Re-run triggers

- Authentication, session, authorization, or privileged-access changes.
- New or materially changed sensitive data.
- New tenancy or isolation requirements.
- New external integrations or trust boundaries.
- Material deployment-topology, secret-management, or operational-access changes.
- Human decision that invalidates an assumption or accepted risk.

## 17. Revision history

| Revision | Date | Status | Scope or trigger | Author or agent | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| TM-REV-001 |  | Draft | Initial model |  | Not accepted |

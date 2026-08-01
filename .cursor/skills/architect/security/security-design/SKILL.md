---
name: security-design
description: >-
  Interactively turn completed security-review findings into human-approved,
  durable Untangled security requirements with stable IDs, explicit
  dispositions, verification criteria, and refinement handoffs. Use after a
  security-review pipeline run is reviewed and committed.
disable-model-invocation: true
---

# Security design

Create or revise `/architecture/security/security-requirements.md` through a primary-agent design conversation. This skill is the human-governed bridge from non-governing findings to durable security intent.

## Hard rules

- **Explicit, primary-agent use only.** Run only when the human explicitly invokes security design, in a dedicated primary-agent chat using Claude Opus 5 Thinking High. Never run in a sub-agent or automated pipeline loop. If the required model is unavailable or cannot be verified, stop clearly; do not substitute another model.
- **Committed review evidence required.** Consume one or more completed, committed security-review runs. Verify each `findings.md` and referenced run artefact against its source commit and SHA-256 hashes. Uncommitted or incomplete findings cannot become design inputs.
- **Human authority.** The human decides controls, tradeoffs, priorities, deferrals, accepted risks, and final acceptance. Do not silently convert candidate findings into requirements or resolve disagreement on the human’s behalf.
- **Architect ownership.** This architect skill may read `/architecture/**` and committed `/security/reviews/**`. It may write only `/architecture/security/security-requirements.md` and, when a human-approved cross-architecture adjustment requires it, an ADR through `record-decision`. Do not edit the five main architecture documents, threat model, or review evidence.
- **Git is the acceptance boundary.** Edit `security-requirements.md` directly with `Status: Draft`; the latest committed accepted revision remains governing while the working copy is under review. Do not commit until the human explicitly accepts the content and authorizes the commit.
- **Complete design-input disposition.** Give every run-qualified `FND-NNN`, `DSG-NNN`, `PRA-NNN`, and `HDN-NNN` input exactly one auditable disposition. No input disappears merely because it is inconvenient, pre-existing, low severity, disputed, or previously accepted.
- **Prior acceptance is revisitable.** Preserve old decisions and rationale, but reassess current applicability. Human acceptance does not imply permanent acceptance when assumptions, exposure, evidence, or security practice change.
- **Stable requirement IDs.** Use `SEC-<DOMAIN>-NNN`; preserve IDs while meaning remains valid, never recycle retired IDs, and use explicit supersession. IDs are stable across document revisions and implementation tickets.
- **Normative, implementation-flexible intent.** State required security outcomes and verification criteria. Prescribe a mechanism only when alternatives would violate the accepted decision or threat model.
- **Traceability.** Every requirement links to applicable threat IDs, finding run/IDs, prior requirement IDs, and human decisions. Every finding disposition links to resulting requirements or an explicit rationale.
- **Pragmatism.** Balance risk reduction, operational burden, delivery stage, performance, and maintainability. Deferral needs an owner or trigger, interim treatment, and review condition—not “later.”
- **No issue mutation.** Propose refinement handoffs and likely issue mappings in chat, but do not create, edit, label, or close issues from this skill.
- **No downstream automation.** Do not invoke refine, implementation, the review pipeline, or Cursor’s tactical security review.

## Inputs

Required:

- Latest committed accepted threat model.
- One or more committed review runs with `Complete` `findings.md`.
- Human confirmation of the design scope and target delivery horizon.

Optional:

- Existing committed accepted security requirements.
- Named implementation issues or milestones supplied by the human.
- New constraints or decisions that emerged after the review.

## Workflow position

Typical use:

1. Accept and commit the threat model.
2. Run and commit the two-iteration security-review evidence and consolidated findings.
3. Run this skill to make human design decisions and accept durable requirements.
4. Use the refinement workflow for implementation issues, carrying relevant `SEC-<DOMAIN>-NNN` IDs into ticket scope.
5. Let `change-review` challenge implementation plans against the committed threat model and security requirements.

Re-run this skill after later review runs, human risk decisions, or material changes that require adding, superseding, deferring, or retiring security requirements.

## Stable domains

Prefer an existing domain before adding one:

- `AUTH` — identity and authentication
- `SESS` — sessions and tokens
- `AUTHZ` — authorization and privilege
- `TENANT` — tenancy and isolation
- `DATA` — sensitive-data lifecycle and privacy
- `CRYPTO` — cryptography, keys, and secrets
- `API` — service and integration boundaries
- `WEB` — browser and web delivery
- `AUDIT` — auditability and repudiation
- `OPS` — deployment and operational security
- `AVAIL` — availability and abuse resistance
- `SDLC` — build, dependency, and delivery controls

If no domain fits, discuss a concise stable domain with the human before creating IDs.

## Requirement and disposition semantics

Requirement status:

- `Required`
- `Deferred`
- `Superseded`
- `Retired`

Finding disposition:

- `Accepted as requirement`
- `Covered by existing requirement`
- `Mitigated by verified existing control`
- `Deferred`
- `Accepted risk`
- `Rejected`
- `Validation required`

`Validation required` remains an explicit open design item; it cannot silently become a requirement or rejection.

Standalone disagreement, reassessment, and human-decision disposition:

- `Resolved by requirement`
- `Resolved by human decision`
- `Linked to finding disposition`
- `Accepted risk`
- `Deferred`
- `Validation required`

## Steps

### 1. Orient and protect the worktree

Read and follow `.cursor/skills/git-ai/SKILL.md`. Run its status script before editing.

- If already on a non-default branch, state the branch and ask whether to use it.
- If on the default branch, use git-ai scripts to sync and create a human-agreed topic branch.
- Never commit, push, or open a pull request without explicit human approval.

### 2. Validate design inputs

For every review run:

- Confirm `findings.md` is `Complete` and committed.
- Pin its source commit and SHA-256 hash.
- Verify the four underlying review artefacts against the findings snapshot.
- Inventory all `FND-NNN`, `DSG-NNN`, `PRA-NNN`, and `HDN-NNN` items and qualify each as `<run-id>/<ID>`.

Read the accepted threat model and existing accepted security requirements from pinned commits. If the working requirements file is already `Draft`, treat it as interrupted non-governing work and ask whether to resume or discard it; never discard edits without human confirmation.

### 3. Establish the baseline

Build a traceability ledger containing:

- Existing requirement IDs and statuses.
- Each input as `<run-id>/<FND|DSG|PRA|HDN>-NNN`.
- Related threat IDs and prior decisions.
- Suggested candidate groupings from consolidation.
- Conflicts with existing requirements or broader architecture.

Preserve existing requirements unless the human explicitly agrees to revise, supersede, defer, or retire them.

If a proposed security decision conflicts with broader architectural intent, surface the conflict before drafting. Obtain a human ruling. When the accepted outcome changes cross-cutting architecture, invoke `record-decision`; do not silently make security intent override the rest of the store.

### 4. Interview the human

Work through focused groups of related findings. For each group, present:

- The demonstrated risk and affected threat IDs.
- Sol and Opus positions, including unresolved disagreement.
- Current controls and prior acceptance or deferral.
- Minimal effective options and their tradeoffs.
- Delivery horizon, operational burden, dependencies, and verification path.

Ask the human to choose or refine a disposition. Do not infer acceptance from lack of objection.

For accepted or deferred controls, clarify:

- Normative outcome and applicability.
- Priority and delivery horizon.
- Dependencies and implementation flexibility.
- Verification or acceptance criteria.
- Interim treatment, owner or decision path, and review trigger for deferral.

### 5. Draft security requirements

Read [security-requirements.template.md](security-requirements.template.md). Edit `/architecture/security/security-requirements.md` directly.

- Set `Status: Draft`.
- Preserve stable IDs and revision history.
- Allocate new IDs sequentially within their domain.
- Use RFC 2119/8174 keywords only when they are uppercase and intentional.
- Keep requirements concise, testable, and implementation-flexible.
- Complete the design-input disposition ledger with no omitted run-qualified inputs.
- Preserve unresolved validation and human decisions explicitly.
- Do not edit the accepted threat model or source review evidence.

Tell the human which path and ADR paths, if any, changed. Summarize unresolved decisions and ask for IDE diff review.

### 6. Iterate and prepare refinement handoffs

Apply human feedback directly. Re-check traceability and dependent requirements whenever a decision changes.

In chat, propose concise mappings from accepted/deferred requirement IDs to existing or suggested implementation issues. Do not mutate GitHub. Candidate findings and rejected recommendations are not implementation authorization.

### 7. Accept and commit

Only after explicit human acceptance of the content **and** explicit authorization to commit:

- Update document `Status`, acceptance date, acceptance authority, source revision, supersession, and current revision-history row together.
- Use `Human authority — identity not supplied` when no identity is provided.
- Confirm every run-qualified FND/DSG/PRA/HDN input has exactly one disposition.
- Include any ADR created by this workflow in the proposed commit path list and tell the human why it exists.
- Read and follow `.cursor/skills/git-ai/SKILL.md`. If the index contains unrelated paths, stop and ask the human to handle them; otherwise commit only the accepted security requirements and workflow-created ADRs with the human-approved message.

If the human accepts content but does not authorize a commit, leave `Status: Draft`; the latest committed accepted revision remains governing. After a successful authorized commit, stop and ask separately whether the human wants to publish the branch.

## Failure and interruption

- If required review evidence is incomplete, uncommitted, changed, or hash-inconsistent, stop with the exact blocker.
- If required design context is unavailable, retain explicit validation or human-decision items; do not manufacture closure.
- If interrupted, leave `Status: Draft`; the latest committed accepted revision remains governing.
- If unresolved conflict would make requirements internally inconsistent, do not mark the document Accepted.
- If the human requests immediate issue changes, explain that issue mutation belongs to the GitHub issue/refinement workflow and offer a handoff summary.

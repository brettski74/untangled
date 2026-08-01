---
name: security-consolidation
description: >-
  Consolidate two completed Sol and Opus security-review iterations into
  traceable, deduplicated candidate findings while preserving disagreements
  and prior-risk reassessments. Use as the final phase of a security-review
  pipeline run.
disable-model-invocation: true
---

# Security consolidation

Produce one non-governing `findings.md` from the completed two-iteration Sol/Opus evidence set. This is synthesis, not a third security-analysis pass and not security design.

## Hard rules

- **Orchestrator phase only.** Run in the primary Cursor Auto/orchestrator context after both Sol/Opus iterations complete. Do not launch another agent or substitute a third analysis pass.
- **Complete evidence set required.** Require completed iteration 1 and iteration 2 Sol and Opus reports, each with a verified SHA-256 hash matching the run manifest.
- **Accepted intent only.** Read the `Accepted` threat model and optional security requirements from pinned source commits and verify their content hashes. Never substitute working-tree content.
- **Evidence, not intent.** `findings.md` is a candidate recommendation set under `/security/reviews/`, not governing architecture or accepted security requirements. Do not edit `/architecture/**`.
- **No forced consensus.** Preserve every material Sol/Opus disagreement, missed-finding candidate, uncertain claim, and human-review question. Consolidation may explain a provisional assessment but must not invent agreement.
- **No silent loss.** Account for every `SR-NNN`, `AR-NNN`, meaningful no-finding claim, final-handoff item, and previously accepted weakness from the four reports.
- **Careful deduplication.** Merge records only when they describe the same underlying weakness, affected boundary or asset, and materially equivalent attack path. Shared CWE, severity, or recommendation alone is insufficient.
- **Evidence-bound synthesis.** Do not inspect new implementation surfaces, create new vulnerability claims, or resolve factual disputes with fresh analysis. Carry evidence gaps forward for security design or human review.
- **Pre-existing remains visible.** Preserve provenance and report every identified scoped weakness. Prior acceptance or deferral is not an exemption; retain current reassessment and reasons for human reconsideration.
- **Deterministic ranking.** Use the accepted threat model’s impact, likelihood, and priority matrix. For unresolved rating disagreement, use the highest evidence-supported rating as provisional—not automatically the highest claimed rating—and preserve all positions.
- **Pragmatic actionability.** Convert supported analysis into minimal, verifiable candidate recommendations. Do not assign durable security requirement IDs or mandate speculative implementation.
- **Immutable run evidence.** Never overwrite a completed `findings.md`. If the target exists, stop unless explicitly resuming an incomplete consolidation with identical inputs.
- **No repository publication.** Do not commit, push, open pull requests, mutate issues, refine tickets, or implement fixes.

## Invocation contract

The pipeline supplies all fields from [consolidation.prompt.md](consolidation.prompt.md):

- Absolute repository root.
- Run ID and run directory.
- Full-review or diff-aware mode.
- Review scope and exclusions.
- Pinned repository commit, diff inputs, and run manifest.
- Accepted threat-model and optional security-requirements revision, source commit, and SHA-256 hash.
- Paths and SHA-256 hashes for:
  - Iteration 1 security review.
  - Iteration 1 adversarial review.
  - Iteration 2 security review.
  - Iteration 2 adversarial review.

Required output:

```text
<run-directory>/findings.md
```

## Consolidation semantics

### Source authority

Detailed finding and critique records are authoritative within each report. Summary tables are derived. Iteration 2 records current positions, while iteration 1 remains necessary audit history for withdrawn, revised, or incompletely addressed items.

### Stable finding IDs

Assign consolidated IDs `FND-001`, `FND-002`, and so on in descending provisional priority, then stable source-ID order. IDs are local to the run and must not be presented as durable security requirement IDs.

Also assign run-local IDs to standalone design inputs:

- `DSG-NNN` — unresolved disagreement
- `PRA-NNN` — prior accepted-risk reassessment
- `HDN-NNN` — human decision or validation need

These IDs make every downstream security-design input independently dispositionable.

### Source keys

Qualify every source record by iteration:

- `iteration-1/SR-001`
- `iteration-1/AR-001`
- `iteration-2/SR-001`
- `iteration-2/AR-001`

For source items without native IDs, assign deterministic keys in document order:

```text
iteration-<N>/<report>/<section-slug>/ROW-<NNN>
```

For example: `iteration-2/adversarial-review/final-handoff/ROW-001`. Use these keys consistently in source accounting, deduplication, findings, and disagreement records.

### Consolidated status

Use:

- `Supported`
- `Supported with disagreement`
- `Candidate — validation needed`
- `Human decision required`
- `Withdrawn or unsubstantiated`

Only the first four appear as candidate findings. Keep withdrawn or unsubstantiated source items in the source-accounting appendix.

### Deduplication

Merge source items only when all apply:

1. Same underlying weakness or failed security property.
2. Same or overlapping affected assets and trust boundaries.
3. Materially equivalent prerequisites and attack path.
4. Compatible control gap and remediation objective.

When in doubt, preserve separate findings and cross-link them. Never merge distinct tenant, privilege, lifecycle, or deployment risks merely because one control could address them.

### Ranking

- Derive impact and likelihood from supported source evidence.
- Apply the accepted threat-model matrix.
- Carry forward a documented permitted elevation only when its evidence remains supported.
- Record confidence separately.
- For unresolved disagreement, preserve each position and explain the provisional ranking.
- `Informational` observations sort after risk-rated findings.

## Steps

### 1. Validate the run

- Confirm the invocation contract is complete.
- Confirm all four reports are `Complete`.
- Confirm the output path is inside the supplied run directory.
- Confirm pinned inputs match the run manifest.
- Read accepted intent from pinned Git commits and verify SHA-256 hashes.
- Verify the supplied diff and all four reports against recorded SHA-256 hashes.
- Refuse a completed-output collision.

Stop with a precise blocker if any input is missing, incomplete, changed, or inconsistent.

### 2. Build a source-accounting ledger

Inventory:

- Every Sol finding from both iterations.
- Every Opus critique from both iterations.
- Every meaningful no-finding claim audited by Opus.
- Every withdrawn, revised, disputed, or uncertain item.
- Every missed-finding candidate and final-handoff item.
- Every identified previously accepted or deferred weakness.

Give each iteration-qualified or deterministic source key exactly one primary disposition in the output. Cross-links are allowed; silent omission is not.

### 3. Form candidate finding groups

Group source items using the deduplication rules. For each group:

- Identify the underlying security property and attack path.
- Preserve all iteration-qualified source keys and evidence references.
- Separate agent agreement from disagreement.
- Distinguish substantiated findings from candidates needing validation.
- Preserve provenance: introduced, regression, exposure changed, pre-existing, or uncertain.
- Carry prior acceptance and its current reassessment.

Do not resolve an evidence dispute by prose compromise. If grouping would hide materially different claims, split the group.

### 4. Rank and make actionable

For each candidate finding:

- Derive provisional impact, likelihood, severity, and confidence.
- Explain any disagreement or elevation.
- State affected assets, boundaries, threats, and existing requirement IDs.
- Describe the minimal effective control objective.
- Define a safe verification or acceptance approach.
- Identify dependencies, sequencing, and likely refinement targets without mutating issues.
- State any human decision or evidence required before security design.

Previously accepted weaknesses stay visible even when the current reassessment supports continued acceptance.

### 5. Write findings

Read [findings.template.md](findings.template.md). Write the complete output to `<run-directory>/findings.md`.

- Use deterministic section ordering.
- Populate every section; `None identified` means examined and none found.
- Keep detailed findings authoritative and summaries derived.
- Ensure the source-accounting ledger has no omissions.
- Mark output `Complete` only after all applicable checks pass.

Return:

- Output path.
- Candidate counts by status and severity.
- Unresolved-disagreement and human-decision counts.
- Source-accounting totals and any blocker.

Then stop. Tell the caller that candidate findings require the separate interactive `security-design` skill before becoming durable security requirements.

## Failure and interruption

- On missing or inconsistent inputs, write no completed findings file; return the exact blocker.
- If interrupted after creating partial output, mark it `Incomplete`. Resume only with the same run ID, orchestrator model, and pinned inputs.
- If source evidence cannot support deduplication or ranking, preserve separate candidates and flag the uncertainty.
- If a new implementation-level question emerges, carry it as required evidence; do not perform a hidden third review pass.

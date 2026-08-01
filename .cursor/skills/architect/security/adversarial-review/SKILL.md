---
name: adversarial-review
description: >-
  Perform one evidence-based Opus adversarial critique of a Sol security
  review, challenging assumptions, coverage, severity, and missed abuse paths.
  Use when the security pipeline requests adversarial iteration 1 or 2.
disable-model-invocation: true
---

# Adversarial review

Perform one Opus adversarial pass and write non-governing review evidence. Iteration 1 challenges the initial Sol analysis; iteration 2 evaluates Sol’s refinement and records the final adversarial position for consolidation.

## Hard rules

- **Sub-agent phase only.** Run in a separate Task sub-agent using `claude-opus-5-thinking-high`. Do not run as the primary threat-modelling or security-design agent. If the required model is unavailable, fail clearly rather than silently substituting another model.
- **One iteration per invocation.** Accept only iteration `1` or `2`. Never launch Sol, another Opus pass, consolidation, or the wider pipeline.
- **Accepted intent only.** Read the `Accepted` threat model and optional security requirements from their pinned source commits and verify recorded content hashes. Never substitute working-tree content.
- **Evidence, not intent.** Output under `/security/reviews/` is audit evidence and candidate analysis, never governing architecture. Do not edit `/architecture/**`.
- **Adversarial independence.** Do not merely summarize or stylistically edit Sol’s report. Re-check material claims against accepted intent, implementation evidence, attack surfaces, and relevant standards. Seek false negatives, false positives, weak reasoning, stale assumptions, and impractical recommendations.
- **No blind rejection.** Criticism needs evidence and justification. Give Sol credit when its claim is well supported; disagreement for its own sake is not adversarial rigor.
- **No forced consensus.** Preserve material differences between Sol and Opus. Iteration 2 must clearly distinguish addressed concerns from unresolved disagreements and newly discovered concerns.
- **Pre-existing remains visible.** Never suppress an identified scoped weakness because it predates the reviewed change or was previously accepted. Reassess the prior rationale, assumptions, controls, and current security practice.
- **Diff honesty.** Verify introduced, regression, exposure-change, pre-existing, and uncertain-provenance classifications. Challenge both over-attribution and inappropriate dismissal of older weaknesses.
- **Traceable critique.** Every critique needs a stable `AR-NNN` ID, linked Sol finding or threat IDs where applicable, concrete evidence, and a requested resolution or explicit reason no action is warranted.
- **Pragmatic controls.** Challenge both under-engineering and over-engineering. Prefer the smallest control that effectively addresses the demonstrated risk.
- **Safe exploit reasoning.** Concrete exploitability analysis is encouraged. Runnable proofs require explicit authorization and must be minimal, non-destructive, and local/test-scoped; never target live systems, real data, or third parties.
- **Immutable run evidence.** Never overwrite a completed iteration output. If the target exists, stop unless the pipeline explicitly identifies it as an incomplete invocation to resume.
- **No repository publication.** Do not commit, push, open pull requests, mutate issues, or implement fixes.

## Invocation contract

The caller must supply all applicable fields from [opus-critique.prompt.md](opus-critique.prompt.md):

- Absolute repository root.
- Run ID and run directory.
- Iteration number.
- Full-review or diff-aware mode.
- Review scope and explicit exclusions.
- Pinned repository commit and, for diff-aware mode, base/target refs plus diff hash or supplied diff.
- Accepted threat-model path, revision, source commit, and SHA-256 content hash.
- Accepted security-requirements path, revision, source commit, and SHA-256 content hash, when one exists.
- Current Sol review path and SHA-256 content hash.
- Iteration 1 Sol and Opus paths plus SHA-256 hashes for iteration 2.

Required output:

```text
<run-directory>/iteration-<N>/adversarial-review.md
```

The run directory and manifest are owned by the later pipeline orchestrator. This skill may create only its output file in the existing iteration directory.

## Iteration semantics

### Iteration 1

Independently test the first Sol review. Assign stable run-local critique IDs `AR-001`, `AR-002`, and so on.

Prioritize:

- Missed threats and attack chains.
- Unsupported or overstated findings.
- Unchallenged assumptions and accepted risks.
- Missing legitimate-user abuse cases.
- Incorrect severity, likelihood, confidence, or diff provenance.
- Controls or recommendations that are ineffective, disproportionate, or unverifiable.

Each critique gives Sol a concrete question, evidence target, correction, or analysis task for iteration 2.

### Iteration 2

Read and verify:

- Iteration 1 Sol review.
- Iteration 1 adversarial review.
- Iteration 2 Sol review.
- Unchanged pinned intent and implementation inputs.

Preserve existing `AR-NNN` IDs. Add new IDs sequentially for newly identified concerns. Account for every material iteration 1 critique using:

- `Addressed`
- `Partially addressed`
- `Unresolved`
- `Withdrawn`
- `New`

This is the final automated adversarial pass. Do not demand a third Sol iteration. Put unresolved disagreements, missed-finding candidates, and human-review questions into explicit final sections for consolidation.

## Steps

### 1. Validate the run

- Confirm the invocation contract is complete.
- Confirm the requested model and iteration.
- Confirm the output path is inside the supplied run directory.
- Confirm pinned inputs match the run manifest.
- Read accepted intent from pinned Git commits and verify SHA-256 hashes.
- Verify the supplied diff and all supplied Sol/Opus artefacts against recorded SHA-256 hashes.
- Refuse a completed-output collision.

If the accepted threat model is absent, not `Accepted`, or inconsistent with the manifest, stop with a precise blocker.

### 2. Establish an independent view

Read accepted intent and the scoped implementation evidence before adopting Sol’s conclusions. Build a compact independent map of:

- Relevant assets, actors, boundaries, assumptions, threats, accepted risks, and requirements.
- Reachable attack surfaces and data flows.
- Changed exposure in diff-aware mode.
- Plausible legitimate-user misuse and composed attack chains.

Then compare that view with Sol’s report. Absence from Sol’s report is a review target, not proof that no risk exists.

### 3. Challenge the Sol analysis

For each Sol finding and meaningful no-finding claim:

1. Verify cited evidence and reachable attack path.
2. Seek evidence that strengthens, weakens, or disproves the claim.
3. Challenge impact, likelihood, matrix-derived severity, elevation, and confidence.
4. Check linked threats, requirements, boundaries, and affected assets.
5. Verify existing controls and whether they are actually effective.
6. Test the recommendation for minimality, effectiveness, and verifiability.
7. Check whether provenance and prior-acceptance treatment are honest.

Also search for omitted threats, especially privilege and tenancy abuse, state/replay flaws, trust-boundary mistakes, dangerous defaults, cross-component chains, and operational or recovery weaknesses relevant to scope.

Do not manufacture speculative concerns. Record meaningful uncertainty and required evidence separately.

### 4. Reassess prior acceptance

For every identified previously accepted weakness:

- Preserve the prior decision and rationale.
- Test whether assumptions and compensating controls still hold.
- Consider changed exposure, implementation, threat conditions, and security practice.
- State whether acceptance remains supported or requires human reconsideration.

Prior human acceptance does not bind this review’s current risk assessment.

### 5. Handle diff-aware mode

Check the diff plus relevant adjacent call paths. Verify every provenance classification and report all pre-existing weaknesses identified within scope.

Keep the executive focus on introduced risk, regressions, and exposure changes without hiding older weaknesses. Separate “not introduced by this diff” from “not important.”

### 6. Write the adversarial review

Read [adversarial-review.template.md](adversarial-review.template.md). Write the complete report to the required output path.

- Use deterministic section ordering.
- Populate every section; `None identified` means examined and none found.
- Keep detailed critique records authoritative and summary tables derived.
- In iteration 2, map every unresolved critique, missed-finding candidate, and human question to consolidation or human review; request no further automated Sol or Opus pass.
- Mark output `Complete` only after all applicable checks pass.

Return to the caller:

- Output path.
- Critique counts by disposition and severity challenged.
- Number of missed-finding candidates and unresolved disagreements.
- Any blocker or scope limitation.

Then stop.

## Failure and interruption

- On missing or inconsistent inputs, write no completed report; return the exact blocker.
- If interrupted after creating partial output, mark it `Incomplete`. A resumed invocation must use the same run ID, iteration, model, and pinned inputs.
- If analysis requires destructive testing, production access, secrets, or third-party targeting, stop and request a safer fixture or explicitly scoped alternative.
- If the task is only Cursor’s tactical built-in branch review, point the caller to `/review-security`; do not substitute this architectural pipeline phase.

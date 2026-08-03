---
name: security-review
description: >-
  Perform one evidence-based Sol security-analysis iteration against accepted
  Untangled threat-model intent and an optional code diff. Use when the
  security pipeline requests iteration 1 or 2 of implementation-level security
  review.
disable-model-invocation: true
---

# Security review

Perform one Sol analysis pass and write non-governing review evidence. The pipeline invokes this skill twice, with an Opus adversarial review between passes.

## Hard rules

- **Sub-agent phase only.** The caller launches this skill in a separate Task sub-agent with model `gpt-5.6-sol-medium`, and must fail clearly rather than silently substitute another model if it is unavailable. Model selection is the caller's: this skill records the assigned-model slug it is given and never asserts, infers, or verifies which model is running it. Do not run as the primary threat-modelling or security-design agent.
- **One iteration per invocation.** Accept only iteration `1` or `2`. Never launch Opus, another Sol pass, consolidation, or the wider pipeline.
- **Accepted intent only.** Read the `Accepted` threat model and optional security requirements from the pinned source commit and verify their recorded content hashes. Never substitute working-tree content; a working file marked `Draft` is non-governing. An accepted threat model is required.
- **Evidence, not intent.** Output under `/security/reviews/` is audit evidence and candidate analysis, never governing architecture. Do not edit `/architecture/**`.
- **No blind trust.** Verify relevant claims against code, configuration, tests, dependencies, deployment material, and data flows. Label unverified claims and absence-of-evidence explicitly.
- **Traceable claims.** Every finding needs concrete evidence, an attack path, affected assets or boundaries, impact and likelihood justification, confidence, and linked threat IDs. Cite file paths and lines or pinned external standards where practical.
- **Adversarial pragmatism.** Include legitimate-user misuse and composed attack paths. Prefer minimal effective controls; do not inflate severity or recommend speculative platform machinery.
- **No forced consensus.** Iteration 2 must preserve material Sol/Opus disagreements and justify whether each critique is accepted, partially accepted, or rejected.
- **Diff honesty and visibility.** In diff-aware mode, distinguish introduced risks, regressions, exposure changes, pre-existing risks, and uncertain provenance. Never call a pre-existing weakness newly introduced without evidence, but never suppress an identified scoped weakness merely because it predates the diff.
- **Prior acceptance is not an exemption.** Report previously accepted weaknesses as pre-existing and reassess whether the recorded rationale, assumptions, compensating controls, and review conditions still hold. Updated evidence or security practice may invalidate an old decision. Preserve the prior human decision, but flag missing, stale, or unsupported rationale for human reconsideration.
- **Safe exploit reasoning.** Concrete exploitability analysis is encouraged. Runnable proofs require explicit authorization and must be minimal, non-destructive, and local/test-scoped; never target live systems, real data, or third parties.
- **Immutable run evidence.** Never overwrite a completed iteration output. If the target exists, stop unless the pipeline explicitly identifies it as an incomplete invocation to resume.
- **No repository publication.** Do not commit, push, open pull requests, mutate issues, or implement fixes.

## Invocation contract

The caller must supply all applicable fields from [sol-analysis.prompt.md](sol-analysis.prompt.md):

- Absolute repository root.
- Run ID and run directory.
- Iteration number.
- Assigned model slug, exactly as launched.
- Full-review or diff-aware mode.
- Review scope and explicit exclusions.
- Pinned repository commit and, for diff-aware mode, base/target refs plus diff hash or supplied diff.
- Accepted threat-model path, revision, source commit, and SHA-256 content hash.
- Accepted security-requirements path, revision, source commit, and SHA-256 content hash, when one exists.
- Iteration 1 review and adversarial-review paths plus SHA-256 content hashes for iteration 2.

Required output:

```text
<run-directory>/iteration-<N>/security-review.md
```

The run directory and its manifest are owned by the later pipeline orchestrator. This skill may create only its iteration directory and output file.

## Iteration semantics

### Iteration 1

Analyze the scoped system independently against accepted intent. Do not anticipate or fabricate an Opus position.

Assign findings stable run-local IDs `SR-001`, `SR-002`, and so on. IDs are unique within the run and must remain stable in iteration 2.

### Iteration 2

Read:

- Iteration 1 `security-review.md`.
- Iteration 1 `adversarial-review.md`.
- Any unchanged pinned inputs from the manifest.

Re-examine challenged code and assumptions rather than merely editing prose. Preserve existing `SR-NNN` IDs. Add new IDs sequentially for newly substantiated findings.

Record each prior finding and critique in the disposition ledger as:

- `Confirmed`
- `Revised`
- `Withdrawn`
- `New`
- `Disputed`

For disagreement, state both positions, evidence for each, and Sol’s conclusion. Do not erase the Opus position or claim consensus.

## Steps

### 1. Validate the run

- Confirm the invocation contract is complete.
- Confirm the iteration.
- Confirm the output path is inside the supplied run directory.
- Confirm pinned inputs match the run manifest.
- Read accepted intent from its pinned Git commit and verify its SHA-256 content hash.
- Verify the supplied diff and all prior iteration artefacts against their recorded SHA-256 hashes.
- Refuse a completed-output collision.

If the accepted threat model is absent, Draft-only, or its revision does not match the manifest, stop with a precise blocker.

### 2. Load governing intent and evidence

Read the accepted threat model and accepted security requirements when present. Build a working map of:

- Assets, actors, trust boundaries, assumptions, threat IDs, and accepted risks.
- Applicable requirement IDs.
- Review scope and exclusions.
- Changed surfaces and exposure changes in diff-aware mode.

Treat accepted risks and deferred requirements as review inputs, not an allowlist. Link any identified weakness to its prior decision and reassess that decision against current evidence.

Inspect implementation evidence broadly enough to follow relevant call paths and data flows. Do not limit analysis to filenames named in a diff when adjacent code controls exploitability.

### 3. Analyze the scoped system

Prioritize risks relevant to the model and scope. Consider, where applicable:

- Authentication, session/token lifecycle, recovery, and machine identity.
- Authorization, object-level access, administrative paths, privilege transitions, and tenancy isolation.
- Input handling, injection, deserialization, file handling, outbound requests, and unsafe execution.
- Secrets, cryptographic choices, key lifecycle, sensitive-data handling, exports, logs, and backups.
- Browser/server trust boundaries, CSRF, XSS, SSR, cookies, headers, and cross-origin behavior.
- External integrations, dependency and supply-chain boundaries, webhook/API trust, and failure handling.
- Concurrency, replay, state transitions, business-logic abuse, auditability, repudiation, and availability.
- Deployment defaults, debug surfaces, observability leakage, incident containment, and recovery.

Use STRIDE, OWASP, CWE, NIST, and relevant RFCs as aids where they improve coverage or justification, not as decorative citations.

For each suspected issue:

1. Trace a realistic attack path.
2. Verify prerequisites and reachable surface.
3. Identify existing preventive, detective, and recovery controls.
4. Seek disconfirming evidence.
5. Rate impact, likelihood, severity, and confidence using the output template. Severity follows the accepted threat model’s priority matrix unless its documented elevation rule applies.
6. Recommend the smallest effective control and a verification approach.

Do not report hypothetical issues unsupported by the scoped system. Record meaningful coverage gaps or unknowns separately.

### 4. Handle diff-aware mode

Use the supplied diff and inspect affected call paths. Classify every finding:

- `Introduced`
- `Regression`
- `Exposure changed`
- `Pre-existing relevant`
- `Provenance uncertain`

Explain the classification. Focus the executive summary on newly introduced risk and changed exposure, but report every pre-existing weakness identified within the scoped review. For each previously accepted weakness, state whether the old rationale remains supported, needs reconsideration, has changed conditions, or is undocumented.

### 5. Write the review

Read [security-review.template.md](security-review.template.md). Write a complete report to the required output path.

- Use deterministic section ordering.
- Copy the assigned-model slug verbatim from the invocation into the header. Do not assert, infer, or substitute which model produced the report.
- Populate every section; `None identified` means examined and none found.
- Keep detailed evidence in finding records, with summary tables derived from them.
- Mark output `Complete` only after all required sections and iteration-specific ledgers are populated.

Return to the caller:

- Output path.
- Finding counts by severity.
- Number of disputed or uncertain items.
- Any blocker or scope limitation.

Then stop.

## Failure and interruption

- On missing or inconsistent inputs, write no completed report; return the exact blocker.
- If interrupted after creating partial output, mark it `Incomplete`. A resumed invocation must use the same run ID, iteration, model, and pinned inputs.
- If analysis would require destructive testing, production access, secrets, or third-party targeting, stop and request a safer test fixture or explicit scoped alternative.
- If the requested task is only Cursor’s tactical built-in branch review, point the caller to `/review-security`; do not pretend this phase is that tool.

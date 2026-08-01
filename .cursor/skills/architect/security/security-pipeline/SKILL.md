---
name: security-pipeline
description: >-
  Orchestrate Untangled's two-iteration Sol and Opus security-review pipeline,
  verify and preserve review evidence, and consolidate candidate findings.
  Use after an accepted threat model exists for full or diff-aware review.
disable-model-invocation: true
---

# Security-review pipeline

Run the automated review sequence:

```text
Sol 1 → Opus 1 → Sol 2 → Opus 2 → consolidation
```

Threat modelling and security design are separate, explicitly invoked primary-agent workflows.

## Hard rules

- **Explicit primary orchestration.** Run only when the human explicitly invokes the pipeline in a dedicated primary Cursor Auto chat. This skill orchestrates; it does not replace any phase’s model or instructions.
- **Exactly two iterations.** Launch exactly two Sol and two Opus phase invocations in order. Never add a third automated analysis pass.
- **Exact model assignment.** Sol phases use `gpt-5.6-sol-medium`; Opus phases use `claude-opus-5-thinking-high`. If either model is unavailable, stop clearly without substitution.
- **Accepted threat model required.** Pin and verify a committed `Accepted` threat model. A working Draft is non-governing. Optional accepted security requirements are pinned the same way.
- **Immutable inputs.** Pin repository state, accepted intent, review mode, scope, exclusions, diff, and changed-file snapshot before launching a phase. Outside the active run directory, the working repository must match the pinned target and any explicitly supplied diff snapshot. Verify this before every later phase. Material input change aborts the run; start a new run ID.
- **Evidence, not intent.** All outputs under `/security/reviews/<run-id>/` are non-governing review evidence and candidate findings. Do not edit `/architecture/**`.
- **Fresh phase agents.** Launch a fresh Task for each Sol and Opus iteration. Do not reuse one model’s conversation across iterations; continuity comes from pinned artefacts.
- **No forced consensus.** Preserve disagreement through every phase and into findings. Do not edit phase outputs to manufacture agreement.
- **Pre-existing remains visible.** Do not suppress scoped pre-existing or previously accepted weaknesses. Provenance and prior decisions must remain explicit and reassessed.
- **Primary owns orchestration files.** Only the primary orchestrator writes the manifest, input snapshot, phase status, hashes, and consolidated findings. Sub-agents write only their contracted phase output.
- **No silent retry.** A failed phase may be resumed once with identical inputs and the same Task when available. Record both attempts. A second failed attempt makes the run terminally blocked; never attempt that phase again under the same run ID.
- **Human checkpoints do not mutate evidence.** At an optional checkpoint, the human may continue, stop, or require a new run. A material scope or context correction aborts the current run rather than rewriting completed evidence.
- **No automatic design or implementation.** Do not invoke threat modelling, security design, refinement, tactical `/review-security`, issue mutation, or fixes.
- **No publication without approval.** Do not commit, push, or open a pull request without explicit human authorization.

## Preconditions

- A committed `Accepted` `/architecture/security/threat-model.md`.
- A clean, stable review target:
  - Full review: committed target snapshot.
  - Diff-aware review: committed base/target range or an explicitly supplied immutable diff with changed-file hashes.
- Human-confirmed scope, exclusions, review mode, and checkpoint policy.
- Git work on a non-default topic branch.

Use Cursor’s `/review-security` instead when the goal is only a tactical review of uncommitted branch changes without architecture-wide evidence.

## Run layout

The invoked pipeline creates:

```text
security/reviews/<run-id>/
  manifest.md
  inputs/
    review.diff                 # diff-aware only
    changed-files.md            # diff-aware only
  iteration-1/
    security-review.md
    adversarial-review.md
  iteration-2/
    security-review.md
    adversarial-review.md
  findings.md
```

Use a collision-resistant run ID:

```text
<UTC-YYYYMMDDTHHMMSSZ>-<target-commit-12>-<scope-slug>-<6hex>
```

Refuse an existing run directory. Never overwrite a completed run.

## Review modes

### Full review

- Pin a committed target SHA.
- Require the working tree outside the active run directory to match the pinned target commit before every phase; no implementation, configuration, untracked, or unrelated evidence changes are allowed.
- Set diff fields to `Not applicable`.
- Review the human-confirmed system or subsystem scope against accepted intent.

### Diff-aware review

Preferred: pin committed base and target SHAs, generate `inputs/review.diff` with the git-ai diff script, and hash it.

If the human supplies an immutable diff instead:

- Record its provenance and SHA-256.
- Record every changed path and its SHA-256 or `Deleted` state in `inputs/changed-files.md`.
- Require the working files to match that snapshot before every phase.
- Abort if the supplied patch cannot be related to the pinned repository state.

The review may inspect adjacent committed call paths that determine exploitability, but the diff and scope remain the provenance boundary.

## Checkpoint policy

Ask the human to choose:

- `End only` — run through consolidation without pausing.
- `After iteration 1` — pause after Opus 1.
- `Before consolidation` — pause after Opus 2.
- `Both`.

At a checkpoint, summarize completed output paths, counts, disagreements, and blockers. Do not reinterpret results. If the human changes material inputs or scope, mark the run `Aborted` with the reason and start a new run only after confirmation.

## Steps

### 1. Orient and confirm the run

Read and follow `.cursor/skills/git-ai/SKILL.md`. Run its status script.

- If on a non-default branch, state it and ask whether to store this run there.
- If on the default branch, sync and create a human-agreed topic branch through git-ai.
- Confirm mode, scope, exclusions, target, optional base, checkpoint policy, and whether accepted security requirements should be included.
- Confirm no existing unrelated staged paths.
- Confirm the worktree outside the future run directory matches the selected target/snapshot.

Do not start until the human confirms this run contract.

### 2. Pin inputs

Collect and verify:

- Full target commit SHA and optional base SHA.
- Accepted threat-model revision, source commit, and SHA-256.
- Optional accepted security-requirements revision, source commit, and SHA-256.
- Diff file/hash and changed-file inventory when applicable.
- Primary orchestrator model identifier.
- Source commit and SHA-256 for this skill plus every phase skill, invocation prompt, and output template used by the run.

Read accepted intent from pinned Git objects, not potentially modified working files.

Create the run directory and write [run-manifest.template.md](run-manifest.template.md) as `manifest.md` with `Status: In progress`. Record all inputs before launching any sub-agent.

### 3. Run Sol iteration 1

Read `../security-review/sol-analysis.prompt.md`. Launch a fresh `generalPurpose` Task with model `gpt-5.6-sol-medium`, iteration `1`, and the exact pinned contract.

On success:

- Verify `iteration-1/security-review.md` is `Complete`.
- Compute and record its SHA-256.
- Record Task ID, timestamps, attempt count, result counts, and status in the manifest.

### 4. Run Opus iteration 1

Read `../adversarial-review/opus-critique.prompt.md`. Launch a fresh `generalPurpose` Task with model `claude-opus-5-thinking-high`, iteration `1`, and the verified Sol 1 path/hash.

Verify completeness, hash the output, and update the manifest.

Pause here when required by checkpoint policy.

### 5. Run Sol iteration 2

Re-verify all pinned inputs and iteration 1 hashes.

Launch a fresh Sol Task with:

- Iteration `2`.
- Iteration 1 Sol and Opus paths/hashes.
- Otherwise unchanged run inputs.

Verify completeness, hash the output, and update the manifest.

### 6. Run Opus iteration 2

Re-verify all pinned inputs and prior artefact hashes.

Launch a fresh Opus Task with:

- Iteration `2`.
- Current Sol 2 path/hash.
- Iteration 1 Sol and Opus paths/hashes.
- Otherwise unchanged run inputs.

Verify completeness, hash the output, and update the manifest. This is the final automated adversarial pass.

Pause here when required by checkpoint policy.

### 7. Consolidate

Read and follow `../security-consolidation/SKILL.md` in the primary orchestrator context. Use `../security-consolidation/consolidation.prompt.md` with all four verified paths/hashes.

Verify `findings.md` is `Complete`, compute its SHA-256, and record candidate/status/severity counts plus source-accounting totals.

Do not launch another Task for consolidation.

### 8. Complete and present the run

Re-verify all inputs and outputs. Update the manifest:

- `Status: Complete`.
- Completion timestamp.
- Every phase status and hash.
- Findings hash and counts.
- Checkpoint history.
- Retry or interruption history.
- Zero unaccounted source items.

Present:

- Run directory.
- Findings counts by status and severity.
- Pre-existing and prior-acceptance reconsideration counts.
- Unresolved disagreements and human decisions.
- Material scope limitations.

Tell the human that findings are non-governing and require the separate `security-design` workflow.

### 9. Human review and optional commit

Wait for the human to review the run through IDE diffs.

Only after explicit commit authorization:

- Read and follow `.cursor/skills/git-ai/SKILL.md`.
- If the index contains unrelated paths, stop and ask the human to handle them.
- Stage and commit the explicit `/security/reviews/<run-id>/` paths with the human-approved message.

Do not modify the completed manifest to record later commit authorization; the Git commit is the publication record. After a successful authorized commit, ask separately whether to push. Do not invoke security design automatically.

## Resume and failure handling

- Read `manifest.md` and verify every recorded input and completed output hash.
- Resume at the first incomplete phase only.
- Never rerun or overwrite a completed phase.
- Resume a failed phase once with the same Task ID when available and identical inputs; record both attempts.
- A pre-attempt blocker or first-attempt failure is `Blocked — retryable` when inputs remain valid. A second failed attempt is `Blocked — terminal`; preserve the run and start a new run ID if another attempt is desired.
- If a completed artefact or pinned input changed, mark the run `Aborted`; do not repair history in place.
- On unrecoverable model or tool failure, set the applicable retryable or terminal Blocked status and stop. On input/hash mismatch, set `Status: Aborted`; changed inputs require a new run.
- An `Aborted` or `Blocked` run remains audit evidence if the human chooses to commit it, but cannot feed security design as a completed run.

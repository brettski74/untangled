# Security Review Run Manifest

Status: In progress
Run ID:
Created:
Completed: Not completed
Primary orchestrator model:
Pipeline skill source commit:
Pipeline skill SHA-256:

## 1. Run contract

| Field | Value |
| --- | --- |
| Review mode | Full review / Diff-aware |
| Review scope |  |
| Explicit exclusions |  |
| Checkpoint policy | End only / After iteration 1 / Before consolidation / Both |
| Topic branch |  |
| Human confirmation |  |

## 2. Repository snapshot

| Input | Pinned value |
| --- | --- |
| Repository root |  |
| Target commit |  |
| Base commit | Not applicable |
| Initial implementation worktree state |  |
| Diff path | Not applicable |
| Diff SHA-256 | Not applicable |
| Changed-file inventory | Not applicable |
| Changed-file inventory SHA-256 | Not applicable |
| Supplied-diff provenance | Not applicable |
| Allowed working-tree changes | This run directory only / Supplied changed-file snapshot plus this run directory |

## 3. Accepted intent

| Input | Path | Revision | Source commit | SHA-256 |
| --- | --- | --- | --- | --- |
| Threat model |  |  |  |  |
| Security requirements | None | None | None | None |

## 4. Pipeline toolchain snapshot

<!-- Record every instruction/template file used by this run. -->

| Component | Path | Source commit | SHA-256 |
| --- | --- | --- | --- |
| Pipeline skill |  |  |  |
| Run-manifest template |  |  |  |
| Sol skill |  |  |  |
| Sol invocation prompt |  |  |  |
| Sol output template |  |  |  |
| Opus skill |  |  |  |
| Opus invocation prompt |  |  |  |
| Opus output template |  |  |  |
| Consolidation skill |  |  |  |
| Consolidation invocation prompt |  |  |  |
| Findings template |  |  |  |

## 5. Changed-file snapshot

<!-- Diff-aware supplied-diff mode only; otherwise state Not applicable. -->

| Path | State | SHA-256 |
| --- | --- | --- |
|  | Modified / Added / Deleted |  |

## 6. Phase ledger

| Phase | Model | Task ID | Attempts | Status | Output | SHA-256 | Started | Completed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sol iteration 1 | GPT-5.6 Sol Medium |  | 0 | Pending | iteration-1/security-review.md | Pending |  |  |
| Opus iteration 1 | Claude Opus 5 Thinking High |  | 0 | Pending | iteration-1/adversarial-review.md | Pending |  |  |
| Sol iteration 2 | GPT-5.6 Sol Medium |  | 0 | Pending | iteration-2/security-review.md | Pending |  |  |
| Opus iteration 2 | Claude Opus 5 Thinking High |  | 0 | Pending | iteration-2/adversarial-review.md | Pending |  |  |
| Consolidation | Primary orchestrator | Not applicable | 0 | Pending | findings.md | Pending |  |  |

Phase status:

- `Pending`
- `In progress`
- `Complete`
- `Failed`
- `Blocked — retryable`
- `Blocked — terminal`

## 7. Attempt and interruption log

| Timestamp | Phase | Attempt | Task ID | Event | Result or blocker |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  | Started / Resumed / Failed / Completed / Interrupted |  |

## 8. Input-integrity verification log

| Timestamp | Before phase | Repository and diff | Accepted intent | Prior artefacts | Result |
| --- | --- | --- | --- | --- | --- |
|  |  | Match / Mismatch | Match / Mismatch | Match / Mismatch / Not applicable | Continue / Abort |

## 9. Checkpoint history

| Timestamp | Checkpoint | Evidence presented | Human decision | Result |
| --- | --- | --- | --- | --- |
|  | After iteration 1 / Before consolidation |  | Continue / Stop / New run required |  |

## 10. Findings summary

Findings path: `findings.md`
Findings SHA-256: Pending

Candidate status counts:

- Supported:
- Supported with disagreement:
- Candidate — validation needed:
- Human decision required:

Severity counts:

- Critical:
- High:
- Medium:
- Low:
- Informational:

Review-context counts:

- Pre-existing:
- Prior-acceptance reconsiderations:
- Unresolved disagreements:
- Human decisions:
- Unaccounted source items:

## 11. Run outcome

### Scope limitations

- None identified

### Blocker or abort reason

- Not applicable

### Retry state

- Not applicable / Retryable before first attempt / One retry remaining / Attempts exhausted — terminal

### Resume point

- Not applicable

### Next workflow

- On Complete: Human review and optional commit, then separately invoke `security-design`.
- On `Blocked — retryable`: Resolve the recorded blocker and resume only with identical pinned inputs and remaining attempt budget.
- On `Blocked — terminal`: Preserve the run and start a new run ID if another attempt is desired.
- On Aborted: Start a new run ID; do not rewrite completed evidence.

## 12. Completion checks

- [ ] Run contract was human-confirmed before launch.
- [ ] Repository outside the run directory, diff, changed files, accepted intent, and toolchain are pinned and hash-verified.
- [ ] Exactly two Sol and two Opus outputs are Complete.
- [ ] Every phase used its required model and prompt contract.
- [ ] Every completed output hash matches the phase ledger.
- [ ] Consolidation ran in the primary orchestrator context.
- [ ] Findings are Complete and have zero unaccounted source items.
- [ ] Checkpoint and retry history is complete.
- [ ] No generated evidence is represented as governing architecture intent.

Set `Status: Complete` and the completion timestamp only when every applicable check passes. Use `Status: Blocked — retryable`, `Status: Blocked — terminal`, or `Status: Aborted` with an explicit reason otherwise. Commit authorization occurs after completion and is recorded by Git, not by modifying this manifest.

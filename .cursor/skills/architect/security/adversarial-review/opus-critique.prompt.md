# Opus adversarial-review invocation

Launch a fresh `generalPurpose` Task sub-agent for each iteration with model `claude-opus-5-thinking-high`. Instruct it to read and follow:

```text
<repository-root>/.cursor/skills/architect/security/adversarial-review/SKILL.md
```

Use this prompt shape:

```text
Read and follow <repository-root>/.cursor/skills/architect/security/adversarial-review/SKILL.md.

Repository root: <absolute-path>
Run ID: <collision-resistant-run-id>
Run directory: <absolute-path>/security/reviews/<run-id>
Iteration: <1-or-2>
Assigned model: claude-opus-5-thinking-high
Review mode: <full-review-or-diff-aware>
Review scope: <systems-components-endpoints-or-change>
Explicit exclusions: <exclusions-or-none>

Pinned inputs:
- Repository commit: <full-commit-sha>
- Base ref: <ref-or-not-applicable>
- Target ref: <ref-or-not-applicable>
- Diff hash: <sha256-or-not-applicable>
- Supplied diff path: <path-or-not-applicable>
- Threat model: <absolute-path>
- Threat-model revision: <accepted-revision>
- Threat-model source commit: <full-commit-sha>
- Threat-model SHA-256: <sha256>
- Security requirements: <absolute-path-or-none>
- Security-requirements revision: <accepted-revision-or-none>
- Security-requirements source commit: <full-commit-sha-or-none>
- Security-requirements SHA-256: <sha256-or-none>
- Run manifest: <absolute-path>

Current Sol input:
- Security review: <absolute-path>
- Security-review SHA-256: <sha256>

Iteration history:
- Iteration 1 security review: <absolute-path-or-not-applicable>
- Iteration 1 security-review SHA-256: <sha256-or-not-applicable>
- Iteration 1 adversarial review: <absolute-path-or-not-applicable>
- Iteration 1 adversarial-review SHA-256: <sha256-or-not-applicable>

Write the completed report to:
<run-directory>/iteration-<N>/adversarial-review.md

Do not launch other agents, alter architecture intent, commit, publish, mutate issues, implement fixes, or run consolidation. Return only the output path, critique counts, missed-finding count, unresolved-disagreement count, and blockers or scope limitations.
```

## Invocation checks

- Iteration 1 uses the iteration 1 Sol review as `Current Sol input` and `not-applicable` for all iteration-history fields.
- Iteration 2 uses the iteration 2 Sol review as `Current Sol input` and requires all iteration 1 paths and hashes.
- Reuse the same run ID and unchanged pinned system inputs across both iterations.
- `Assigned model` must match the model the Task was actually launched with. The sub-agent records it for provenance and cannot verify it; supplying a value that does not match what was launched silently falsifies the run evidence.
- Read accepted intent from pinned source commits and verify content hashes.
- Verify the supplied diff and every Sol/Opus artefact against its hash before analysis.
- Do not resume the iteration 1 Task for iteration 2; use a fresh Opus Task with explicit prior artefact paths so each pass has a clear audit boundary.
- A failed or incomplete invocation may be resumed only with identical pinned inputs and output path.

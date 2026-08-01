# Sol security-analysis invocation

Launch a fresh `generalPurpose` Task sub-agent for each iteration with model `gpt-5.6-sol-medium`. Instruct it to read and follow:

```text
<repository-root>/.cursor/skills/architect/security/security-review/SKILL.md
```

Use this prompt shape:

```text
Read and follow <repository-root>/.cursor/skills/architect/security/security-review/SKILL.md.

Repository root: <absolute-path>
Run ID: <collision-resistant-run-id>
Run directory: <absolute-path>/security/reviews/<run-id>
Iteration: <1-or-2>
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

Iteration history:
- Iteration 1 security review: <absolute-path-or-not-applicable>
- Iteration 1 security-review SHA-256: <sha256-or-not-applicable>
- Iteration 1 adversarial review: <absolute-path-or-not-applicable>
- Iteration 1 adversarial-review SHA-256: <sha256-or-not-applicable>

Write the completed report to:
<run-directory>/iteration-<N>/security-review.md

Do not launch other agents, alter architecture intent, commit, publish, mutate issues, or implement fixes. Return only the output path, severity counts, disputed/uncertain count, and blockers or scope limitations.
```

## Invocation checks

- Iteration 1 uses `not-applicable` for all iteration-history paths and hashes.
- Iteration 2 requires both iteration-history paths and their SHA-256 hashes.
- Reuse the same run ID and pinned inputs across both iterations.
- Do not paste an unpinned live diff into only one iteration.
- Read accepted intent from the pinned source commit, not from potentially modified working-tree content, and verify its content hash.
- Verify the supplied diff and prior artefacts against their hashes before analysis.
- Do not resume the iteration 1 Task for iteration 2; use a fresh Sol Task with explicit prior artefact paths so each pass has a clear audit boundary.
- A failed or incomplete invocation may be resumed only with identical pinned inputs and output path.

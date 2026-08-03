# Security-consolidation invocation

Run this phase in the primary Cursor Auto/orchestrator context. Do not launch another Task. Read and follow:

```text
<repository-root>/.cursor/skills/architect/security/security-consolidation/SKILL.md
```

Use this invocation block:

```text
Read and follow <repository-root>/.cursor/skills/architect/security/security-consolidation/SKILL.md.

Repository root: <absolute-path>
Orchestrator model: <model-identifier>
Run ID: <collision-resistant-run-id>
Run directory: <absolute-path>/security/reviews/<run-id>
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

Review evidence:
- Iteration 1 security review: <absolute-path>
- Iteration 1 security-review SHA-256: <sha256>
- Iteration 1 adversarial review: <absolute-path>
- Iteration 1 adversarial-review SHA-256: <sha256>
- Iteration 2 security review: <absolute-path>
- Iteration 2 security-review SHA-256: <sha256>
- Iteration 2 adversarial review: <absolute-path>
- Iteration 2 adversarial-review SHA-256: <sha256>

Write the completed consolidation to:
<run-directory>/findings.md

Do not launch agents, perform another security-analysis pass, alter architecture intent, commit, publish, mutate issues, refine tickets, or implement fixes. Return only the output path, candidate counts, disagreement/human-decision counts, source-accounting totals, and blockers.
```

## Invocation checks

- Use the same run ID and unchanged system inputs as both review iterations.
- Verify accepted intent from pinned source commits and content hashes.
- Verify the supplied diff and all four review artefacts against their hashes.
- Require all four review artefacts to be `Complete`.
- A failed or incomplete consolidation may resume only with identical pinned inputs, orchestrator model, and output path.

# Untangled Security Architecture Workflow

This directory defines the project’s AI-assisted security architecture workflow. It behaves as a lightweight virtual security team:

- Claude Opus 5 Thinking High: threat modeller, adversarial auditor, and interactive security designer.
- GPT-5.6 Sol Medium: implementation-level security analyst and exploitability reasoner.
- Cursor Auto primary agent: pipeline orchestrator and neutral evidence consolidator.
- Human: final authority for scope, risk, design, acceptance, commits, and publication.

## Artefact classes

### Durable governing intent

Created only by explicit interactive architect security skills:

```text
architecture/security/
  threat-model.md
  security-requirements.md
```

A working file with `Status: Draft` is non-governing. Its latest committed `Accepted` revision remains governing until the human accepts and authorizes a new commit.

### Non-governing review evidence

Created only when the security-review pipeline is invoked:

```text
security/reviews/<run-id>/
  manifest.md
  inputs/
  iteration-1/
    security-review.md
    adversarial-review.md
  iteration-2/
    security-review.md
    adversarial-review.md
  findings.md
```

Review evidence is version-controlled for traceability but never becomes architecture intent automatically. `findings.md` contains candidate recommendations.

### Skill templates

Files under `.cursor/skills/architect/security/` are instructions and empty templates. Installing these skills does not create either artefact directory.

## Standard end-to-end workflow

### 1. Threat model

Start a dedicated primary-agent chat using Claude Opus 5 Thinking High and explicitly invoke `threat-model`.

The skill:

- Inspects existing architecture and implementation evidence.
- Interviews the human about assets, actors, trust boundaries, authentication, data, integrations, tenancy, abuse, and risk.
- Writes `architecture/security/threat-model.md` as Draft.
- Stops for human review.
- Commits only after explicit content acceptance and commit authorization.

Threat modelling is separate from the automated pipeline.

### 2. Security-review pipeline

After the accepted threat model is committed, start a dedicated primary Cursor Auto chat and explicitly invoke `security-pipeline`.

Choose:

- Full review or diff-aware review.
- Scope and exclusions.
- Review target and optional base.
- Optional human checkpoints.

The pipeline runs exactly:

```text
Sol iteration 1
→ Opus iteration 1
→ Sol iteration 2
→ Opus iteration 2
→ Cursor Auto consolidation
```

The pipeline writes one immutable run directory, stops for human review, and commits it only with explicit authorization.

Do not normally invoke `security-review`, `adversarial-review`, or `security-consolidation` directly. They are reusable internal phases exposed separately for auditable resume and diagnosis.

### 3. Security design

After the completed review run is reviewed and committed, start a dedicated primary-agent chat using Claude Opus 5 Thinking High and explicitly invoke `security-design`.

The skill:

- Reads committed findings and accepted threat intent.
- Works through findings and disagreements with the human.
- Records accepted requirements, deferrals, accepted risks, rejections, and validation needs.
- Writes `architecture/security/security-requirements.md` as Draft.
- Assigns stable `SEC-<DOMAIN>-NNN` IDs.
- Produces a proposed issue-refinement handoff in chat.
- Commits only after explicit content acceptance and commit authorization.

Security design does not mutate GitHub issues or invoke refinement automatically.

### 4. Refine implementation issues

Invoke the normal refinement workflow for each implementation issue. Put the relevant stable security requirement IDs and required outcomes into ticket scope.

The independent `change-review` architect gate reads committed threat and security-requirement intent and challenges omissions or conflicts.

### 5. Implement and review code

Use the normal implementation workflow. During implementation, Cursor’s built-in `/review-security` is useful for tactical branch or uncommitted-diff review.

`/review-security` complements this architecture pipeline; it does not replace threat modelling, adversarial model dialogue, durable findings, or security design.

## Typical use cases

### Initial security baseline

1. Run and commit `threat-model`.
2. Run `security-pipeline` in full-review mode over the current system.
3. Review and commit the run evidence.
4. Run and commit `security-design`.
5. Refine implementation issues from accepted requirement IDs.

### Authentication architecture and hardening

1. Ensure the threat model covers identity, sessions, authorization, browser/server boundaries, secrets, recovery, and abuse.
2. Run a full or auth-scoped pipeline review.
3. Use `security-design` to decide token/session, key, revocation, browser, audit, and operational requirements.
4. Refine the security-architecture work in issue #67 against accepted requirements.
5. Refine focused hardening work such as issue #33 against the applicable requirement IDs.

Candidate findings alone are not implementation requirements.

### Significant feature or architecture change

1. Re-run `threat-model` first if assets, actors, boundaries, assumptions, or threat priority changed.
2. Run `security-pipeline` in diff-aware mode against committed base and target SHAs.
3. Commit the review evidence after human review.
4. Run `security-design` only when findings require new, revised, deferred, or retired requirements.

### Tactical code-change review

Use Cursor `/review-security` when:

- The target is only a branch or uncommitted diff.
- No durable threat-model or requirement update is expected.
- A fast implementation-level review is sufficient.

Escalate to the full pipeline when the change affects authentication, authorization, tenancy, sensitive data, trust boundaries, external integrations, deployment security, or accepted risk.

### Reassessing old weaknesses

Full and diff-aware pipeline runs report pre-existing weaknesses found within scope. Previous acceptance is not an exemption. The review checks whether old rationale, assumptions, compensating controls, and security practice still apply.

Use `security-design` to continue, revise, or revoke prior acceptance.

## Re-run triggers

Reassess the threat model and/or run the pipeline after:

- Authentication, session, authorization, or privileged-access changes.
- New tenancy or isolation requirements.
- New or materially changed sensitive data.
- New integrations, protocols, webhooks, or trust boundaries.
- Material deployment, key-management, secret-management, or operational-access changes.
- Significant dependency, execution, file-processing, or outbound-request capabilities.
- A security incident, material vulnerability, changed security practice, or invalidated assumption.
- A human decision to revisit accepted risk.

## Human gates

The workflow requires human authority at these boundaries:

- Threat-model scope, assumptions, risk priorities, acceptance, and commit.
- Pipeline scope, exclusions, checkpoints, evidence review, and commit.
- Security-design controls, deferrals, accepted risks, rejection, validation, acceptance, and commit.
- Issue refinement and implementation authorization.
- Push and pull-request publication.

No skill should infer approval from silence or from “looks plausible.”

## Git and branch behavior

- Work on a non-default topic branch.
- During a pipeline run, the worktree outside the active run directory must continue to match the pinned target and any explicitly supplied diff snapshot.
- Draft governing files are edited directly so Cursor’s diff UI shows proposed changes.
- The latest committed `Accepted` intent remains governing while a Draft is uncommitted.
- Review runs are immutable after completion; corrections require a new run.
- Skills use git-ai scripts for covered operations.
- Commits, pushes, and pull requests require explicit human authorization.

## Interrupted or failed runs

- Threat-model or security-requirements Draft: resume the uncommitted working file or discard only with human confirmation.
- Pipeline `In progress`: verify manifest hashes and resume the first incomplete phase.
- Pipeline `Blocked — retryable`: resolve the blocker and resume only with unchanged inputs and remaining attempt budget.
- Pipeline `Blocked — terminal`: both allowed attempts are exhausted; preserve the run and use a new run ID for any further attempt.
- Pipeline `Aborted`: preserve the audit record if useful and start a new run ID.
- Changed completed output or pinned input: abort; never repair evidence history in place.

Only `Complete`, committed review runs may feed `security-design`.

## Skill index

- [Threat model](threat-model/SKILL.md)
- [Security pipeline](security-pipeline/SKILL.md)
- [Sol security review](security-review/SKILL.md)
- [Opus adversarial review](adversarial-review/SKILL.md)
- [Security consolidation](security-consolidation/SKILL.md)
- [Security design](security-design/SKILL.md)

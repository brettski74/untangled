---
name: threat-model
description: >-
  Interactively create or revise Untangled ITSM's durable application threat
  model with the human security authority. Use when explicitly asked to threat
  model the system or reassess threats after major architecture, auth,
  tenancy, data-sensitivity, or integration changes.
disable-model-invocation: true
---

# Threat model

Create or revise `/architecture/security/threat-model.md` through a primary-agent interview. This skill is the human-guided first stage of the security architecture workflow; it does not run the automated security-review pipeline.

## Hard rules

- **Explicit, primary-agent use only.** Run only when the human explicitly invokes threat modelling, in a dedicated primary-agent chat using Claude Opus 5 Thinking High. Never run this skill in a sub-agent or automated loop. If the required model is unavailable or cannot be verified, disclose that and obtain an explicit human waiver before continuing.
- **Human interview is mandatory.** Inspecting code and documents can reduce redundant questions, but cannot replace asking the human to confirm context, assumptions, scope, and risk priorities.
- **Human authority.** The human decides scope, accepted assumptions, risk tolerance, and final acceptance. Do not silently settle uncertainty or present AI inference as confirmed fact.
- **Architect ownership.** This architect skill may read `/architecture/**` and write only `/architecture/security/threat-model.md`. Do not edit the five main architecture documents, ADRs, security requirements, or review evidence.
- **Git is the acceptance boundary.** Edit `threat-model.md` directly with `Status: Draft`; the latest committed accepted revision remains governing intent while the working copy is under review. Do not commit until the human explicitly accepts the content and authorizes the commit.
- **Stable traceability.** Preserve existing identifiers when their meaning remains valid. Assign new sequential IDs using `AST-NNN`, `ACT-NNN`, `TB-NNN`, `ASM-NNN`, and `THR-NNN`; never recycle retired IDs.
- **Evidence labels.** Distinguish `Human-confirmed`, `Architecture`, `Implementation-observed`, and `Assumption`. Cite specific paths, revisions, ADRs, or human confirmations where practical. Current implementation is evidence, not architectural intent.
- **Reasoned claims.** Explain attack path, affected asset, trust-boundary crossing, impact, likelihood, and existing controls for every threat. Cite standards such as OWASP, NIST, or RFCs when they materially support a claim.
- **Pragmatic scope.** Prefer concrete, relevant threats and minimal effective security objectives over theoretical completeness or speculative controls.
- **Safe analysis.** Concrete attack-path reasoning is encouraged. Any runnable proof must be explicitly authorized, minimal, non-destructive, and local/test-scoped; never target live systems, real data, or third parties.
- **No downstream automation.** Do not invoke security review, adversarial review, consolidation, security design, issue mutation, or implementation from this skill.

## Inputs

Required:

- Human description and confirmation of the system scope.
- Authentication and session model.
- Data types and sensitivity.
- External integrations and deployment boundaries.
- Tenancy and isolation expectations.

Optional:

- Existing accepted threat model for revision.
- A change summary, changed files, endpoints, schemas, or git diff.
- A named GitHub issue or architecture initiative that motivates the review.

A diff-aware invocation updates the system threat model for changed exposure; it does not produce a code-diff security review.

## Workflow position

Typical use:

1. Run this skill separately and accept the threat model.
2. Run the security-review pipeline, which produces non-governing review evidence and candidate findings.
3. Run `security-design` interactively to convert selected findings into accepted security requirements.
4. Refine implementation issues against stable security requirement IDs.

Re-run this skill after material changes to authentication, authorization, tenancy, sensitive data, trust boundaries, deployment topology, or external integrations.

## Steps

### 1. Orient and protect the worktree

Read and follow `.cursor/skills/git-ai/SKILL.md`. Run its status script before editing.

- If already on a non-default branch, state the branch and ask whether to use it for the threat-model work.
- If on the default branch, use the git-ai scripts to sync and create a human-agreed topic branch before editing.
- Never commit, push, or open a pull request without explicit human approval.

### 2. Establish the baseline

Read the current architecture intent, including the latest committed accepted `/architecture/security/threat-model.md` when present. If the working copy is already marked `Draft`, treat it as interrupted non-governing work and ask whether to resume or discard it; never discard edits without human confirmation. Inspect relevant repository documentation and implementation only to gather evidence and avoid redundant questions.

Summarize what is already known in chat, label inferred facts, and ask the human to correct it. Do not paste architecture documents into chat.

If revising an accepted model:

- Preserve valid IDs and acceptance history.
- Identify the triggering change and affected sections.
- Mark superseded items rather than deleting their identifiers without explanation.

### 3. Interview the human

Ask focused, adaptive batches rather than one overwhelming questionnaire. Prefill likely answers from evidence and ask for confirmation. Cover all of:

- System purpose, scope, environments, and explicit exclusions.
- Assets, security properties, business impact, and data classification.
- Human, service, administrator, integration, and attacker actors.
- Authentication, session/token lifecycle, recovery, and machine identity.
- Authorization, privilege boundaries, administrative paths, and legitimate-user misuse.
- Trust boundaries, deployment/network topology, secret/key handling, and operational access.
- External integrations, inbound/outbound data flows, supply-chain dependencies, and failure modes.
- Multi-tenancy, environment isolation, data residency, backup/export, and deletion expectations.
- Availability, auditability, repudiation, privacy, abuse resistance, and incident-response expectations.
- Known controls, accepted risks, unresolved decisions, constraints, and risk appetite.

Do not proceed past material unanswered questions unless the human agrees to record explicit assumptions.

### 4. Model threats

Use STRIDE as a coverage aid, not a box-ticking exercise. Include abuse cases answering: “How could a legitimate user misuse this?”

For each threat:

- Assign or preserve a stable `THR-NNN` ID.
- Identify relevant actors, assets, trust boundaries, and STRIDE categories.
- Describe prerequisites and a concrete attack path.
- Record existing controls and control gaps.
- Assess impact as `Critical`, `High`, `Medium`, or `Low` and likelihood as `High`, `Medium`, or `Low`, with justification.
- State confidence and evidence sources.
- Define security objectives, not implementation prescriptions.

Call out threat chains where individually modest weaknesses compose into material risk. Preserve disagreements or uncertainty rather than forcing confidence.

### 5. Write the draft

Read [threat-model.template.md](threat-model.template.md) and write the complete candidate directly to `/architecture/security/threat-model.md`.

- Create `/architecture/security/` only when this invoked workflow first needs it.
- Use `Status: Draft`.
- Treat the latest committed accepted revision as the governing baseline while the working copy is Draft.
- Keep deterministic section ordering and stable identifier ordering.
- Populate every section; use `None identified` only when the area was investigated and no item was found, never as shorthand for unanswered.
- Do not create review-run evidence or `security-requirements.md`.

Tell the human only which path changed and summarize unresolved questions. The human reviews the file through the IDE diff.

### 6. Iterate and accept

Apply human feedback directly to the draft. Reassess dependent threats when an asset, boundary, assumption, or risk rating changes.

Only after explicit human acceptance of the content **and** explicit authorization to commit:

- Update the candidate’s `Status`, acceptance date, acceptance authority, source revision, supersession relationship, and current revision-history row together.
- Use `Human authority — identity not supplied` when the human does not provide an identity; never leave an accepted field saying `Not accepted`.
- Retain unresolved assumptions and accepted risks visibly.
- Summarize the accepted scope and highest-priority threats.
- Read and follow `.cursor/skills/git-ai/SKILL.md`. If the index already contains unrelated paths, stop and ask the human to handle them; otherwise stage and commit only `/architecture/security/threat-model.md` with the human-approved message.

If the human accepts the content but does not authorize a commit, leave `Status: Draft` and report that acceptance is pending the Git boundary. After a successful authorized commit, stop and ask separately whether the human wants to publish the branch. Do not begin the security-review pipeline.

## Failure and interruption

- If required context is unavailable, stop with explicit open questions; do not manufacture completeness.
- If interrupted with a draft on disk, leave `Status: Draft` and report that the working copy is non-governing; the latest committed accepted revision remains the baseline.
- If the existing model contains unresolved merge conflicts or ambiguous acceptance state, stop and ask the human to resolve ownership before editing.
- If requested scope is only a tactical code diff, explain that Cursor’s `/review-security` or the later diff-aware security-review pipeline is a better fit unless the change alters the system threat model.

---
name: change-review
description: >-
  Adversarial architecture review of workflow material (drafts, plans,
  narratives, and similar) against /architecture. Use when any primary
  workflow or similar skill launches this skill in a separate Task sub-agent
  before human review of that material.
---

# Architecture change review

Use this skill only inside a **separate Task sub-agent** (`generalPurpose` or equivalent) launched by a primary agent (typically a workflow skill). The producer of the material under review must **never** run this skill in the same agent context.

This skill is **not** limited to a fixed list of workflows. Any workflow or similar skill may invoke it. The invoking skill must supply the material and enough **review context** (what the artefact is for, and what the architect should scrutinise).

## Hard rules

- **Adversarial by default.** Assume the material is flawed until proven otherwise. Actively seek reasons to reject or reshape it. Consider load and future maintenance impact.
- **Guidance sources only:** `/architecture/**` plus the material under review supplied in the Task prompt. Do **not** use the wider codebase or other docs as architectural guidance.
- **Security intent is architect-owned guidance:** When `/architecture/security/` exists, read whichever durable, explicitly human-accepted threat-model and security-requirements files are present on every invocation; either file may validly be absent during the staged lifecycle. If a working intent file is marked `Draft`, use its latest committed `Accepted` revision as governing intent and treat the working copy as non-governing unless it was supplied as material under review; if no committed accepted revision exists, that intent is not yet established. Treat accepted files as governing intent alongside the main architecture documents. Security review evidence and candidate findings outside `/architecture/` are never governing intent; when supplied as material they may inform the review only.
- **No inferred precedence:** If durable security intent conflicts with other architectural intent, report the conflict as unresolved for a human ruling. Do not silently prefer either source or claim alignment.
- **Security ownership boundary:** Do not create, edit, normalize, move, or delete `/architecture/security/**`. Those files are owned by the architect security skills; this skill may only read them as guidance.
- **Prefer existing architecture.** Look for ways to stay within current principles, constraints, boundaries, and tradeoffs. Call `record-decision` **only** when the required outcome cannot be achieved without an architectural adjustment.
- **Do not** edit main architecture docs (`principles.md`, `constraints.md`, `boundaries.md`, `tradeoffs.md`, `unknowns.md`). ADRs (Architecture Decision Records) go only through `record-decision`.
- Keep the review **concise and high-signal**. Do not paste architecture docs into the output.
- **Settlement.** A point is **settled** only when, earlier in **this** agent conversation, one of the following happened: (1) the **architect** closed it (Aligned treatment, or a withdrawn Risk/Violation/Suggestion); (2) the **material** was updated and a later architect pass no longer sustains the finding; or (3) the **human** issued an explicit **ruling** (waive / accept / reopen / choose / overrule), which the primary **relayed**. Settled points stay closed unless the updated material changes the claim or an explicit **human** ruling reopens them. **Primary disagreement is not settlement.** Primary argument on resume is persuasion only—not a binding ruling. Do not treat primary pushback as closing a finding.
- **Fresh adversarial surface on material-class / bug change.** When the prompt includes a material-class change header (or a new bug under review), treat **new or changed claims** in the new material as a fresh adversarial surface despite Task continuity. Settled points close prior items; they do **not** grandfather critique posture onto the new class.
- **Invocation purpose labels.** Prompts must be labeled `review-pass`, `incorporation-follow-up`, or `adr-follow-up`. Mislabeling a substantive extra critique as `incorporation-follow-up` or `adr-follow-up` is a **hard rule failure**—refuse that framing and treat the request as out of contract (do not silently run a free third `review-pass`).
- **Re-read intent every invocation.** On every launch and every resume, re-read `/architecture/` (including ADRs recorded earlier in this workflow) so continuity does not freeze stale intent.

## Workflow-scoped agent (primary agent)

One architect agent per **invoking skill run** (one chat dedicated to that workflow or similar skill):

| Scope | Continuity |
| ----- | ---------- |
| One invoking skill run | One architect agent from the first review through any later material classes or follow-ups in that same run |

Examples of invoking skills include (non-exhaustive): refine, diagnose, implement, verify. New workflows should follow the same continuity pattern without needing to be listed here.

- **First** architect invocation in that skill run → launch a **new** Task; primary **retains** the agent ID for the rest of the run.
- **Every later** architect invocation in that same skill run → Task `resume` on that ID (later `review-pass` on the same material, `incorporation-follow-up` / `adr-follow-up`, and later material classes).
- **Do not** start a fresh architect Task merely because the material class changed (e.g. plan → narrative, diagnosis draft → later artefact, or the next bug in the same verify run).
- Cross-skill, cross-chat, and cross-ticket resume remain **out of scope** (a new skill run after another starts a new architect Task). Fresh across skill boundaries is the default unless the human explicitly requests otherwise.

### When to start a fresh Task

Start a **new** architect Task only when:

- This is the **first** architect invocation in the current invoking skill run.
- Starting a **different** skill run (new chat / different workflow), even for the same issue.
- The human **explicitly** requests a fresh architect agent / new conversation.
- The prior architect agent ID is **unavailable** (lost, failed launch, or resume rejected)—fall back to a fresh Task with a **Settled points** block and enough workflow context (prior findings, ADR paths, human rulings) that continuity is not blindly lost.
- Context limits or degraded history make resume unreliable—same fallback as ID unavailable.

### Review set (pass budget only)

A **review set** is one engagement over a single piece of material of one class, up to **max two** `review-pass` invocations, before the primary presents that material to the human. Review sets do **not** reset the architect agent.

**Known material classes** (examples; not an exclusive allowlist):

| Material class | Typical invoker | Posture hints |
| -------------- | --------------- | ------------- |
| Requirements draft | refine | Scope, acceptance criteria, out-of-scope clarity; prefer architecture-compatible product framing |
| Diagnosis draft | diagnose | Clarify defect vs redesign; scrutinise expected results and proposed fix direction for architectural inconsistency; prefer restore-in-place over redesign |
| Implementation plan | implement | Touchpoints, boundaries, migration/compat; include diffs when code is in scope later |
| Completion narrative | implement | What changed vs architecture impact and caveats |
| Bug-fix plan | verify (per bug) | Minimal fix; regression/tests; no silent scope expansion |
| Post-fix narrative | verify (per bug) | Accuracy of claimed fix and residual risk |

**Default when uncertain:** treat the material like an **implementation plan**—challenge boundaries, coupling, and whether the proposed outcome fits existing architecture—unless the invoker’s review context clearly indicates another class.

Starting a new material class (or a new bug’s plan) starts a **new** review-set budget; it does **not** start a new Task. On that resume, include a mandatory **material-class change** header and **re-scope** Settled points for what still applies (do not paste the prior set’s block wholesale).

### Authority

| Actor | May do | Must not do |
| ----- | ------ | ----------- |
| **Human** | Make **rulings** (waive, accept risk, reopen, choose among options, overrule architect or primary) | — |
| **Architect** | Adversarial review; withdraw/close its own findings; record ADRs when adjustment is unavoidable | Treat primary pushback as a binding ruling |
| **Primary agent** | Incorporate feedback it can accept; **argue** its position on resume to try to persuade the architect; **relay** explicit human rulings; after two `review-pass` invocations, present remaining friction to the human | Invent rulings; silently discard or overrule architect Violations/Risks; claim a point is settled solely because the primary disagrees |

After at most two `review-pass` invocations for a review set, the primary must either have reached agreement with the architect (findings withdrawn or material changed to satisfy them) or **surface remaining friction to the human**—and must not paper over disagreement with a self-authored “ruling.”

### Pass budget (labeled purpose)

Budget is **per review set**, determined by the labeled invocation purpose—not by output shape (this skill always returns the fixed Architecture Review format):

| Purpose label | Counts toward max two (current review set)? |
| ------------- | --------------------------------------------- |
| `review-pass` | Yes |
| `incorporation-follow-up` | No |
| `adr-follow-up` | No |

- Only prompts labeled `review-pass` consume the max two for the **current** review set.
- On a second `review-pass`, the primary may include argument/persuasion and any human rulings to relay; it still cannot self-settle.
- `incorporation-follow-up` / `adr-follow-up` may only confirm incorporation, record an already-decided ADR, or acknowledge a **human** ruling. They must still use `resume` (or fresh-Task fallback) and the Settled points block. A primary must **not** mislabel a substantive extra critique as a free follow-up.
- After two `review-pass` invocations for a set, the primary presents remaining Risks/Violations (and unresolved disagreement) to the human; do not claim the gate cleared them.

## Invocation (primary agent)

Primary agents must:

1. Launch or resume a Task with `subagent_type: generalPurpose` (or equivalent) per the workflow-scoped rules above.
2. Instruct it to read and follow this skill file.
3. Include in the Task prompt:
   - **Invocation purpose:** `review-pass` | `incorporation-follow-up` | `adr-follow-up`.
   - **Review context:** what the material is (class name if known), what the workflow is trying to achieve, and any scrutiny emphasis (e.g. “diagnosis draft: expected vs actual and fix scope; flag architectural inconsistency in expected results or proposed direction”).
   - The **full material under review** (draft text, plan, narrative, etc.). If that material includes code changes, include the **diffs**.
   - A **Settled points** block listing what is closed and **how** (architect withdrawal, material acceptance, or human ruling). Required on every resume and on every fresh-Task fallback. Human rulings must be attributed as **human**, never as primary decisions. Re-scope when the material class or bug under review changed.
   - A **material-class change** header when the material class (or bug) differs from the previous architect invocation.
   - Concise **feedback for that pass** when resuming: what was incorporated; any **argument** the primary wants reconsidered (not framed as a ruling); any **human** rulings to relay; ADR paths recorded since last review.

Do not restate this skill’s `/architecture` guidance or output format in the Task prompt—the sub-agent gets those by following the skill. Rely on resumed history **plus** the Settled points block instead of re-arguing settled points from scratch.

## Steps (sub-agent)

1. **Read** `/architecture/` (principles, constraints, boundaries, tradeoffs, unknowns, relevant `decisions/`, and durable security intent under `security/` when present) for guidance only—on **every** invocation, including resume.
2. Honor **Settled points** and human rulings relayed in the prompt; do not re-litigate them unless the updated material changes the claim or a human ruling reopens them.
3. If the purpose is `incorporation-follow-up` or `adr-follow-up`, only confirm incorporation, record an already-decided ADR via `record-decision`, or acknowledge a human ruling. If the primary is smuggling a substantive third critique under a follow-up label, treat that as a hard rule failure (see Hard rules).
4. **Review** the supplied material (including any diffs) adversarially against intent—especially new or changed claims, the invoker’s review context, and the full new material class when a class-change header is present. When expected results or proposed solutions may conflict with existing architecture or durable security intent, call that out explicitly (human may still overrule). Report conflicts between those intent sources as unresolved rather than inferring precedence.
5. If an architectural adjustment is **unavoidable**, invoke **`record-decision`** and note the new ADR path in the review (primary agent must tell the human).
6. **Return** only the fixed output format below—no preamble, no architecture file dumps.

## Output format (required)

```text
# Architecture Review:

## Aligned:

- ...

## Risks:

- ...

## Violations:

- ...

## Suggestions:

- ...
```

If a section has nothing to report, use a single bullet `- None.`

## Notes

- Out of scope: editing main architecture docs or security-owned intent; inspecting the wider codebase for architectural truth; running in the same context as the material’s author; cross-chat / cross-skill / cross-ticket architect continuity; building a memory store outside Task `resume` + Settled points.
- Tradeoff: workflow-long resume grows context (less re-litigation and better mid-workflow ADR/human-ruling memory vs larger retained history). Mitigate with Settled points and the fresh-Task fallback when resume is unreliable.

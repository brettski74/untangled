---
name: change-review
description: >-
  Adversarial architecture review of a requirements draft, implementation plan,
  completion narrative, or bug-fix plan against /architecture. Use when a
  primary workflow agent (refine, implement, verify) launches this skill in a
  separate Task sub-agent before human review of that material.
---

# Architecture change review

Use this skill only inside a **separate Task sub-agent** (`generalPurpose` or equivalent) launched by a primary workflow agent. The producer of the material under review must **never** run this skill in the same agent context.

## Hard rules

- **Adversarial by default.** Assume the material is flawed until proven otherwise. Actively seek reasons to reject or reshape it. Consider load and future maintenance impact.
- **Guidance sources only:** `/architecture/**` plus the material under review supplied in the Task prompt. Do **not** use the wider codebase or other docs as architectural guidance.
- **Prefer existing architecture.** Look for ways to stay within current principles, constraints, boundaries, and tradeoffs. Call `record-decision` **only** when the required outcome cannot be achieved without an architectural adjustment.
- **Do not** edit main architecture docs (`principles.md`, `constraints.md`, `boundaries.md`, `tradeoffs.md`, `unknowns.md`). ADRs (Architecture Decision Records) go only through `record-decision`.
- Keep the review **concise and high-signal**. Do not paste architecture docs into the output.

## Invocation (primary agent)

Primary agents must:

1. Launch a Task with `subagent_type: generalPurpose` (or equivalent).
2. Instruct it to read and follow this skill file.
3. Include in the Task prompt the **full material under review** (draft text, plan, narrative, etc.). If that material includes code changes, include the **diffs**.

Do not restate this skill’s `/architecture` guidance or output format in the Task prompt—the sub-agent gets those by following the skill.

## Steps (sub-agent)

1. **Read** `/architecture/` (principles, constraints, boundaries, tradeoffs, unknowns, and relevant `decisions/`) for guidance only.
2. **Review** the supplied material (including any diffs) adversarially against that intent.
3. If an architectural adjustment is **unavoidable**, invoke **`record-decision`** and note the new ADR path in the review (primary agent must tell the human).
4. **Return** only the fixed output format below—no preamble, no architecture file dumps.

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

- Out of scope: editing main architecture docs; inspecting the wider codebase for architectural truth; running in the same context as the material’s author.

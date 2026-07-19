# Principles

High-level design philosophy and invariants for Untangled.

> Claims are **inferred** from `AGENTS.md` / repo docs unless marked **confirmed** by the human architect.

## Product intent

- Untangled is an **enterprise-grade** ITSM platform for large corporate and government bodies — including environments with hundreds to tens of thousands of configuration items — covering asset discovery and tracking, changes, incidents, and event management. *(confirmed)*
- It is **not** a toy or sandbox for developers to play with. Configuration is managed with modern enterprise IT practices (including Git) because that is how serious systems are operated — not because the product is “for developers.” *(confirmed)*
- Configuration, customization, and operations are first-class engineering problems within that enterprise scope. *(confirmed; reframes AGENTS §1 away from “developer-grade”)*
- Target qualities: consistent, performant, Git-driven, scalable, pleasant to use. *(inferred, high)*

## Invariants

1. **Configuration is code** — representable, Git-versioned, branch/review/merge capable, portable across environments; deterministic and diff-friendly. *(confirmed, high — AGENTS §2.1)*
2. **Consistency above all** — workflows, events, CMDB, discovery, and UI config share one mental model. *(inferred, high — AGENTS §2.2)*
3. **Optimize for user laziness** — infer, reuse, default; avoid redundant entry. *(confirmed, high — AGENTS §2.3)*
4. **Performance is a feature** — obvious paths stay fast; optional features (including AI) must not degrade core workflows. *(confirmed, high — AGENTS §2.4)*
5. **Progressive complexity** — UI for non-technical users; Git/code for advanced users; complexity is layered and optional. *(confirmed, high — AGENTS §2.5)*
6. **Safe extensibility** — customizations sandboxed, versioned, observable, fail-safe. *(confirmed, high — AGENTS §2.6)*

## Structural stance

- **Modular monolith first** with strict internal boundaries and an internal event bus; microservices are not the starting point. *(confirmed, high — AGENTS §3.1)*
- **Git is first-class** for configuration; non-Git users get Draft → Review → Publish. *(inferred, high — AGENTS §3.9)*
- **AI assists, never obstructs** — optional; never a performance tax on core paths. *(inferred, high — AGENTS §6)*

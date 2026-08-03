# Prefer Podman for Compose engine selection

## Context

Deployment constraints historically named containerization as “Containerized (Docker).”
Compose bring-up via the root Makefile still defaulted to `docker compose`, which fails on
Podman-only Rocky/RHEL-class hosts unless operators set `COMPOSE` externally. Team intent
for issue #130 is to support either engine, prefer Podman when both are usable, keep an
explicit `COMPOSE` override, and reuse the same precedence for later production
start/shutdown scripts. Leaving that preference undocumented would leave Make/ops defaults
in tension with the Docker-named constraint.

## Decision

OCI/Compose bring-up may use Podman or Docker. When `COMPOSE` is unset and more than one
Compose entrypoint is usable, selection prefers Podman over Docker:

1. `podman compose`
2. `podman-compose`
3. `docker compose`
4. `docker-compose` (legacy last resort)

Docker remains fully supported via fallback when Podman is absent or unusable, and via an
explicit `COMPOSE` override (including CI pins). “Usable” means a successful Compose
entrypoint version/capability probe, not mere binary presence on `PATH`. Wait/readiness
behavior follows capability of the selected engine (e.g. omit `up --wait` when unsupported),
not name-only detection. This decision applies to Makefile and documented ops bring-up
rules; it does not change application runtime, Compose service definitions, or require
Kubernetes/Podman as the sole production orchestrator.

## Alternatives Considered

- **Keep Docker-only / Docker-first defaults.** Rejected: breaks bare `make up` on typical
  Rocky/RHEL Podman-only hosts and forces every operator to set `COMPOSE`.
- **Prefer Docker when both are installed; Podman only as fallback.** Rejected: contradicts
  stated team/ops intent for RHEL/Rocky-class defaults and would still surprise operators on
  dual-engine hosts in the opposite direction.
- **Require an explicit `COMPOSE` always (no auto-detect).** Rejected: unnecessary friction
  for the common single-engine case; override remains available when intentional.

## Consequences

- Constraints wording that names only Docker is superseded for Compose engine *selection*
  by this ADR; containerized deployment and Kubernetes orchestration intent otherwise stand.
- Dual-engine developer machines default to Podman; docs and `COMPOSE` override must make
  Docker-first workflows explicit and easy.
- Future production start/shutdown scripts should reuse the same documented precedence
  rather than inventing a second policy.
- Primary agents must commit this ADR with the work that lands the preference.

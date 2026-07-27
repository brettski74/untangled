# Scripts

Developer utilities for local Untangled setup. Run from the repository root unless noted.

## `reinstall-stack.sh`

Tear down the Compose stack and bring it back up using project Make targets. Matches first-time setup in [`docs/local-development.md`](../docs/local-development.md): `make up` → `make migrate` → `make seed`.

By default this **removes containers and the Postgres volume** (`untangled_pgdata`), then rebuilds and reseeds.

```bash
./scripts/reinstall-stack.sh
```

### Options

| Option | Effect |
| ------ | ------ |
| `--keep-data` | Remove containers only; keep the Postgres volume (same as `make down`) |
| `--with-host-install` | Also run `make install` (backend venv + frontend `npm ci`) |
| `-h`, `--help` | Show usage |

### Environment

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `COMPOSE` | `docker compose` | Compose CLI used for teardown |

### Examples

```bash
# Full reset (containers + DB volume), then up / migrate / seed
./scripts/reinstall-stack.sh

# Restart stack without wiping Postgres data
./scripts/reinstall-stack.sh --keep-data

# Also reinstall host Python and npm dependencies
./scripts/reinstall-stack.sh --with-host-install
```

After a successful run:

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8000

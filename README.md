# Untangled

An enterprise grade ITSM platform, including ITSM, Event Management, Discovery and CMDB capabilities.

## Development

This repository is a monorepo with a Python/FastAPI backend and a React Router v7 SSR frontend.

```bash
make up         # postgres + api + web via Docker Compose (does not migrate)
make migrate    # apply YAML schema intent (intentional; use after up / db-up)
make help       # list all commands
```

See [docs/local-development.md](docs/local-development.md) for setup, ports, smoke tests, and host hot-reload (`make backend-dev` / `make frontend-dev`).
See [docs/class-definitions.md](docs/class-definitions.md) for YAML class definitions, `make models`, and `make migrate`.

# Why?

Several reasons:

1. Fun
2. We believe that the days of large enterprise software vendors are numbered and that they will be replaced in the near future by AI vendors and small internal teams building custom applications instead. AI has lowered the cost of software to the level where paying millions of dollars per year for systems like this may be more expensive than paying a small team of developers and an AI vendor to just build and maintain your own custom application that does exactly what you need instead of compromising on the features that the vendor gives you and the limitations they may have.
3. We have a passionate, burning hatred for BMC Helix. Maybe this goes nowhere. Maybe nobody ever actually uses this. But reasons #1 and #2 still apply. And on the off chance that those things do happen, if we convince our leaders that this is a better bet than paying BMC for the steaming pile of horse-shit that BMC Helix is, then even better.



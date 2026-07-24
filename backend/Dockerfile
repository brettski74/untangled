# Backend API image for Compose (and later Kubernetes-friendly deploys).
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock pyproject.toml README.md ./
COPY class-definitions ./class-definitions
COPY src ./src

# Install the package, then bake Create/Update models into the *installed*
# ``untangled.generated`` tree (not orphaned under /app/src after install).
RUN pip install --no-cache-dir -U pip \
    && pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps . \
    && PYDANTIC_OUT="$(python -c 'from pathlib import Path; import untangled; print(Path(untangled.__file__).resolve().parent / "generated")')" \
    && python -m untangled.mapping \
        --definitions ./class-definitions \
        --pydantic-out "$PYDANTIC_OUT" \
        --zod-out /tmp/zod-generated

EXPOSE 8000

CMD ["uvicorn", "untangled.main:app", "--host", "0.0.0.0", "--port", "8000"]

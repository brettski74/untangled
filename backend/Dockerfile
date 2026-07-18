# Backend API image for Compose (and later Kubernetes-friendly deploys).
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir -U pip \
    && pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps .

EXPOSE 8000

CMD ["uvicorn", "untangled.main:app", "--host", "0.0.0.0", "--port", "8000"]

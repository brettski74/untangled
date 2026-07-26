# Frontend image for Compose (and later Kubernetes-friendly deploys).
# Build context is the repository root (see compose.yaml) so class-definition
# codegen can bake Zod + field meta into the SSR bundle.
#
# Multi-stage: Python ``models-env`` is build-only. The final runtime image is
# Node-only (no Python / mapping tooling shipped).

FROM python:3.12-slim AS models-env
WORKDIR /gen
COPY backend/requirements.lock backend/pyproject.toml backend/README.md ./
COPY backend/class-definitions ./class-definitions
COPY backend/src ./src
RUN pip install --no-cache-dir -U pip \
    && pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps . \
    && python -m untangled.mapping \
        --definitions ./class-definitions \
        --pydantic-out /tmp/pydantic-generated \
        --zod-out /tmp/frontend-generated

FROM node:24-alpine AS development-dependencies-env
COPY frontend/package.json frontend/package-lock.json /app/
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
COPY frontend/package.json frontend/package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
COPY frontend/ /app/
COPY --from=models-env /tmp/frontend-generated /app/app/generated
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache wget
COPY frontend/package.json frontend/package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
# Container listens on 3000 (production default). Local Compose maps host 5173 → 3000.
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]

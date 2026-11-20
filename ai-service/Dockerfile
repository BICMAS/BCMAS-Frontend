# syntax=docker/dockerfile:1.7
#
# CFP AI Intelligence Service
#
# Targets:
#   runtime (default) — production: no dev dependencies, mock backend package removed,
#                       non-root user, prod environment.  docker build -t cfp-ai .
#   dev               — local development: dev dependencies, mock backend, auto-reload.
#                       docker build --target dev -t cfp-ai:dev .

ARG PYTHON_VERSION=3.12

FROM ghcr.io/astral-sh/uv:0.13.9 AS uv

FROM python:${PYTHON_VERSION}-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app

# ── build: production dependencies + the service as a regular (non-editable) package ──
FROM base AS build
COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project --no-editable
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

# ── dev: editable install with dev tools; source is bind-mounted by docker compose ──
FROM base AS dev
COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY tests ./tests
RUN uv sync --frozen
ENV PATH="/app/.venv/bin:${PATH}" \
    CFP_AI_ENV=dev
EXPOSE 8000
CMD ["uvicorn", "cfp_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/src"]

# ── runtime (production) ─────────────────────────────────────────────────────────────
FROM base AS runtime
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin app
COPY --from=build /app/.venv /app/.venv
# Mock data is dev/test-only: physically remove it from the production image and prove it.
RUN rm -rf /app/.venv/lib/python*/site-packages/cfp_ai/integrations/backend/mock \
 && /app/.venv/bin/python -c "import importlib.util, sys; sys.exit(importlib.util.find_spec('cfp_ai.integrations.backend.mock') is not None)"
ENV PATH="/app/.venv/bin:${PATH}" \
    CFP_AI_ENV=prod \
    CFP_AI_LOG_JSON=true
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status != 200)"]
CMD ["uvicorn", "cfp_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]

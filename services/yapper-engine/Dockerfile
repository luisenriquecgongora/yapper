# ==============================================================================
# Multi-Stage Production Dockerfile for Yapper Engine
# Base: Python 3.12-slim with non-root execution and minimal memory footprint
# ==============================================================================

# Stage 1: Dependency Builder
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt


# Stage 2: Production Minimal Runtime
FROM python:3.12-slim AS runner

LABEL org.opencontainers.image.title="yapper-engine" \
      org.opencontainers.image.description="High-throughput async Python STT streaming engine" \
      org.opencontainers.image.version="1.0.0"

WORKDIR /app

# Install runtime audio dependencies (ffmpeg) and curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create unprivileged system user
RUN groupadd -r yapper && useradd -r -g yapper -d /app -s /sbin/nologin yapper && \
    mkdir -p /home/yapper/.cache/yapper && \
    chown -R yapper:yapper /app /home/yapper

# Copy application source code
COPY --chown=yapper:yapper src/ /app/src/

USER yapper

EXPOSE 8000

# Periodic container health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch uvicorn server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

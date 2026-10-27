"""Health check and telemetry routes."""

import os
import time
from typing import Any, Dict
from fastapi import APIRouter
from pydantic import BaseModel

from ..config import settings

router = APIRouter(tags=["health"])

START_TIME = time.time()


class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    backend: str
    sample_rate: int
    memory_rss_mb: float


def get_memory_rss_mb() -> float:
    """Retrieve current process RSS memory in megabytes."""
    try:
        import psutil

        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / (1024 * 1024), 2)
    except Exception:
        # Fallback if psutil is not available
        try:
            import resource

            usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            # On Linux ru_maxrss is in KB, on macOS in Bytes
            return round(usage / 1024.0, 2)
        except Exception:
            return 0.0


@router.get("/health", response_model=HealthResponse)
async def health_check() -> Dict[str, Any]:
    """Return health metrics, process uptime, and memory consumption."""
    return {
        "status": "ok",
        "uptime_seconds": round(time.time() - START_TIME, 2),
        "backend": settings.INFERENCE_BACKEND,
        "sample_rate": settings.SAMPLE_RATE,
        "memory_rss_mb": get_memory_rss_mb(),
    }

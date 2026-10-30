"""Main FastAPI application entrypoint for Yapper Engine."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.health import router as health_router
from .api.transcribe import router as transcribe_router
from .api.websocket import router as ws_router
from .config import settings

# Configure logging format
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
)
logger = logging.getLogger("yapper.engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan managing startup pre-warm and shutdown cleanup."""
    logger.info("Initializing Yapper Engine service (backend: %s, port: %d)...", settings.effective_backend, settings.PORT)
    yield
    logger.info("Shutting down Yapper Engine service cleanly...")


app = FastAPI(
    title="Yapper Engine",
    description="High-throughput async speech-to-text WebSocket streaming engine with Silero VAD and conversational text cleanup.",
    version="1.0.0",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(health_router)
app.include_router(transcribe_router)
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
        reload=False,
    )

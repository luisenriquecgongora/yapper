"""Configuration management for Yapper Engine using Pydantic Settings."""

from typing import List, Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Global service settings loaded from environment variables or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server binding
    PORT: int = Field(default=8000, description="Port to bind the HTTP and WebSocket server")
    HOST: str = Field(default="0.0.0.0", description="Host interface to bind")
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # Speech-to-Text inference
    INFERENCE_BACKEND: Literal["groq", "local"] = Field(
        default="groq",
        description="Speech-to-text inference provider ('groq' for ultra-low latency or 'local' for CTranslate2)",
    )
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key for cloud Whisper and Llama inference",
    )
    GROQ_MODEL: str = Field(
        default="whisper-large-v3",
        description="Model identifier for Groq Whisper inference",
    )
    GROQ_LLM_MODEL: str = Field(
        default="llama-3.1-8b-instant",
        description="Model identifier for Groq Flow cleanup post-processor",
    )

    # Local Faster-Whisper fallback
    LOCAL_WHISPER_MODEL: str = Field(
        default="tiny.en",
        description="Faster-Whisper model size for local CTranslate2 inference",
    )
    LOCAL_WHISPER_DEVICE: str = Field(
        default="cpu",
        description="Execution device for Faster-Whisper ('cpu' or 'cuda')",
    )
    LOCAL_WHISPER_COMPUTE_TYPE: str = Field(
        default="int8",
        description="Compute precision for Faster-Whisper ('int8', 'float16', 'float32')",
    )

    # Audio & Voice Activity Detection
    SAMPLE_RATE: int = Field(default=16000, description="Target audio sample rate in Hz")
    VAD_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0, description="Speech probability threshold for Silero VAD")
    VAD_SILENCE_DURATION_MS: int = Field(
        default=400,
        ge=50,
        le=2000,
        description="Continuous silence duration in ms that triggers transcription flush",
    )
    MAX_BUFFER_SECONDS: float = Field(
        default=30.0,
        ge=1.0,
        le=60.0,
        description="Maximum audio duration before forcing a transcription split",
    )
    SILERO_MODEL_PATH: str = Field(
        default="",
        description="Optional local filesystem path to silero_vad.onnx model",
    )

    # Security & CORS
    CORS_ORIGINS: List[str] = Field(
        default=["*"],
        description="List of allowed CORS origins for WebSocket and HTTP clients",
    )


settings = Settings()

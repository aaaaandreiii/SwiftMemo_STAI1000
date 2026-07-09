from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SwiftMemo"
    environment: str = "local"

    llm_provider: Literal["ollama", "gemini"] = "ollama"
    ollama_model: str = "qwen2.5:latest"
    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = 25.0
    gemini_model: str = "gemini-1.5-flash"
    google_api_key: str | None = None

    embedding_provider: Literal["ollama", "huggingface"] = "ollama"
    ollama_embedding_model: str = "all-minilm:latest"
    huggingface_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    data_path: Path = Field(default=Path("data/mock_hdas.json"))
    database_path: Path = Field(default=Path("data/swiftmemo.db"))
    chroma_dir: Path = Field(default=Path("chroma_data"))
    chroma_collection: str = "swiftmemo_private_memory_v3"

    mlflow_tracking_uri: str = "http://localhost:5000"
    mlflow_experiment: str = "SwiftMemo"

    default_timezone: str = "Asia/Manila"
    max_chat_history_turns: int = 6

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache
from typing import Any, Sequence

from langchain_core.messages import BaseMessage

from backend.config import Settings, get_settings
from backend.telemetry import extract_token_usage, telemetry_run


def _message_text(messages: Sequence[BaseMessage] | str) -> str:
    if isinstance(messages, str):
        return messages
    return "\n\n".join(f"{message.type.upper()}: {message.content}" for message in messages)


@lru_cache
def build_chat_model(temperature: float = 0.0) -> Any:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        if not settings.google_api_key:
            raise RuntimeError("GOOGLE_API_KEY is required when LLM_PROVIDER=gemini")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.google_api_key,
            temperature=temperature,
        )

    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        temperature=temperature,
        client_kwargs={"timeout": settings.ollama_timeout_seconds},
    )


def invoke_llm(
    messages: Sequence[BaseMessage] | str,
    operation: str,
    params: dict[str, Any] | None = None,
    temperature: float = 0.0,
) -> str:
    settings = get_settings()
    prompt_text = _message_text(messages)
    run_params = {
        "provider": settings.llm_provider,
        "model": settings.gemini_model if settings.llm_provider == "gemini" else settings.ollama_model,
        **(params or {}),
    }
    model = build_chat_model(temperature=temperature)
    with telemetry_run(operation=operation, params=run_params, prompt=prompt_text) as run:
        response = model.invoke(messages)
        response_text = str(getattr(response, "content", response))
        run["response"] = response_text
        run["token_usage"] = extract_token_usage(response, prompt_text, response_text)
    return response_text


class SentenceTransformerEmbeddings:
    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self.model.encode(texts, normalize_embeddings=True).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


@lru_cache
def build_embeddings() -> Any:
    settings = get_settings()
    if settings.embedding_provider == "ollama":
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(
            model=settings.ollama_embedding_model,
            base_url=settings.ollama_base_url,
            client_kwargs={"timeout": settings.ollama_timeout_seconds},
        )
    return SentenceTransformerEmbeddings(settings.huggingface_embedding_model)

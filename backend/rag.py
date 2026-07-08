import hashlib
import math
import re
from dataclasses import dataclass
from threading import Lock
from typing import Any

import chromadb
from langchain_core.messages import HumanMessage, SystemMessage

from backend.config import get_settings
from backend.database import DATABASE, SwiftMemoDB
from backend.ingestion import email_to_text
from backend.llm import build_embeddings, invoke_llm
from backend.schemas import ChatResponse, DraftResponse, EmailRecord, SourceDocument, TriageSummary
from backend.telemetry import telemetry_run


RAG_SYSTEM_PROMPT = """You answer university policy and announcement questions for SwiftMemo.

Use only the retrieved context for factual claims. If the answer is not in the context, say that the available HDA context does not contain enough information. Cite subjects and dates when useful.
"""


DRAFT_SYSTEM_PROMPT = """You write professional university email reply drafts.

Use the retrieved tenant-scoped announcement context only as background. Keep the draft concise, respectful, and action-oriented. Do not invent policy details.
"""


@dataclass
class RetrievedChunk:
    id: str
    document: str
    metadata: dict[str, Any]


class RagService:
    def __init__(
        self,
        db: SwiftMemoDB | None = None,
        chroma_path: str | None = None,
        collection_name: str | None = None,
    ) -> None:
        self.settings = get_settings()
        self.db = db or DATABASE
        self._lock = Lock()
        self._client = chromadb.PersistentClient(path=chroma_path or str(self.settings.chroma_dir))
        self._collection = self._client.get_or_create_collection(
            name=collection_name or _collection_name_for_embeddings(self.settings),
            metadata={
                "description": "SwiftMemo tenant-isolated HDA memory",
                "embedding_provider": self.settings.embedding_provider,
                "embedding_model": _embedding_model_name(self.settings),
            },
        )

    def index_email_summary(
        self,
        user_id: str,
        email: EmailRecord,
        summary: TriageSummary,
        visible_in_feed: bool,
    ) -> None:
        chunks = _chunk_text(email_to_text(email))
        ids = [_stable_chunk_id(user_id, email.id, index, chunk) for index, chunk in enumerate(chunks)]
        metadatas = [
            {
                "user_id": user_id,
                "email_id": email.id,
                "subject": email.subject,
                "date": email.date.date().isoformat(),
                "sender": email.sender,
                "category": summary.category,
                "visible_in_feed": bool(visible_in_feed),
            }
            for _ in chunks
        ]
        embeddings = self._embed_documents(chunks)
        with self._lock:
            self._collection.upsert(
                ids=ids,
                documents=chunks,
                metadatas=metadatas,
                embeddings=embeddings,
            )

    def ensure_user_indexed(self, user_id: str) -> None:
        summaries = self.db.list_summaries(user_id, visible_only=False)
        for item in summaries:
            email = self.db.get_email(user_id, item["email_id"])
            if not email:
                continue
            summary = TriageSummary(
                title=item["title"],
                summary=item["summary"],
                deadline_date=item["deadline_date"],
                category=item["category"],
                urgency_score=item["urgency_score"],
            )
            self.index_email_summary(user_id, email, summary, item["visible_in_feed"])

    def retrieve(self, user_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
        self.ensure_user_indexed(user_id)
        embedding = self._embed_query(query)
        where_filter = {"user_id": user_id}
        with telemetry_run(
            operation="rag_retrieval",
            params={"top_k": top_k, "user_id": user_id},
            prompt=query,
        ) as run:
            try:
                results = self._collection.query(
                    query_embeddings=[embedding],
                    n_results=top_k,
                    where=where_filter,
                    include=["documents", "metadatas", "distances"],
                )
            except Exception:
                results = {"documents": [[]], "metadatas": [[]], "ids": [[]]}
            docs = results.get("documents", [[]])[0] or []
            metadata = results.get("metadatas", [[]])[0] or []
            ids = results.get("ids", [[]])[0] or []
            run["response"] = f"retrieved={len(docs)}"
            run["extra_metrics"] = {"retrieved_count": len(docs)}
        return [
            RetrievedChunk(id=ids[index], document=doc, metadata=metadata[index])
            for index, doc in enumerate(docs)
        ]

    def answer(self, user_id: str, message: str, session_id: str, top_k: int) -> ChatResponse:
        history = self.db.chat_history(
            user_id,
            session_id,
            limit=self.settings.max_chat_history_turns * 2,
        )
        retrieval_query = _history_to_text(history, message)
        chunks = self.retrieve(user_id, retrieval_query, top_k=top_k)
        context = _chunks_to_context(chunks)
        history_text = "\n".join(f"{role.title()}: {content}" for role, content in history)
        user_prompt = (
            f"Conversation history:\n{history_text or 'No prior turns.'}\n\n"
            f"Retrieved context:\n{context or 'No context retrieved.'}\n\n"
            f"Current question: {message}"
        )
        try:
            answer = invoke_llm(
                [
                    SystemMessage(content=RAG_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ],
                operation="rag_chat_answer",
                params={"session_id": session_id, "top_k": top_k, "user_id": user_id},
            )
        except Exception:
            answer = _fallback_answer(chunks)
        self.db.add_chat_message(user_id, session_id, "user", message)
        self.db.add_chat_message(user_id, session_id, "assistant", answer)
        return ChatResponse(
            answer=answer,
            session_id=session_id,
            sources=_source_documents(chunks),
        )

    def draft_reply(
        self,
        user_id: str,
        prompt: str,
        session_id: str,
        top_k: int,
        email_id: str | None = None,
    ) -> DraftResponse:
        target_email = self.db.get_email(user_id, email_id) if email_id else None
        retrieval_query = f"{prompt}\n{email_to_text(target_email) if target_email else ''}".strip()
        chunks = self.retrieve(user_id, retrieval_query, top_k=top_k)
        context = _chunks_to_context(chunks)
        target_text = email_to_text(target_email) if target_email else "No single target email selected."
        user_prompt = (
            f"Draft request:\n{prompt}\n\n"
            f"Target email:\n{target_text}\n\n"
            f"Retrieved context:\n{context or 'No context retrieved.'}"
        )
        try:
            draft = invoke_llm(
                [
                    SystemMessage(content=DRAFT_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ],
                operation="draft_reply",
                params={"session_id": session_id, "top_k": top_k, "user_id": user_id},
            )
        except Exception:
            draft = _fallback_draft(prompt, chunks)
        return DraftResponse(draft=draft, session_id=session_id, sources=_source_documents(chunks))

    def _embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            return build_embeddings().embed_documents(texts)
        except Exception:
            return [_hash_embedding(text, dimensions=self._fallback_dimensions()) for text in texts]

    def _embed_query(self, text: str) -> list[float]:
        try:
            return build_embeddings().embed_query(text)
        except Exception:
            return _hash_embedding(text, dimensions=self._fallback_dimensions())

    def _fallback_dimensions(self) -> int:
        model = _embedding_model_name(self.settings).lower()
        if "minilm" in model:
            return 384
        return 768


def _chunk_text(text: str, size: int = 850, overlap: int = 120) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks


def _stable_chunk_id(user_id: str, email_id: str, index: int, chunk: str) -> str:
    digest = hashlib.sha1(f"{user_id}:{chunk}".encode("utf-8")).hexdigest()[:10]
    return f"{user_id}-{email_id}-{index}-{digest}"


def _history_to_text(history: list[tuple[str, str]], message: str) -> str:
    if not history:
        return message
    prior = "\n".join(f"{role}: {content}" for role, content in history[-6:])
    return f"{prior}\nFollow-up question: {message}"


def _chunks_to_context(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(
        f"[{index + 1}] Subject: {chunk.metadata.get('subject')}\n"
        f"Date: {chunk.metadata.get('date')}\n"
        f"Category: {chunk.metadata.get('category')}\n"
        f"Visible in feed: {chunk.metadata.get('visible_in_feed')}\n"
        f"Content:\n{chunk.document}"
        for index, chunk in enumerate(chunks)
    )


def _source_documents(chunks: list[RetrievedChunk]) -> list[SourceDocument]:
    return [
        SourceDocument(
            id=chunk.id,
            subject=str(chunk.metadata.get("subject")),
            date=str(chunk.metadata.get("date")),
            snippet=chunk.document[:280],
        )
        for chunk in chunks
    ]


def _fallback_answer(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "The available HDA context does not contain enough information."
    lines = [
        f"- {chunk.metadata.get('subject')} ({chunk.metadata.get('date')}): {chunk.document[:180]}"
        for chunk in chunks[:3]
    ]
    return "Based on the available HDA context:\n" + "\n".join(lines)


def _fallback_draft(prompt: str, chunks: list[RetrievedChunk]) -> str:
    context_note = ""
    if chunks:
        subject = chunks[0].metadata.get("subject")
        date = chunks[0].metadata.get("date")
        context_note = f" I am writing in relation to {subject} dated {date}."
    return (
        "Dear Office Team,\n\n"
        f"{context_note} {prompt.strip()}\n\n"
        "May I kindly ask for your guidance on the appropriate next steps? "
        "I will comply with the stated requirements and deadlines.\n\n"
        "Thank you.\n\n"
        "Sincerely,"
    )


def _collection_name_for_embeddings(settings: Any) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", _embedding_model_name(settings).lower())
    slug = slug.strip("_") or "default"
    base = re.sub(r"[^a-zA-Z0-9_-]+", "_", settings.chroma_collection).strip("_")
    name = f"{base}_{settings.embedding_provider}_{slug}"
    if len(name) <= 63:
        return name
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]
    return f"{base[:45].strip('_')}_{digest}"


def _embedding_model_name(settings: Any) -> str:
    if settings.embedding_provider == "ollama":
        return settings.ollama_embedding_model
    return settings.huggingface_embedding_model


def _hash_embedding(text: str, dimensions: int = 768) -> list[float]:
    vector = [0.0] * dimensions
    tokens = re_tokenize(text)
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def re_tokenize(text: str) -> list[str]:
    return [token for token in text.lower().replace("\n", " ").split(" ") if token]


RAG_SERVICE = RagService()

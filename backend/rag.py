import hashlib
from dataclasses import dataclass
from threading import Lock

import chromadb
from langchain_core.messages import HumanMessage, SystemMessage

from backend.config import get_settings
from backend.ingestion import email_to_text, load_mock_emails
from backend.llm import build_embeddings, invoke_llm
from backend.schemas import ChatResponse, SourceDocument
from backend.telemetry import telemetry_run


RAG_SYSTEM_PROMPT = """You answer university policy and announcement questions for SwiftMemo.

Use only the retrieved context. If the answer is not in the context, say that the available HDA context does not contain enough information. Cite subjects and dates when useful.
"""


@dataclass
class RetrievedChunk:
    id: str
    document: str
    metadata: dict


class RagService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._lock = Lock()
        self._memory: dict[str, list[tuple[str, str]]] = {}
        self._client = chromadb.PersistentClient(path=str(self.settings.chroma_dir))
        self._collection = self._client.get_or_create_collection(
            name=self.settings.chroma_collection,
            metadata={"description": "SwiftMemo mock HDA historical memory"},
        )

    def ensure_indexed(self) -> None:
        with self._lock:
            if self._collection.count() > 0:
                return
            emails = load_mock_emails()
            chunks: list[str] = []
            ids: list[str] = []
            metadatas: list[dict] = []
            for email in emails:
                if not _is_historical_announcement(email.sender, email.subject):
                    continue
                for index, chunk in enumerate(_chunk_text(email_to_text(email))):
                    chunk_id = _stable_chunk_id(email.id, index, chunk)
                    chunks.append(chunk)
                    ids.append(chunk_id)
                    metadatas.append(
                        {
                            "email_id": email.id,
                            "subject": email.subject,
                            "date": email.date.date().isoformat(),
                            "sender": email.sender,
                        }
                    )
            embeddings = build_embeddings().embed_documents(chunks)
            self._collection.add(
                ids=ids,
                documents=chunks,
                metadatas=metadatas,
                embeddings=embeddings,
            )

    def retrieve(self, query: str, top_k: int) -> list[RetrievedChunk]:
        self.ensure_indexed()
        embedding = build_embeddings().embed_query(query)
        with telemetry_run(
            operation="rag_retrieval",
            params={"top_k": top_k},
            prompt=query,
        ) as run:
            results = self._collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
            )
            docs = results.get("documents", [[]])[0]
            metadata = results.get("metadatas", [[]])[0]
            ids = results.get("ids", [[]])[0]
            run["response"] = f"retrieved={len(docs)}"
            run["extra_metrics"] = {"retrieved_count": len(docs)}
        return [
            RetrievedChunk(id=ids[index], document=doc, metadata=metadata[index])
            for index, doc in enumerate(docs)
        ]

    def answer(self, message: str, session_id: str, top_k: int) -> ChatResponse:
        history = self._memory.get(session_id, [])[-self.settings.max_chat_history_turns :]
        retrieval_query = _history_to_text(history, message)
        chunks = self.retrieve(retrieval_query, top_k=top_k)
        context = "\n\n".join(
            f"[{index + 1}] Subject: {chunk.metadata.get('subject')}\n"
            f"Date: {chunk.metadata.get('date')}\n"
            f"Content:\n{chunk.document}"
            for index, chunk in enumerate(chunks)
        )
        history_text = "\n".join(f"User: {q}\nAssistant: {a}" for q, a in history)
        user_prompt = (
            f"Conversation history:\n{history_text or 'No prior turns.'}\n\n"
            f"Retrieved context:\n{context or 'No context retrieved.'}\n\n"
            f"Current question: {message}"
        )
        answer = invoke_llm(
            [
                SystemMessage(content=RAG_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ],
            operation="rag_chat_answer",
            params={"session_id": session_id, "top_k": top_k},
        )
        self._memory.setdefault(session_id, []).append((message, answer))
        self._memory[session_id] = self._memory[session_id][-self.settings.max_chat_history_turns :]
        return ChatResponse(
            answer=answer,
            session_id=session_id,
            sources=[
                SourceDocument(
                    id=chunk.id,
                    subject=str(chunk.metadata.get("subject")),
                    date=str(chunk.metadata.get("date")),
                    snippet=chunk.document[:280],
                )
                for chunk in chunks
            ],
        )


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


def _stable_chunk_id(email_id: str, index: int, chunk: str) -> str:
    digest = hashlib.sha1(chunk.encode("utf-8")).hexdigest()[:10]
    return f"{email_id}-{index}-{digest}"


def _history_to_text(history: list[tuple[str, str]], message: str) -> str:
    if not history:
        return message
    prior = "\n".join(f"Q: {question}\nA: {answer}" for question, answer in history[-3:])
    return f"{prior}\nFollow-up question: {message}"


def _is_historical_announcement(sender: str, subject: str) -> bool:
    sender_domain = sender.rsplit("@", maxsplit=1)[-1].lower()
    subject_text = subject.lower()
    return sender_domain.endswith("dlsu.edu.ph") or subject_text.startswith("hda:")


RAG_SERVICE = RagService()

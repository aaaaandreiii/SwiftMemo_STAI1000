from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.agent import process_batch, process_email
from backend.config import get_settings
from backend.guardrails import validate_announcement
from backend.ingestion import load_mock_emails
from backend.rag import RAG_SERVICE
from backend.schemas import (
    ChatRequest,
    ChatResponse,
    IngestRequest,
    IngestResponse,
    IngestedEmail,
    ProcessRequest,
    ProcessResponse,
)
from backend.storage import STORE


settings = get_settings()

app = FastAPI(title="SwiftMemo API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "llm_provider": settings.llm_provider,
    }


@app.post("/api/ingest", response_model=IngestResponse)
def ingest(request: IngestRequest) -> IngestResponse:
    try:
        emails = [request.email] if request.email else load_mock_emails(limit=request.limit)
        accepted: list[IngestedEmail] = []
        rejected: list[IngestedEmail] = []
        for email in emails:
            guardrail = validate_announcement(email)
            item = IngestedEmail(email=email, guardrail=guardrail)
            STORE.save_ingested(item)
            if guardrail.is_valid:
                accepted.append(item)
            else:
                rejected.append(item)
        return IngestResponse(
            accepted_count=len(accepted),
            rejected_count=len(rejected),
            accepted=accepted,
            rejected=rejected,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/process", response_model=ProcessResponse)
def process(request: ProcessRequest) -> ProcessResponse:
    try:
        if request.email:
            items = [process_email(request.email)]
        elif request.email_id:
            email = STORE.get_email(request.email_id)
            if not email:
                raise HTTPException(status_code=404, detail=f"Unknown email_id: {request.email_id}")
            items = [process_email(email)]
        else:
            items = process_batch(limit=request.limit)
        return ProcessResponse(processed_count=len(items), items=items)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        return RAG_SERVICE.answer(
            message=request.message,
            session_id=request.session_id,
            top_k=request.top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

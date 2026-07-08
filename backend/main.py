import io
import wave
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from backend.agents import generate_draft, process_batch, process_email
from backend.config import get_settings
from backend.database import DATABASE
from backend.guardrails import validate_announcement
from backend.ingestion import load_mock_emails
from backend.rag import RAG_SERVICE
from backend.schemas import (
    ChatRequest,
    ChatResponse,
    DraftRequest,
    DraftResponse,
    FeedbackRequest,
    FeedbackResponse,
    IngestRequest,
    IngestResponse,
    IngestedEmail,
    PreferencesResponse,
    PreferencesUpdateRequest,
    ProcessRequest,
    ProcessResponse,
    SummariesResponse,
)
from backend.telemetry import telemetry_run


settings = get_settings()

app = FastAPI(title="SwiftMemo API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def current_user(x_user_id: Annotated[str, Header(alias="X-User-ID")]) -> str:
    user_id = x_user_id.strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="X-User-ID cannot be blank")
    return user_id


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "llm_provider": settings.llm_provider,
        "chroma_collection": settings.chroma_collection,
    }


@app.post("/api/ingest", response_model=IngestResponse)
def ingest(request: IngestRequest, user_id: str = Depends(current_user)) -> IngestResponse:
    try:
        emails = (
            [request.email]
            if request.email
            else load_mock_emails(limit=request.limit, offset=request.offset)
        )
        accepted: list[IngestedEmail] = []
        rejected: list[IngestedEmail] = []
        for email in emails:
            guardrail = validate_announcement(email)
            item = IngestedEmail(email=email, guardrail=guardrail)
            DATABASE.save_ingested(user_id, item)
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
def process(request: ProcessRequest, user_id: str = Depends(current_user)) -> ProcessResponse:
    try:
        if request.email:
            items = [process_email(request.email, user_id=user_id)]
        elif request.email_id:
            email = DATABASE.get_email(user_id, request.email_id)
            if not email:
                raise HTTPException(status_code=404, detail=f"Unknown email_id: {request.email_id}")
            items = [process_email(email, user_id=user_id)]
        else:
            items = process_batch(user_id=user_id, limit=request.limit, offset=request.offset)
        return ProcessResponse(processed_count=len(items), items=items)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/summaries", response_model=SummariesResponse)
def summaries(
    user_id: str = Depends(current_user),
    visible_only: bool = Query(default=True),
    limit: int | None = Query(default=None, ge=1, le=100),
) -> SummariesResponse:
    items = DATABASE.list_summaries(user_id, visible_only=visible_only, limit=limit)
    return SummariesResponse(user_id=user_id, count=len(items), items=items)


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest, user_id: str = Depends(current_user)) -> ChatResponse:
    try:
        return RAG_SERVICE.answer(
            user_id=user_id,
            message=request.message,
            session_id=request.session_id,
            top_k=request.top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/preferences", response_model=PreferencesResponse)
def get_preferences(user_id: str = Depends(current_user)) -> PreferencesResponse:
    return PreferencesResponse(user_id=user_id, preferences=DATABASE.get_preferences(user_id))


@app.put("/api/preferences", response_model=PreferencesResponse)
def put_preferences(
    request: PreferencesUpdateRequest,
    user_id: str = Depends(current_user),
) -> PreferencesResponse:
    preferences = DATABASE.set_preferences(user_id, request.preferences)
    DATABASE.refresh_summary_visibility(user_id)
    return PreferencesResponse(user_id=user_id, preferences=preferences)


@app.post("/api/draft", response_model=DraftResponse)
def draft(request: DraftRequest, user_id: str = Depends(current_user)) -> DraftResponse:
    try:
        return generate_draft(user_id, request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/feedback", response_model=FeedbackResponse)
def feedback(request: FeedbackRequest, user_id: str = Depends(current_user)) -> FeedbackResponse:
    feedback_id = DATABASE.save_feedback(
        user_id=user_id,
        summary_id=request.summary_id,
        email_id=request.email_id,
        override_category=request.override_category,
        notes=request.notes,
    )
    return FeedbackResponse(id=feedback_id, status="recorded")


@app.get("/api/summary/audio/{summary_id}")
def audio_summary(summary_id: str, user_id: str = Depends(current_user)) -> Response:
    item = DATABASE.get_summary(user_id, summary_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Unknown summary_id: {summary_id}")
    text = f"{item['title']}. {item['summary']}"
    with telemetry_run(
        operation="audio_summary_stub",
        params={"summary_id": summary_id, "user_id": user_id, "fallback": True},
        prompt=text,
    ) as run:
        audio = _placeholder_wav()
        run["response"] = "Generated placeholder WAV fallback."
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "X-SwiftMemo-Audio-Fallback": "true",
            "X-SwiftMemo-Summary-ID": summary_id,
        },
    )


@app.websocket("/ws/notifications/{user_id}")
async def notification_socket(websocket: WebSocket, user_id: str) -> None:
    await websocket.accept()
    await websocket.send_json(
        {
            "user_id": user_id,
            "status": "stubbed",
            "message": "Deadline notification worker is reserved for Phase 2.",
        }
    )
    await websocket.close()


def _placeholder_wav(duration_seconds: float = 0.35, sample_rate: int = 8000) -> bytes:
    frame_count = int(duration_seconds * sample_rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * frame_count)
    return buffer.getvalue()

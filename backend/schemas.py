from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


Category = Literal[
    "academic",
    "finance",
    "campus_access",
    "health_safety",
    "events",
    "it_services",
    "administrative",
    "other",
]


class EmailRecord(BaseModel):
    id: str = Field(..., description="Stable email identifier.")
    sender: str
    subject: str
    date: datetime
    body: str


class GuardrailResult(BaseModel):
    is_valid: bool
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)


class IngestRequest(BaseModel):
    email: EmailRecord | None = None
    load_mock: bool = True
    limit: int | None = Field(default=None, ge=1, le=100)


class IngestedEmail(BaseModel):
    email: EmailRecord
    guardrail: GuardrailResult


class IngestResponse(BaseModel):
    accepted_count: int
    rejected_count: int
    accepted: list[IngestedEmail]
    rejected: list[IngestedEmail]


class TriageSummary(BaseModel):
    title: str = Field(..., min_length=3)
    summary: str = Field(..., min_length=10)
    deadline_date: date | None = Field(
        default=None,
        description="ISO date if a deadline exists; otherwise null.",
    )
    category: Category

    @field_validator("title", "summary")
    @classmethod
    def no_empty_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("value cannot be blank")
        return cleaned


class ProcessRequest(BaseModel):
    email: EmailRecord | None = None
    email_id: str | None = None
    limit: int = Field(default=5, ge=1, le=25)


class ProcessedEmail(BaseModel):
    email_id: str
    source_subject: str
    guardrail: GuardrailResult
    result: TriageSummary
    tool_observation: str | None = None


class ProcessResponse(BaseModel):
    processed_count: int
    items: list[ProcessedEmail]


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str = Field(default="default")
    top_k: int = Field(default=4, ge=1, le=8)


class SourceDocument(BaseModel):
    id: str
    subject: str
    date: str
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: list[SourceDocument]


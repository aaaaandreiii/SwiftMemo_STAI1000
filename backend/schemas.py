from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


CATEGORIES = (
    "academic",
    "finance",
    "campus_access",
    "health_safety",
    "events",
    "it_services",
    "administrative",
    "other",
)

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
    urgency_score: int = Field(ge=1, le=5)

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
    summary_id: str | None = None
    visible_in_feed: bool = True
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


class SummaryItem(BaseModel):
    summary_id: str
    email_id: str
    source_subject: str
    sender: str
    email_date: datetime
    title: str
    summary: str
    deadline_date: date | None = None
    category: Category
    urgency_score: int = Field(ge=1, le=5)
    visible_in_feed: bool
    created_at: datetime


class SummariesResponse(BaseModel):
    user_id: str
    count: int
    items: list[SummaryItem]


class PreferencesUpdateRequest(BaseModel):
    preferences: dict[str, bool]

    @model_validator(mode="after")
    def validate_categories(self) -> "PreferencesUpdateRequest":
        invalid = sorted(set(self.preferences) - set(CATEGORIES))
        if invalid:
            raise ValueError(f"Unknown categories: {', '.join(invalid)}")
        return self


class PreferencesResponse(BaseModel):
    user_id: str
    preferences: dict[Category, bool]


class DraftRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    session_id: str = Field(default="default")
    top_k: int = Field(default=4, ge=1, le=8)
    email_id: str | None = None


class DraftResponse(BaseModel):
    draft: str
    session_id: str
    sources: list[SourceDocument]


class FeedbackRequest(BaseModel):
    summary_id: str | None = None
    email_id: str | None = None
    override_category: Category
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_target(self) -> "FeedbackRequest":
        if not self.summary_id and not self.email_id:
            raise ValueError("summary_id or email_id is required")
        return self


class FeedbackResponse(BaseModel):
    id: str
    status: str


class AudioSummaryMetadata(BaseModel):
    summary_id: str
    text: str
    fallback: bool = True


class NotificationPayload(BaseModel):
    user_id: str
    summary_id: str
    deadline_date: date | None = None
    status: str = "stubbed"

import re
from datetime import date, datetime, timedelta
from typing import TypedDict
from zoneinfo import ZoneInfo

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import create_react_agent

from backend.config import get_settings
from backend.database import DATABASE
from backend.guardrails import heuristic_validate_announcement, validate_announcement
from backend.ingestion import email_to_text, load_mock_emails
from backend.json_utils import extract_json_object
from backend.llm import build_chat_model, invoke_llm
from backend.schemas import (
    DraftRequest,
    DraftResponse,
    EmailRecord,
    GuardrailResult,
    IngestedEmail,
    ProcessedEmail,
    TriageSummary,
)
from backend.telemetry import telemetry_run


@tool
def calendar_check(relative_date: str = "") -> str:
    """Resolve relative dates against the current date in Asia/Manila."""
    settings = get_settings()
    today = datetime.now(ZoneInfo(settings.default_timezone)).date()
    if not relative_date.strip():
        return f"Current date in {settings.default_timezone}: {today.isoformat()}"
    resolved = resolve_relative_date(relative_date, today)
    if resolved:
        return f"{relative_date!r} resolves to {resolved.isoformat()} in {settings.default_timezone}"
    return f"Current date in {settings.default_timezone}: {today.isoformat()}"


AGENT_PROMPT = """You are SwiftMemo, a ReAct triage agent for DLSU Help Desk Announcements.

You must call the calendar_check tool before producing the final answer. If the email uses relative dates, pass the relative phrase to calendar_check.

Extract the announcement into this exact JSON schema:
{
  "title": "short title",
  "summary": "1-2 sentence action-focused summary",
  "deadline_date": "YYYY-MM-DD or null",
  "category": "academic | finance | campus_access | health_safety | events | it_services | administrative | other",
  "urgency_score": 1
}

Rules:
- Return only JSON in the final answer.
- Do not invent a deadline. Use null if there is no explicit deadline.
- urgency_score must be an integer from 1 to 5, where 5 is most urgent.
- Keep summaries factual and based only on the email content.
"""


REPAIR_PROMPT = """Convert the extraction into valid JSON for this exact schema:
{
  "title": "short title",
  "summary": "1-2 sentence action-focused summary",
  "deadline_date": "YYYY-MM-DD or null",
  "category": "academic | finance | campus_access | health_safety | events | it_services | administrative | other",
  "urgency_score": 1
}

Return only JSON. Do not add commentary.
"""


class ProcessState(TypedDict, total=False):
    user_id: str
    email: EmailRecord
    guardrail: GuardrailResult
    summary: TriageSummary
    visible_in_feed: bool
    summary_id: str
    tool_observation: str | None


def build_processing_graph():
    graph = StateGraph(ProcessState)
    graph.add_node("official_announcement_validation", _validation_node)
    graph.add_node("structured_extraction", _structured_extraction_node)
    graph.add_node("user_preference_guardrails", _preference_node)
    graph.add_node("vector_indexing", _indexing_node)
    graph.add_node("rejected", _rejected_node)
    graph.set_entry_point("official_announcement_validation")
    graph.add_conditional_edges(
        "official_announcement_validation",
        _route_after_validation,
        {
            "structured_extraction": "structured_extraction",
            "rejected": "rejected",
        },
    )
    graph.add_edge("structured_extraction", "user_preference_guardrails")
    graph.add_edge("user_preference_guardrails", "vector_indexing")
    graph.add_edge("vector_indexing", END)
    graph.add_edge("rejected", END)
    return graph.compile()


def _validation_node(state: ProcessState) -> ProcessState:
    email = state["email"]
    guardrail = state.get("guardrail") or validate_announcement(email)
    DATABASE.save_ingested(state["user_id"], IngestedEmail(email=email, guardrail=guardrail))
    return {**state, "guardrail": guardrail}


def _route_after_validation(state: ProcessState) -> str:
    guardrail = state["guardrail"]
    return "structured_extraction" if guardrail.is_valid else "rejected"


def _structured_extraction_node(state: ProcessState) -> ProcessState:
    summary, observation = extract_structured_summary(state["email"])
    return {**state, "summary": summary, "tool_observation": observation}


def _preference_node(state: ProcessState) -> ProcessState:
    summary = state["summary"]
    visible = DATABASE.category_enabled(state["user_id"], summary.category)
    return {**state, "visible_in_feed": visible}


def _indexing_node(state: ProcessState) -> ProcessState:
    from backend.rag import RAG_SERVICE

    email = state["email"]
    summary = state["summary"]
    visible = state.get("visible_in_feed", True)
    summary_id = DATABASE.save_triage(state["user_id"], email.id, summary, visible)
    RAG_SERVICE.index_email_summary(state["user_id"], email, summary, visible)
    return {**state, "summary_id": summary_id}


def _rejected_node(state: ProcessState) -> ProcessState:
    return state


def extract_structured_summary(email: EmailRecord) -> tuple[TriageSummary, str | None]:
    try:
        graph = _build_react_agent()
        prompt = f"Process this validated institutional announcement:\n\n{email_to_text(email)}"
        with telemetry_run(
            operation="react_agent_process",
            params={"email_id": email.id, "subject": email.subject},
            prompt=prompt,
        ) as run:
            result = graph.invoke({"messages": [HumanMessage(content=prompt)]})
            messages = result.get("messages", [])
            final_text = str(getattr(messages[-1], "content", "")) if messages else ""
            run["response"] = final_text
            run["extra_metrics"] = {"agent_message_count": len(messages)}
        return _parse_summary(final_text, email), _extract_tool_observation(messages)
    except Exception:
        summary = heuristic_extract_summary(email)
        observation = calendar_check.invoke({"relative_date": ""})
        return summary, observation


def process_email(
    email: EmailRecord,
    user_id: str,
    guardrail: GuardrailResult | None = None,
) -> ProcessedEmail:
    graph = build_processing_graph()
    state = graph.invoke({"user_id": user_id, "email": email, "guardrail": guardrail})
    final_guardrail = state["guardrail"]
    if not final_guardrail.is_valid:
        raise ValueError(f"Email rejected by guardrails: {final_guardrail.reason}")

    summary = state["summary"]
    return ProcessedEmail(
        email_id=email.id,
        source_subject=email.subject,
        guardrail=final_guardrail,
        result=summary,
        summary_id=state.get("summary_id"),
        visible_in_feed=state.get("visible_in_feed", True),
        tool_observation=state.get("tool_observation"),
    )


def process_email_fast(
    email: EmailRecord,
    user_id: str,
    guardrail: GuardrailResult | None = None,
) -> ProcessedEmail:
    from backend.rag import RAG_SERVICE

    final_guardrail = guardrail or heuristic_validate_announcement(email)
    DATABASE.save_ingested(user_id, IngestedEmail(email=email, guardrail=final_guardrail))
    if not final_guardrail.is_valid:
        raise ValueError(f"Email rejected by guardrails: {final_guardrail.reason}")

    summary = heuristic_extract_summary(email)
    visible = DATABASE.category_enabled(user_id, summary.category)
    summary_id = DATABASE.save_triage(user_id, email.id, summary, visible)
    RAG_SERVICE.index_email_summary(
        user_id,
        email,
        summary,
        visible,
        use_fallback_embeddings=True,
    )
    return ProcessedEmail(
        email_id=email.id,
        source_subject=email.subject,
        guardrail=final_guardrail,
        result=summary,
        summary_id=summary_id,
        visible_in_feed=visible,
        tool_observation="Fast deterministic processing for mock/feed batches.",
    )


def process_batch(user_id: str, limit: int, offset: int = 0) -> list[ProcessedEmail]:
    emails = DATABASE.unprocessed_valid_emails(user_id, limit=limit)
    if not emails and not DATABASE.valid_emails(user_id, limit=1):
        emails = load_mock_emails(limit=limit, offset=offset)

    processed: list[ProcessedEmail] = []
    for email in emails[:limit]:
        try:
            processed.append(process_email_fast(email, user_id=user_id))
        except ValueError:
            continue
    return processed


def generate_draft(user_id: str, request: DraftRequest) -> DraftResponse:
    from backend.rag import RAG_SERVICE

    return RAG_SERVICE.draft_reply(
        user_id=user_id,
        prompt=request.prompt,
        session_id=request.session_id,
        top_k=request.top_k,
        email_id=request.email_id,
    )


def _build_react_agent():
    model = build_chat_model(temperature=0.0)
    try:
        return create_react_agent(model, tools=[calendar_check], prompt=AGENT_PROMPT)
    except TypeError:
        return create_react_agent(model, tools=[calendar_check], state_modifier=AGENT_PROMPT)


def _extract_tool_observation(messages: list[object]) -> str | None:
    observations = [
        str(getattr(message, "content", ""))
        for message in messages
        if isinstance(message, ToolMessage)
    ]
    return observations[-1] if observations else None


def _parse_summary(raw_text: str, email: EmailRecord) -> TriageSummary:
    try:
        return TriageSummary.model_validate(extract_json_object(raw_text))
    except Exception:
        try:
            repaired = invoke_llm(
                f"{REPAIR_PROMPT}\n\nEmail:\n{email_to_text(email)}\n\nInvalid extraction:\n{raw_text}",
                operation="structured_output_repair",
                params={"email_id": email.id, "subject": email.subject},
            )
            return TriageSummary.model_validate(extract_json_object(repaired))
        except Exception:
            return heuristic_extract_summary(email)


def heuristic_extract_summary(email: EmailRecord) -> TriageSummary:
    deadline = _extract_deadline(email)
    category = _classify_category(email)
    title = re.sub(r"^hda:\s*", "", email.subject, flags=re.IGNORECASE).strip()
    first_sentence = _first_sentence(email.body)
    summary = first_sentence if len(first_sentence) >= 10 else email.body[:220].strip()
    return TriageSummary(
        title=title[:120],
        summary=summary,
        deadline_date=deadline,
        category=category,
        urgency_score=_urgency_score(deadline, email.date.date()),
    )


def resolve_relative_date(phrase: str, base_date: date | None = None) -> date | None:
    base = base_date or datetime.now(ZoneInfo(get_settings().default_timezone)).date()
    text = phrase.lower()
    if "day after tomorrow" in text:
        return base + timedelta(days=2)
    if "tomorrow" in text:
        return base + timedelta(days=1)
    if "today" in text:
        return base
    days_match = re.search(r"in\s+(\d+)\s+days?", text)
    if days_match:
        return base + timedelta(days=int(days_match.group(1)))

    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    for name, weekday in weekdays.items():
        if f"next {name}" in text:
            delta = (weekday - base.weekday()) % 7
            return base + timedelta(days=delta or 7)
        if f"this {name}" in text or f"by {name}" in text:
            delta = (weekday - base.weekday()) % 7
            return base + timedelta(days=delta)
    return None


def _extract_deadline(email: EmailRecord) -> date | None:
    absolute_dates = []
    for match in re.finditer(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2},\s+\d{4}\b",
        email.body,
        flags=re.IGNORECASE,
    ):
        try:
            absolute_dates.append(datetime.strptime(match.group(0), "%B %d, %Y").date())
        except ValueError:
            continue
    if absolute_dates:
        return absolute_dates[-1]

    relative = resolve_relative_date(email.body, email.date.date())
    return relative


def _classify_category(email: EmailRecord):
    text = f"{email.subject} {email.body}".lower()
    keyword_map = {
        "academic": ("enrollment", "thesis", "course", "graded", "classes", "defense"),
        "finance": ("tuition", "payment", "accounting", "installment", "balance"),
        "campus_access": ("gate", "access", "guest", "campus safety"),
        "health_safety": ("health", "flu", "symptoms", "mask", "illness"),
        "events": ("student organization", "activities", "event", "renewal"),
        "it_services": ("animospace", "maintenance", "it services", "online"),
        "administrative": ("registrar", "office", "procedure", "requirements"),
    }
    for category, keywords in keyword_map.items():
        if any(keyword in text for keyword in keywords):
            return category
    return "other"


def _urgency_score(deadline: date | None, base_date: date) -> int:
    if deadline is None:
        return 2
    days = (deadline - base_date).days
    if days < 0:
        return 1
    if days <= 3:
        return 5
    if days <= 10:
        return 4
    if days <= 30:
        return 3
    return 2


def _first_sentence(text: str) -> str:
    normalized = " ".join(text.strip().split())
    match = re.search(r"(.+?[.!?])\s", normalized)
    return match.group(1) if match else normalized[:220]

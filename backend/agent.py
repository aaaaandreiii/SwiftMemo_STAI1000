from datetime import datetime
from zoneinfo import ZoneInfo

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from backend.config import get_settings
from backend.guardrails import validate_announcement
from backend.ingestion import email_to_text, load_mock_emails
from backend.json_utils import extract_json_object
from backend.llm import build_chat_model, invoke_llm
from backend.schemas import (
    EmailRecord,
    GuardrailResult,
    IngestedEmail,
    ProcessedEmail,
    TriageSummary,
)
from backend.storage import STORE
from backend.telemetry import telemetry_run


@tool
def calendar_check() -> str:
    """Return the current date so the agent can compare announcement deadlines."""
    settings = get_settings()
    now = datetime.now(ZoneInfo(settings.default_timezone))
    return f"Current date in {settings.default_timezone}: {now.date().isoformat()}"


AGENT_PROMPT = """You are SwiftMemo, a ReAct triage agent for DLSU Help Desk Announcements.

You must call the calendar_check tool before producing the final answer.

Extract the announcement into this exact JSON schema:
{
  "title": "short title",
  "summary": "1-2 sentence action-focused summary",
  "deadline_date": "YYYY-MM-DD or null",
  "category": "academic | finance | campus_access | health_safety | events | it_services | administrative | other"
}

Rules:
- Return only JSON in the final answer.
- Do not invent a deadline. Use null if there is no explicit deadline.
- Use the calendar_check result only to understand whether a deadline is relative to today.
- Keep summaries factual and based only on the email content.
"""


REPAIR_PROMPT = """Convert the extraction into valid JSON for this exact schema:
{
  "title": "short title",
  "summary": "1-2 sentence action-focused summary",
  "deadline_date": "YYYY-MM-DD or null",
  "category": "academic | finance | campus_access | health_safety | events | it_services | administrative | other"
}

Return only JSON. Do not add commentary.
"""


def _build_agent_graph():
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
        repaired = invoke_llm(
            f"{REPAIR_PROMPT}\n\nEmail:\n{email_to_text(email)}\n\nInvalid extraction:\n{raw_text}",
            operation="structured_output_repair",
            params={"email_id": email.id, "subject": email.subject},
        )
        return TriageSummary.model_validate(extract_json_object(repaired))


def process_email(email: EmailRecord, guardrail: GuardrailResult | None = None) -> ProcessedEmail:
    guardrail = guardrail or validate_announcement(email)
    STORE.save_ingested(IngestedEmail(email=email, guardrail=guardrail))
    if not guardrail.is_valid:
        raise ValueError(f"Email rejected by guardrails: {guardrail.reason}")

    graph = _build_agent_graph()
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

    summary = _parse_summary(final_text, email)
    STORE.save_triage(email.id, summary)
    return ProcessedEmail(
        email_id=email.id,
        source_subject=email.subject,
        guardrail=guardrail,
        result=summary,
        tool_observation=_extract_tool_observation(messages),
    )


def process_batch(limit: int) -> list[ProcessedEmail]:
    emails = STORE.valid_emails()
    if not emails:
        emails = load_mock_emails(limit=limit)
    processed: list[ProcessedEmail] = []
    for email in emails[:limit]:
        try:
            processed.append(process_email(email))
        except ValueError:
            continue
    return processed

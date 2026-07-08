from langchain_core.messages import HumanMessage, SystemMessage

from backend.ingestion import email_to_text
from backend.json_utils import extract_json_object
from backend.llm import invoke_llm
from backend.schemas import EmailRecord, GuardrailResult


GUARDRAIL_SYSTEM_PROMPT = """You validate whether a message is a university institutional announcement.

Accept only announcements that are plausibly official De La Salle University notices, Help Desk Announcements, or office-issued student/faculty policy updates. Reject personal messages, ads, spam, casual chats, and content unrelated to institutional operations.

Return only strict JSON:
{
  "is_valid": true or false,
  "reason": "short reason",
  "confidence": number between 0 and 1
}
"""


def validate_announcement(email: EmailRecord) -> GuardrailResult:
    prompt = f"Validate this candidate announcement:\n\n{email_to_text(email)}"
    response_text = invoke_llm(
        [
            SystemMessage(content=GUARDRAIL_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ],
        operation="guardrail_validation",
        params={"email_id": email.id, "subject": email.subject},
    )
    parsed = extract_json_object(response_text)
    return GuardrailResult.model_validate(parsed)


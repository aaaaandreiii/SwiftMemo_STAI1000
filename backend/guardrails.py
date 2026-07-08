from email.utils import parseaddr

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
    hard_reject = hard_reject_non_announcement(email)
    if hard_reject:
        return hard_reject

    prompt = f"Validate this candidate announcement:\n\n{email_to_text(email)}"
    try:
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
    except Exception:
        return heuristic_validate_announcement(email)


def hard_reject_non_announcement(email: EmailRecord) -> GuardrailResult | None:
    sender = email.sender.lower()
    subject = email.subject.lower()
    body = email.body.lower()
    text = f"{subject}\n{body}"

    if "instructure.com" in sender and any(
        phrase in text
        for phrase in (
            "assignment graded",
            "has been graded",
            "graded:",
            "submission comment",
        )
    ):
        return GuardrailResult(
            is_valid=False,
            reason="LMS activity notification, not an institutional announcement.",
            confidence=0.96,
        )

    if any(term in text for term in ("limited time", "laptop sale", "discounted accessories")):
        return GuardrailResult(
            is_valid=False,
            reason="Promotional message unrelated to institutional operations.",
            confidence=0.97,
        )

    if any(term in text for term in ("dinner later", "where to eat", "are you free after class")):
        return GuardrailResult(
            is_valid=False,
            reason="Personal message, not an institutional announcement.",
            confidence=0.96,
        )

    return None


def heuristic_validate_announcement(email: EmailRecord) -> GuardrailResult:
    sender = email.sender.lower()
    sender_address = parseaddr(email.sender)[1].lower() or sender
    sender_domain = sender_address.rsplit("@", 1)[-1]
    subject = email.subject.lower()
    body = email.body.lower()
    official_sender = sender_domain == "dlsu.edu.ph" or sender_domain.endswith(".dlsu.edu.ph")
    hda_subject = subject.startswith("hda:") or "help desk announcement" in body
    institutional_notice = any(
        keyword in body
        for keyword in (
            "announces",
            "reminds",
            "advises",
            "invites",
            "cordially invites",
            "please be advised",
            "will implement",
            "will conduct",
            "application deadline",
            "not later than",
            "registration",
            "deadline",
            "schedule",
            "advisory",
            "office",
            "department",
            "college",
            "campus",
            "university",
        )
    )
    spam_terms = ("sale", "discount", "promo", "dinner", "eat near campus")

    if official_sender and sender_address == "announcement@dlsu.edu.ph" and not any(
        term in body for term in spam_terms
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Official Help Desk Announcement sender.",
            confidence=0.86,
        )
    if (official_sender or hda_subject) and institutional_notice and not any(
        term in body for term in spam_terms
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Official-looking institutional announcement.",
            confidence=0.82,
        )
    if official_sender and hda_subject:
        return GuardrailResult(
            is_valid=True,
            reason="Official sender and HDA subject.",
            confidence=0.74,
        )
    return GuardrailResult(
        is_valid=False,
        reason="Not an official institutional announcement.",
        confidence=0.78,
    )

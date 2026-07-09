from email.utils import parseaddr

from langchain_core.messages import HumanMessage, SystemMessage

from backend.ingestion import email_to_text
from backend.json_utils import extract_json_object
from backend.llm import invoke_llm
from backend.schemas import EmailRecord, GuardrailResult


GUARDRAIL_SYSTEM_PROMPT = """You classify email updates for SwiftMemo.

Classify every readable normal email as processable. Do not reject personal emails,
Canvas Updates, account/service updates, promotions, student organization
emails, or casual messages. Use is_valid=false only for technically unusable records,
such as empty or unreadable content.

Return only strict JSON:
{
  "is_valid": true or false,
  "reason": "short reason",
  "confidence": number between 0 and 1,
  "is_institutional": true or false,
  "email_kind": "institutional | academic | administrative | student_org_event | lms_notification | service_notification | personal | promotional | other"
}
"""


def validate_announcement(email: EmailRecord) -> GuardrailResult:
    hard_reject = hard_reject_unprocessable_email(email)
    if hard_reject:
        return hard_reject

    prompt = f"Classify this email update:\n\n{email_to_text(email)}"
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
        result = GuardrailResult.model_validate(parsed)
        return _coerce_processable_classification(email, result)
    except Exception:
        return heuristic_validate_announcement(email)


def hard_reject_unprocessable_email(email: EmailRecord) -> GuardrailResult | None:
    subject = email.subject.lower()
    body = email.body.lower()
    text = f"{subject}\n{body}".strip()

    if len(text) < 3 or not (email.subject.strip() or email.body.strip()):
        return GuardrailResult(
            is_valid=False,
            reason="Email record has no readable subject or body.",
            confidence=0.98,
            email_kind="unreadable",
        )

    return None


def hard_reject_non_announcement(email: EmailRecord) -> GuardrailResult | None:
    return hard_reject_unprocessable_email(email)


def heuristic_validate_announcement(email: EmailRecord) -> GuardrailResult:
    hard_reject = hard_reject_unprocessable_email(email)
    if hard_reject:
        return hard_reject

    sender = email.sender.lower()
    sender_address = parseaddr(email.sender)[1].lower() or sender
    sender_domain = sender_address.rsplit("@", 1)[-1]
    subject = email.subject.lower()
    body = email.body.lower()
    text = f"{subject}\n{body}"
    official_sender = sender_domain == "dlsu.edu.ph" or sender_domain.endswith(".dlsu.edu.ph")
    hda_subject = subject.startswith("hda:") or "help desk announcement" in body
    institutional_notice = any(
        keyword in text
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

    if "instructure.com" in sender_domain or "canvas" in text or any(
        phrase in text
        for phrase in (
            "assignment graded",
            "has been graded",
            "graded:",
            "submission comment",
            "course notification",
        )
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Canvas Updates classified for summarization.",
            confidence=0.94,
            is_institutional=False,
            email_kind="lms_notification",
        )

    if any(
        term in text
        for term in (
            "limited time",
            "laptop sale",
            "discounted accessories",
            "promo",
            "promotion",
            "unsubscribe",
            "voucher",
        )
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Promotional email classified for summarization.",
            confidence=0.93,
            is_institutional=False,
            email_kind="promotional",
        )

    if any(
        term in text
        for term in (
            "dinner later",
            "where to eat",
            "are you free after class",
            "see you later",
            "can we meet",
        )
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Personal email classified for summarization.",
            confidence=0.9,
            is_institutional=False,
            email_kind="personal",
        )

    if any(
        term in text
        for term in (
            "student organization",
            "student org",
            "webinar",
            "workshop",
            "general assembly",
            "call for volunteers",
        )
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Student organization or event email classified for summarization.",
            confidence=0.88,
            is_institutional=official_sender,
            email_kind="student_org_event",
        )

    if any(
        token in sender_address
        for token in ("no-reply", "noreply", "notification", "alerts", "support")
    ) or any(
        term in text
        for term in (
            "receipt",
            "invoice",
            "password",
            "security alert",
            "confirmation",
            "delivery",
            "subscription",
            "account update",
        )
    ):
        return GuardrailResult(
            is_valid=True,
            reason="Account/Service Update classified for summarization.",
            confidence=0.86,
            is_institutional=False,
            email_kind="service_notification",
        )

    if official_sender and sender_address == "announcement@dlsu.edu.ph":
        return GuardrailResult(
            is_valid=True,
            reason="Official Help Desk Announcement classified for summarization.",
            confidence=0.86,
            is_institutional=True,
            email_kind="institutional",
        )
    if (official_sender or hda_subject) and institutional_notice:
        return GuardrailResult(
            is_valid=True,
            reason="Official DLSU Email update classified for summarization.",
            confidence=0.82,
            is_institutional=True,
            email_kind="institutional",
        )
    if official_sender and hda_subject:
        return GuardrailResult(
            is_valid=True,
            reason="Official sender and HDA subject classified for summarization.",
            confidence=0.74,
            is_institutional=True,
            email_kind="institutional",
        )
    return GuardrailResult(
        is_valid=True,
        reason="General email classified for summarization.",
        confidence=0.72,
        is_institutional=official_sender and institutional_notice,
        email_kind="other",
    )


def _coerce_processable_classification(
    email: EmailRecord,
    result: GuardrailResult,
) -> GuardrailResult:
    if result.is_valid:
        return result
    hard_reject = hard_reject_unprocessable_email(email)
    if hard_reject:
        return hard_reject
    return GuardrailResult(
        is_valid=True,
        reason=result.reason or "Readable email classified for summarization.",
        confidence=result.confidence,
        is_institutional=result.is_institutional,
        email_kind=result.email_kind or "other",
    )

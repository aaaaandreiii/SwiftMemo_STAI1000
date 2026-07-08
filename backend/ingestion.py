import json
from pathlib import Path

from backend.config import get_settings
from backend.schemas import EmailRecord


def load_mock_emails(
    path: Path | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[EmailRecord]:
    settings = get_settings()
    data_path = path or settings.data_path
    raw = json.loads(data_path.read_text(encoding="utf-8"))
    emails = [EmailRecord.model_validate(item) for item in raw]
    emails = emails[offset:]
    if limit is not None:
        return emails[:limit]
    return emails


def email_to_text(email: EmailRecord) -> str:
    return (
        f"Sender: {email.sender}\n"
        f"Subject: {email.subject}\n"
        f"Date: {email.date.isoformat()}\n\n"
        f"{email.body}"
    )

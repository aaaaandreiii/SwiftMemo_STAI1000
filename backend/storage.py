from threading import Lock

from backend.schemas import EmailRecord, GuardrailResult, IngestedEmail, TriageSummary


class AppStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.emails: dict[str, EmailRecord] = {}
        self.guardrails: dict[str, GuardrailResult] = {}
        self.triage: dict[str, TriageSummary] = {}

    def save_ingested(self, item: IngestedEmail) -> None:
        with self._lock:
            self.emails[item.email.id] = item.email
            self.guardrails[item.email.id] = item.guardrail

    def save_triage(self, email_id: str, summary: TriageSummary) -> None:
        with self._lock:
            self.triage[email_id] = summary

    def get_email(self, email_id: str) -> EmailRecord | None:
        with self._lock:
            return self.emails.get(email_id)

    def valid_emails(self) -> list[EmailRecord]:
        with self._lock:
            return [
                email
                for email_id, email in self.emails.items()
                if self.guardrails.get(email_id) and self.guardrails[email_id].is_valid
            ]


STORE = AppStore()


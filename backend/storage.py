from backend.database import DATABASE, SwiftMemoDB
from backend.schemas import EmailRecord, IngestedEmail, TriageSummary


class AppStore:
    def __init__(self, db: SwiftMemoDB | None = None) -> None:
        self.db = db or DATABASE

    def save_ingested(self, user_id: str, item: IngestedEmail) -> None:
        self.db.save_ingested(user_id, item)

    def save_triage(
        self,
        user_id: str,
        email_id: str,
        summary: TriageSummary,
        visible_in_feed: bool = True,
    ) -> str:
        return self.db.save_triage(user_id, email_id, summary, visible_in_feed)

    def get_email(self, user_id: str, email_id: str) -> EmailRecord | None:
        return self.db.get_email(user_id, email_id)

    def valid_emails(
        self,
        user_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[EmailRecord]:
        return self.db.valid_emails(user_id, limit=limit, offset=offset)


STORE = AppStore()

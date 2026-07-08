import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from backend.config import get_settings
from backend.schemas import (
    CATEGORIES,
    EmailRecord,
    GuardrailResult,
    IngestedEmail,
    TriageSummary,
)


class SwiftMemoDB:
    def __init__(self, path: str | Path | None = None) -> None:
        settings = get_settings()
        self.path = Path(path or settings.database_path)
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS emails (
                    user_id TEXT NOT NULL,
                    email_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    email_date TEXT NOT NULL,
                    body TEXT NOT NULL,
                    guardrail_valid INTEGER NOT NULL,
                    guardrail_reason TEXT NOT NULL,
                    guardrail_confidence REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, email_id)
                );

                CREATE TABLE IF NOT EXISTS triage_summaries (
                    summary_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    email_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    deadline_date TEXT,
                    category TEXT NOT NULL,
                    urgency_score INTEGER NOT NULL,
                    visible_in_feed INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE (user_id, email_id),
                    FOREIGN KEY (user_id, email_id)
                        REFERENCES emails (user_id, email_id)
                        ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, category)
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS classification_overrides (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    summary_id TEXT,
                    email_id TEXT,
                    original_category TEXT,
                    override_category TEXT NOT NULL,
                    notes TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notification_jobs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    summary_id TEXT NOT NULL,
                    deadline_date TEXT,
                    channel TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def save_ingested(self, user_id: str, item: IngestedEmail) -> None:
        email = item.email
        guardrail = item.guardrail
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO emails (
                    user_id, email_id, sender, subject, email_date, body,
                    guardrail_valid, guardrail_reason, guardrail_confidence, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, email_id) DO UPDATE SET
                    sender = excluded.sender,
                    subject = excluded.subject,
                    email_date = excluded.email_date,
                    body = excluded.body,
                    guardrail_valid = excluded.guardrail_valid,
                    guardrail_reason = excluded.guardrail_reason,
                    guardrail_confidence = excluded.guardrail_confidence
                """,
                (
                    user_id,
                    email.id,
                    email.sender,
                    email.subject,
                    email.date.isoformat(),
                    email.body,
                    int(guardrail.is_valid),
                    guardrail.reason,
                    guardrail.confidence,
                    _now(),
                ),
            )
            self._conn.commit()

    def get_email(self, user_id: str, email_id: str) -> EmailRecord | None:
        row = self._fetchone(
            "SELECT * FROM emails WHERE user_id = ? AND email_id = ?",
            (user_id, email_id),
        )
        return _row_to_email(row) if row else None

    def valid_emails(self, user_id: str, limit: int | None = None) -> list[EmailRecord]:
        sql = """
            SELECT * FROM emails
            WHERE user_id = ? AND guardrail_valid = 1
            ORDER BY email_date ASC
        """
        params: tuple[Any, ...] = (user_id,)
        if limit is not None:
            sql += " LIMIT ?"
            params = (user_id, limit)
        rows = self._fetchall(sql, params)
        return [_row_to_email(row) for row in rows]

    def save_triage(
        self,
        user_id: str,
        email_id: str,
        summary: TriageSummary,
        visible_in_feed: bool,
    ) -> str:
        summary_id = _summary_id(user_id, email_id)
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO triage_summaries (
                    summary_id, user_id, email_id, title, summary, deadline_date,
                    category, urgency_score, visible_in_feed, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(summary_id) DO UPDATE SET
                    title = excluded.title,
                    summary = excluded.summary,
                    deadline_date = excluded.deadline_date,
                    category = excluded.category,
                    urgency_score = excluded.urgency_score,
                    visible_in_feed = excluded.visible_in_feed
                """,
                (
                    summary_id,
                    user_id,
                    email_id,
                    summary.title,
                    summary.summary,
                    summary.deadline_date.isoformat() if summary.deadline_date else None,
                    summary.category,
                    summary.urgency_score,
                    int(visible_in_feed),
                    _now(),
                ),
            )
            self._conn.commit()
        return summary_id

    def get_summary(self, user_id: str, summary_id: str) -> dict[str, Any] | None:
        row = self._fetchone(
            """
            SELECT ts.*, e.subject AS source_subject, e.sender, e.email_date
            FROM triage_summaries ts
            JOIN emails e
                ON e.user_id = ts.user_id AND e.email_id = ts.email_id
            WHERE ts.user_id = ? AND ts.summary_id = ?
            """,
            (user_id, summary_id),
        )
        return _row_to_summary_item(row) if row else None

    def list_summaries(
        self,
        user_id: str,
        visible_only: bool = True,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT ts.*, e.subject AS source_subject, e.sender, e.email_date
            FROM triage_summaries ts
            JOIN emails e
                ON e.user_id = ts.user_id AND e.email_id = ts.email_id
            WHERE ts.user_id = ?
        """
        params: list[Any] = [user_id]
        if visible_only:
            sql += " AND ts.visible_in_feed = 1"
        sql += " ORDER BY COALESCE(ts.deadline_date, e.email_date) ASC, ts.created_at ASC"
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        return [_row_to_summary_item(row) for row in self._fetchall(sql, tuple(params))]

    def get_preferences(self, user_id: str) -> dict[str, bool]:
        preferences = {category: True for category in CATEGORIES}
        preferences["events"] = False
        rows = self._fetchall(
            "SELECT category, enabled FROM user_preferences WHERE user_id = ?",
            (user_id,),
        )
        for row in rows:
            if row["category"] in preferences:
                preferences[row["category"]] = bool(row["enabled"])
        return preferences

    def set_preferences(self, user_id: str, preferences: dict[str, bool]) -> dict[str, bool]:
        updated_at = _now()
        with self._lock:
            for category, enabled in preferences.items():
                if category not in CATEGORIES:
                    continue
                self._conn.execute(
                    """
                    INSERT INTO user_preferences (user_id, category, enabled, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id, category) DO UPDATE SET
                        enabled = excluded.enabled,
                        updated_at = excluded.updated_at
                    """,
                    (user_id, category, int(enabled), updated_at),
                )
            self._conn.commit()
        return self.get_preferences(user_id)

    def refresh_summary_visibility(self, user_id: str) -> None:
        preferences = self.get_preferences(user_id)
        with self._lock:
            for category, enabled in preferences.items():
                self._conn.execute(
                    """
                    UPDATE triage_summaries
                    SET visible_in_feed = ?
                    WHERE user_id = ? AND category = ?
                    """,
                    (int(enabled), user_id, category),
                )
            self._conn.commit()

    def category_enabled(self, user_id: str, category: str) -> bool:
        return self.get_preferences(user_id).get(category, True)

    def add_chat_message(self, user_id: str, session_id: str, role: str, content: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO chat_messages (user_id, session_id, role, content, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, session_id, role, content, _now()),
            )
            self._conn.commit()

    def chat_history(
        self,
        user_id: str,
        session_id: str,
        limit: int,
    ) -> list[tuple[str, str]]:
        rows = self._fetchall(
            """
            SELECT role, content FROM (
                SELECT role, content, id
                FROM chat_messages
                WHERE user_id = ? AND session_id = ?
                ORDER BY id DESC
                LIMIT ?
            )
            ORDER BY id ASC
            """,
            (user_id, session_id, limit),
        )
        return [(str(row["role"]), str(row["content"])) for row in rows]

    def save_feedback(
        self,
        user_id: str,
        summary_id: str | None,
        email_id: str | None,
        override_category: str,
        notes: str | None = None,
    ) -> str:
        feedback_id = str(uuid.uuid4())
        original_category = None
        if summary_id:
            summary = self.get_summary(user_id, summary_id)
            if summary:
                original_category = summary["category"]
                email_id = email_id or summary["email_id"]
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO classification_overrides (
                    id, user_id, summary_id, email_id, original_category,
                    override_category, notes, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback_id,
                    user_id,
                    summary_id,
                    email_id,
                    original_category,
                    override_category,
                    notes,
                    _now(),
                ),
            )
            self._conn.commit()
        return feedback_id

    def feedback_count(self, user_id: str) -> int:
        row = self._fetchone(
            "SELECT COUNT(*) AS count FROM classification_overrides WHERE user_id = ?",
            (user_id,),
        )
        return int(row["count"]) if row else 0

    def create_notification_job(
        self,
        user_id: str,
        summary_id: str,
        deadline_date: str | None,
        channel: str = "websocket",
        status: str = "stubbed",
    ) -> str:
        job_id = str(uuid.uuid4())
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO notification_jobs (
                    id, user_id, summary_id, deadline_date, channel, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, user_id, summary_id, deadline_date, channel, status, _now()),
            )
            self._conn.commit()
        return job_id

    def _fetchone(self, sql: str, params: tuple[Any, ...]) -> sqlite3.Row | None:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return cursor.fetchone()

    def _fetchall(self, sql: str, params: tuple[Any, ...]) -> list[sqlite3.Row]:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return list(cursor.fetchall())


def _summary_id(user_id: str, email_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"swiftmemo:{user_id}:{email_id}"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_email(row: sqlite3.Row) -> EmailRecord:
    return EmailRecord(
        id=row["email_id"],
        sender=row["sender"],
        subject=row["subject"],
        date=row["email_date"],
        body=row["body"],
    )


def _row_to_summary_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "summary_id": row["summary_id"],
        "email_id": row["email_id"],
        "source_subject": row["source_subject"],
        "sender": row["sender"],
        "email_date": row["email_date"],
        "title": row["title"],
        "summary": row["summary"],
        "deadline_date": row["deadline_date"],
        "category": row["category"],
        "urgency_score": row["urgency_score"],
        "visible_in_feed": bool(row["visible_in_feed"]),
        "created_at": row["created_at"],
    }


DATABASE = SwiftMemoDB()

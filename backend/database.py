import json
import re
import sqlite3
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
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
                    is_institutional INTEGER NOT NULL DEFAULT 0,
                    email_kind TEXT NOT NULL DEFAULT 'other',
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

                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    affiliation TEXT NOT NULL,
                    interests_json TEXT NOT NULL,
                    deadlines_json TEXT NOT NULL,
                    schedules_json TEXT NOT NULL,
                    freeform_context TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS topic_suggestions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    source_count INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    sample_subjects_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE (user_id, label)
                );
                """
            )
            self._migrate_schema_locked()
            self._conn.commit()

    def _migrate_schema_locked(self) -> None:
        email_columns = {
            row["name"]
            for row in self._conn.execute("PRAGMA table_info(emails)").fetchall()
        }
        if "is_institutional" not in email_columns:
            self._conn.execute(
                "ALTER TABLE emails ADD COLUMN is_institutional INTEGER NOT NULL DEFAULT 0"
            )
        if "email_kind" not in email_columns:
            self._conn.execute(
                "ALTER TABLE emails ADD COLUMN email_kind TEXT NOT NULL DEFAULT 'other'"
            )

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
                    guardrail_valid, guardrail_reason, guardrail_confidence,
                    is_institutional, email_kind, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, email_id) DO UPDATE SET
                    sender = excluded.sender,
                    subject = excluded.subject,
                    email_date = excluded.email_date,
                    body = excluded.body,
                    guardrail_valid = excluded.guardrail_valid,
                    guardrail_reason = excluded.guardrail_reason,
                    guardrail_confidence = excluded.guardrail_confidence,
                    is_institutional = excluded.is_institutional,
                    email_kind = excluded.email_kind
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
                    int(guardrail.is_institutional),
                    guardrail.email_kind,
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

    def valid_emails(
        self,
        user_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[EmailRecord]:
        sql = """
            SELECT * FROM emails
            WHERE user_id = ? AND guardrail_valid = 1
            ORDER BY email_date ASC
        """
        params: tuple[Any, ...] = (user_id,)
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            params = (user_id, limit, offset)
        elif offset:
            sql += " LIMIT -1 OFFSET ?"
            params = (user_id, offset)
        rows = self._fetchall(sql, params)
        return [_row_to_email(row) for row in rows]

    def unprocessed_valid_emails(self, user_id: str, limit: int) -> list[EmailRecord]:
        return self.unprocessed_emails(user_id, limit=limit)

    def unprocessed_emails(self, user_id: str, limit: int) -> list[EmailRecord]:
        rows = self._fetchall(
            """
            SELECT e.*
            FROM emails e
            LEFT JOIN triage_summaries ts
                ON ts.user_id = e.user_id AND ts.email_id = e.email_id
            WHERE e.user_id = ?
                AND ts.summary_id IS NULL
            ORDER BY e.email_date ASC, e.email_id ASC
            LIMIT ?
            """,
            (user_id, limit),
        )
        return [_row_to_email(row) for row in rows]

    def processing_notes(
        self,
        user_id: str,
        limit: int | None = None,
    ) -> list[IngestedEmail]:
        sql = """
            SELECT * FROM emails
            WHERE user_id = ? AND guardrail_valid = 0
            ORDER BY created_at DESC, email_date DESC, email_id ASC
        """
        params: tuple[Any, ...] = (user_id,)
        if limit is not None:
            sql += " LIMIT ?"
            params = (user_id, limit)
        rows = self._fetchall(sql, params)
        return [_row_to_ingested(row) for row in rows]

    def rejected_emails(
        self,
        user_id: str,
        limit: int | None = None,
    ) -> list[IngestedEmail]:
        return self.processing_notes(user_id, limit=limit)

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

    def get_profile(self, user_id: str) -> dict[str, Any]:
        row = self._fetchone(
            "SELECT * FROM user_profiles WHERE user_id = ?",
            (user_id,),
        )
        if not row:
            return {
                "user_id": user_id,
                "role": "",
                "affiliation": "",
                "interests": [],
                "deadlines": [],
                "schedules": [],
                "freeform_context": "",
                "updated_at": None,
            }
        return _row_to_profile(row)

    def set_profile(
        self,
        user_id: str,
        *,
        role: str,
        affiliation: str,
        interests: list[str],
        deadlines: list[str],
        schedules: list[str],
        freeform_context: str,
    ) -> dict[str, Any]:
        updated_at = _now()
        cleaned_interests = _clean_string_list(interests)
        cleaned_deadlines = _clean_string_list(deadlines)
        cleaned_schedules = _clean_string_list(schedules)
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO user_profiles (
                    user_id, role, affiliation, interests_json, deadlines_json,
                    schedules_json, freeform_context, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    role = excluded.role,
                    affiliation = excluded.affiliation,
                    interests_json = excluded.interests_json,
                    deadlines_json = excluded.deadlines_json,
                    schedules_json = excluded.schedules_json,
                    freeform_context = excluded.freeform_context,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    role.strip(),
                    affiliation.strip(),
                    json.dumps(cleaned_interests),
                    json.dumps(cleaned_deadlines),
                    json.dumps(cleaned_schedules),
                    freeform_context.strip(),
                    updated_at,
                ),
            )
            self._conn.commit()
        return self.get_profile(user_id)

    def add_profile_interest(self, user_id: str, label: str) -> dict[str, Any]:
        profile = self.get_profile(user_id)
        interests = list(profile["interests"])
        if label and not any(item.lower() == label.lower() for item in interests):
            interests.append(label)
        return self.set_profile(
            user_id,
            role=profile["role"],
            affiliation=profile["affiliation"],
            interests=interests,
            deadlines=profile["deadlines"],
            schedules=profile["schedules"],
            freeform_context=profile["freeform_context"],
        )

    def discover_topic_suggestions(self, user_id: str) -> None:
        summaries = self.list_summaries(user_id, visible_only=False)
        counts: Counter[str] = Counter()
        subjects: dict[str, list[str]] = defaultdict(list)
        for item in summaries:
            text = " ".join(
                [
                    str(item["source_subject"]),
                    str(item["title"]),
                    str(item["summary"]),
                    str(item["sender"]),
                ]
            )
            for label in _topic_candidates(text):
                counts[label] += 1
                if len(subjects[label]) < 3 and item["source_subject"] not in subjects[label]:
                    subjects[label].append(str(item["source_subject"]))

        now = _now()
        with self._lock:
            for label, source_count in counts.items():
                if source_count < 2:
                    continue
                topic_id = _topic_id(user_id, label)
                self._conn.execute(
                    """
                    INSERT INTO topic_suggestions (
                        id, user_id, label, source_count, status,
                        sample_subjects_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
                    ON CONFLICT(user_id, label) DO UPDATE SET
                        source_count = excluded.source_count,
                        sample_subjects_json = excluded.sample_subjects_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        topic_id,
                        user_id,
                        label,
                        source_count,
                        json.dumps(subjects[label]),
                        now,
                        now,
                    ),
                )
            self._conn.commit()

    def list_topic_suggestions(
        self,
        user_id: str,
        statuses: tuple[str, ...] | None = None,
    ) -> list[dict[str, Any]]:
        self.discover_topic_suggestions(user_id)
        sql = "SELECT * FROM topic_suggestions WHERE user_id = ?"
        params: list[Any] = [user_id]
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            sql += f" AND status IN ({placeholders})"
            params.extend(statuses)
        sql += " ORDER BY status ASC, source_count DESC, label ASC"
        return [_row_to_topic(row) for row in self._fetchall(sql, tuple(params))]

    def set_topic_status(
        self,
        user_id: str,
        topic_id: str,
        status: str,
    ) -> dict[str, Any]:
        if status not in {"active", "dismissed", "pending"}:
            raise ValueError(f"Unsupported topic status: {status}")
        self.discover_topic_suggestions(user_id)
        existing = self._fetchone(
            "SELECT * FROM topic_suggestions WHERE user_id = ? AND id = ?",
            (user_id, topic_id),
        )
        if not existing:
            raise KeyError(topic_id)
        with self._lock:
            self._conn.execute(
                """
                UPDATE topic_suggestions
                SET status = ?, updated_at = ?
                WHERE user_id = ? AND id = ?
                """,
                (status, _now(), user_id, topic_id),
            )
            self._conn.commit()
        topic = _row_to_topic(
            self._fetchone(
                "SELECT * FROM topic_suggestions WHERE user_id = ? AND id = ?",
                (user_id, topic_id),
            )
        )
        profile = (
            self.add_profile_interest(user_id, topic["label"])
            if status == "active"
            else self.get_profile(user_id)
        )
        return {"topic": topic, "profile": profile}

    def daily_digest(self, user_id: str, digest_date: date) -> dict[str, Any]:
        target = digest_date.isoformat()
        items = self._digest_items(user_id)
        today_items = [item for item in items if str(item["email_date"])[:10] == target]
        deadlines = [item for item in items if item["deadline_date"] == target]
        important = _unique_digest_items(
            [
                item
                for item in today_items + deadlines
                if item["urgency_score"] >= 4 or item["deadline_date"] == target
            ]
        )
        personal_service_updates = [
            item
            for item in today_items
            if item["email_kind"]
            in {"personal", "lms_notification", "service_notification", "promotional"}
        ]
        topics = self.list_topic_suggestions(user_id, statuses=("active", "pending"))
        suggested = [topic for topic in topics if topic["status"] == "pending"]
        return {
            "user_id": user_id,
            "digest_date": digest_date,
            "important_emails": important,
            "deadlines": deadlines,
            "personal_service_updates": personal_service_updates,
            "recurring_topics": topics,
            "suggested_interests": suggested,
        }

    def _digest_items(self, user_id: str) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT
                ts.*,
                e.subject AS source_subject,
                e.sender,
                e.email_date,
                e.is_institutional,
                e.email_kind
            FROM triage_summaries ts
            JOIN emails e
                ON e.user_id = ts.user_id AND e.email_id = ts.email_id
            WHERE ts.user_id = ?
            ORDER BY COALESCE(ts.deadline_date, e.email_date) ASC, ts.created_at ASC
            """,
            (user_id,),
        )
        return [_row_to_digest_item(row) for row in rows]

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


def _row_to_ingested(row: sqlite3.Row) -> IngestedEmail:
    return IngestedEmail(
        email=_row_to_email(row),
        guardrail=GuardrailResult(
            is_valid=bool(row["guardrail_valid"]),
            reason=row["guardrail_reason"],
            confidence=row["guardrail_confidence"],
            is_institutional=bool(row["is_institutional"]),
            email_kind=row["email_kind"],
        ),
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


def _row_to_digest_item(row: sqlite3.Row) -> dict[str, Any]:
    item = _row_to_summary_item(row)
    item["email_kind"] = row["email_kind"]
    item["is_institutional"] = bool(row["is_institutional"])
    return item


def _row_to_profile(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "user_id": row["user_id"],
        "role": row["role"],
        "affiliation": row["affiliation"],
        "interests": _json_list(row["interests_json"]),
        "deadlines": _json_list(row["deadlines_json"]),
        "schedules": _json_list(row["schedules_json"]),
        "freeform_context": row["freeform_context"],
        "updated_at": row["updated_at"],
    }


def _row_to_topic(row: sqlite3.Row | None) -> dict[str, Any]:
    if row is None:
        raise KeyError("Unknown topic suggestion")
    return {
        "id": row["id"],
        "label": row["label"],
        "source_count": row["source_count"],
        "status": row["status"],
        "sample_subjects": _json_list(row["sample_subjects_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _clean_string_list(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        label = str(value).strip()
        key = label.lower()
        if not label or key in seen:
            continue
        cleaned.append(label)
        seen.add(key)
    return cleaned


def _topic_id(user_id: str, label: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"swiftmemo-topic:{user_id}:{label.lower()}"))


def _topic_candidates(text: str) -> set[str]:
    normalized = re.sub(r"[^a-z0-9]+", " ", text.lower())
    words = [word for word in normalized.split() if word not in _TOPIC_STOP_WORDS]
    candidates: set[str] = set()
    known_phrases = {
        "canvas": ("canvas", "instructure", "assignment graded", "graded"),
        "service receipts": ("receipt", "invoice", "subscription", "billing"),
        "security alerts": ("security alert", "password", "login", "account update"),
        "meetings": ("meeting", "meet", "appointment", "schedule"),
        "promotions": ("discount", "promo", "sale", "voucher", "limited time"),
        "events": ("webinar", "workshop", "event", "general assembly"),
        "deadlines": ("deadline", "due", "not later than", "by july", "by august"),
    }
    for label, phrases in known_phrases.items():
        if any(phrase in normalized for phrase in phrases):
            candidates.add(label)
    for word in words:
        if len(word) >= 5 and not word.isdigit():
            candidates.add(word)
    for first, second in zip(words, words[1:]):
        if len(first) >= 4 and len(second) >= 4:
            candidates.add(f"{first} {second}")
    return candidates


def _unique_digest_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = str(item["summary_id"])
        if key in seen:
            continue
        unique.append(item)
        seen.add(key)
    return unique


_TOPIC_STOP_WORDS = {
    "about",
    "after",
    "again",
    "all",
    "and",
    "announcement",
    "are",
    "before",
    "been",
    "body",
    "class",
    "dlsu",
    "email",
    "from",
    "has",
    "have",
    "help",
    "into",
    "later",
    "message",
    "not",
    "office",
    "please",
    "posted",
    "subject",
    "that",
    "the",
    "this",
    "will",
    "with",
    "your",
}


DATABASE = SwiftMemoDB()

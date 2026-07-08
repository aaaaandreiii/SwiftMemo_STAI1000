from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend import main
from backend.database import SwiftMemoDB
from backend.schemas import EmailRecord, GuardrailResult, IngestedEmail, TriageSummary


def sample_email(email_id: str = "email-1", subject: str = "HDA: Event") -> EmailRecord:
    return EmailRecord(
        id=email_id,
        sender="helpdesk@dlsu.edu.ph",
        subject=subject,
        date=datetime.fromisoformat("2026-07-08T09:00:00+08:00"),
        body="The Office announces a required activity by July 15, 2026.",
    )


def sample_guardrail() -> GuardrailResult:
    return GuardrailResult(is_valid=True, reason="official", confidence=0.9)


def sample_summary(category: str = "academic", urgency_score: int = 4) -> TriageSummary:
    return TriageSummary(
        title="Enrollment",
        summary="Confirm enrollment before the announced deadline.",
        deadline_date="2026-07-15",
        category=category,
        urgency_score=urgency_score,
    )


def test_triage_summary_rejects_invalid_urgency_score():
    with pytest.raises(ValidationError):
        sample_summary(urgency_score=6)


def test_sqlite_tenant_isolation(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    item = IngestedEmail(email=sample_email(), guardrail=sample_guardrail())
    db.save_ingested("tenant-a", item)
    db.save_ingested("tenant-b", item)

    assert db.get_email("tenant-a", "email-1") is not None
    assert db.get_email("tenant-c", "email-1") is None
    assert len(db.valid_emails("tenant-a")) == 1
    assert len(db.valid_emails("tenant-c")) == 0


def test_disabled_category_hidden_from_feed_but_available_in_archive(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    email = sample_email(subject="HDA: Student Organization Renewal")
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    db.set_preferences(user_id, {"events": False, "academic": True})
    summary = sample_summary(category="events")
    db.save_triage(user_id, email.id, summary, db.category_enabled(user_id, summary.category))

    assert db.list_summaries(user_id, visible_only=True) == []
    archived = db.list_summaries(user_id, visible_only=False)
    assert len(archived) == 1
    assert archived[0]["category"] == "events"
    assert archived[0]["visible_in_feed"] is False


def test_chat_memory_separated_by_user_for_same_session(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    db.add_chat_message("tenant-a", "same-session", "user", "Question A")
    db.add_chat_message("tenant-b", "same-session", "user", "Question B")

    assert db.chat_history("tenant-a", "same-session", 10) == [("user", "Question A")]
    assert db.chat_history("tenant-b", "same-session", 10) == [("user", "Question B")]


def test_feedback_endpoint_inserts_override_and_audio_stub_returns_wav(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    monkeypatch.setattr(main, "DATABASE", db)
    user_id = "tenant-a"
    email = sample_email()
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    summary_id = db.save_triage(user_id, email.id, sample_summary(), True)

    client = TestClient(main.app)
    feedback = client.post(
        "/api/feedback",
        json={
            "summary_id": summary_id,
            "override_category": "administrative",
            "notes": "Should be admin.",
        },
        headers={"X-User-ID": user_id},
    )
    assert feedback.status_code == 200
    assert feedback.json()["status"] == "recorded"
    assert db.feedback_count(user_id) == 1

    audio = client.get(
        f"/api/summary/audio/{summary_id}",
        headers={"X-User-ID": user_id},
    )
    assert audio.status_code == 200
    assert audio.headers["content-type"].startswith("audio/wav")
    assert audio.content.startswith(b"RIFF")

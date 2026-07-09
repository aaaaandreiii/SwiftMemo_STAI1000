from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend import agents
from backend import main
from backend.database import SwiftMemoDB
from backend.schemas import EmailRecord, GuardrailResult, IngestedEmail, ProcessedEmail, TriageSummary


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


def skipped_guardrail(reason: str = "unreadable or skipped record") -> GuardrailResult:
    return GuardrailResult(is_valid=False, reason=reason, confidence=0.8)


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


def test_ingest_endpoint_supports_mock_limit_and_offset(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    monkeypatch.setattr(main, "DATABASE", db)
    emails = [sample_email(f"email-{index}", subject=f"HDA: Event {index}") for index in range(3)]

    def fake_load_mock_emails(limit=None, offset=0, path=None):
        selected = emails[offset:]
        return selected[:limit] if limit is not None else selected

    monkeypatch.setattr(main, "load_mock_emails", fake_load_mock_emails)
    monkeypatch.setattr(main, "validate_announcement", lambda email: sample_guardrail())

    client = TestClient(main.app)
    response = client.post(
        "/api/ingest",
        json={"load_mock": True, "limit": 1, "offset": 1},
        headers={"X-User-ID": "tenant-a"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["accepted_count"] == 1
    assert payload["rejected_count"] == 0
    assert payload["accepted"][0]["email"]["id"] == "email-1"
    assert db.get_email("tenant-a", "email-0") is None
    assert db.get_email("tenant-a", "email-1") is not None


def test_processing_notes_endpoint_lists_only_current_tenant_skips(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    monkeypatch.setattr(main, "DATABASE", db)
    db.save_ingested(
        "tenant-a",
        IngestedEmail(
            email=sample_email("accepted-a", subject="HDA: Accepted"),
            guardrail=sample_guardrail(),
        ),
    )
    db.save_ingested(
        "tenant-a",
        IngestedEmail(
            email=sample_email("skipped-a", subject="Canvas Grade Posted"),
            guardrail=skipped_guardrail("legacy skipped record"),
        ),
    )
    db.save_ingested(
        "tenant-b",
        IngestedEmail(
            email=sample_email("skipped-b", subject="Other Tenant Skip"),
            guardrail=skipped_guardrail("wrong tenant"),
        ),
    )

    client = TestClient(main.app)
    response = client.get("/api/processing-notes", headers={"X-User-ID": "tenant-a"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == "tenant-a"
    assert payload["count"] == 1
    assert payload["items"][0]["email"]["id"] == "skipped-a"
    assert payload["items"][0]["guardrail"]["reason"] == "legacy skipped record"


def test_ingest_endpoint_accepts_all_readable_email_kinds(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    monkeypatch.setattr(main, "DATABASE", db)
    emails = [
        EmailRecord(
            id="personal-1",
            sender="friend@example.com",
            subject="Dinner later?",
            date=datetime.fromisoformat("2026-07-08T18:00:00+08:00"),
            body="Are you free after class? Where to eat near campus?",
        ),
        EmailRecord(
            id="canvas-1",
            sender="notifications@instructure.com",
            subject="Assignment Graded: Lab",
            date=datetime.fromisoformat("2026-07-08T19:00:00+08:00"),
            body="Your assignment has been graded.",
        ),
        EmailRecord(
            id="promo-1",
            sender="deals@example.com",
            subject="Limited time laptop sale",
            date=datetime.fromisoformat("2026-07-08T20:00:00+08:00"),
            body="Buy discounted accessories today.",
        ),
    ]

    def fake_load_mock_emails(limit=None, offset=0, path=None):
        selected = emails[offset:]
        return selected[:limit] if limit is not None else selected

    monkeypatch.setattr(main, "load_mock_emails", fake_load_mock_emails)

    client = TestClient(main.app)
    response = client.post(
        "/api/ingest",
        json={"load_mock": True},
        headers={"X-User-ID": "tenant-a"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["accepted_count"] == 3
    assert payload["rejected_count"] == 0
    assert {item["guardrail"]["email_kind"] for item in payload["accepted"]} == {
        "personal",
        "lms_notification",
        "promotional",
    }


def install_fast_process_stub(monkeypatch, db: SwiftMemoDB) -> None:
    monkeypatch.setattr(agents, "DATABASE", db)

    def fake_process_email_fast(
        email: EmailRecord,
        user_id: str,
        guardrail: GuardrailResult | None = None,
    ) -> ProcessedEmail:
        final_guardrail = guardrail or sample_guardrail()
        summary = sample_summary()
        summary_id = db.save_triage(user_id, email.id, summary, True)
        return ProcessedEmail(
            email_id=email.id,
            source_subject=email.subject,
            guardrail=final_guardrail,
            result=summary,
            summary_id=summary_id,
            visible_in_feed=True,
            tool_observation="test stub",
        )

    monkeypatch.setattr(agents, "process_email_fast", fake_process_email_fast)


def test_process_endpoint_skips_emails_that_already_have_summaries(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    for index in range(3):
        email = sample_email(f"email-{index}", subject=f"HDA: Event {index}")
        db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    db.save_triage(user_id, "email-0", sample_summary(), True)
    install_fast_process_stub(monkeypatch, db)

    client = TestClient(main.app)
    response = client.post(
        "/api/process",
        json={"limit": 5, "offset": 0},
        headers={"X-User-ID": user_id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["processed_count"] == 2
    assert [item["email_id"] for item in payload["items"]] == ["email-1", "email-2"]


def test_process_endpoint_processes_legacy_guardrail_invalid_emails(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    email = sample_email("legacy-invalid", subject="Canvas Grade Posted")
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=skipped_guardrail()))
    install_fast_process_stub(monkeypatch, db)

    client = TestClient(main.app)
    response = client.post(
        "/api/process",
        json={"limit": 5, "offset": 0},
        headers={"X-User-ID": user_id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["processed_count"] == 1
    assert payload["items"][0]["email_id"] == "legacy-invalid"


def test_process_endpoint_limit_one_processes_distinct_emails_until_empty(
    monkeypatch,
    tmp_path,
):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    for index in range(2):
        email = sample_email(f"email-{index}", subject=f"HDA: Event {index}")
        db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    install_fast_process_stub(monkeypatch, db)

    client = TestClient(main.app)
    first = client.post(
        "/api/process",
        json={"limit": 1, "offset": 0},
        headers={"X-User-ID": user_id},
    )
    second = client.post(
        "/api/process",
        json={"limit": 1, "offset": 0},
        headers={"X-User-ID": user_id},
    )
    third = client.post(
        "/api/process",
        json={"limit": 1, "offset": 0},
        headers={"X-User-ID": user_id},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200
    assert first.json()["processed_count"] == 1
    assert second.json()["processed_count"] == 1
    assert third.json()["processed_count"] == 0
    assert first.json()["items"][0]["email_id"] == "email-0"
    assert second.json()["items"][0]["email_id"] == "email-1"
    assert third.json()["items"] == []


def test_personal_email_heuristic_summary():
    email = EmailRecord(
        id="personal-summary",
        sender="friend@example.com",
        subject="Dinner later?",
        date=datetime.fromisoformat("2026-07-08T18:00:00+08:00"),
        body="Are you free after class? We can discuss the project over dinner.",
    )

    summary = agents.heuristic_extract_summary(email)

    assert summary.title == "Dinner later?"
    assert "free after class" in summary.summary
    assert summary.category == "other"


def test_topic_suggestion_generation_from_repeated_noninstitutional_emails(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    guardrail = GuardrailResult(
        is_valid=True,
        reason="lms",
        confidence=0.9,
        email_kind="lms_notification",
    )
    for index in range(2):
        email = EmailRecord(
            id=f"canvas-{index}",
            sender="notifications@instructure.com",
            subject=f"Canvas Assignment Graded {index}",
            date=datetime.fromisoformat(f"2026-07-0{index + 8}T10:00:00+08:00"),
            body="Your Canvas assignment has been graded.",
        )
        db.save_ingested(user_id, IngestedEmail(email=email, guardrail=guardrail))
        db.save_triage(
            user_id,
            email.id,
            TriageSummary(
                title="Canvas assignment graded",
                summary="Canvas posted an assignment grade notification.",
                deadline_date=None,
                category="academic",
                urgency_score=2,
            ),
            True,
        )

    suggestions = db.list_topic_suggestions(user_id, statuses=("pending",))

    canvas = [item for item in suggestions if item["label"] == "canvas"]
    assert canvas
    assert canvas[0]["source_count"] == 2


def test_daily_digest_results_for_selected_date(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    digest_day = date(2026, 7, 9)
    personal = EmailRecord(
        id="personal-update",
        sender="friend@example.com",
        subject="Project check-in",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body="Can we meet today to review the project?",
    )
    deadline = EmailRecord(
        id="deadline-update",
        sender="registrar@dlsu.edu.ph",
        subject="Enrollment deadline",
        date=datetime.fromisoformat("2026-07-08T09:00:00+08:00"),
        body="Confirm enrollment by July 9, 2026.",
    )
    db.save_ingested(
        user_id,
        IngestedEmail(
            email=personal,
            guardrail=GuardrailResult(
                is_valid=True,
                reason="personal",
                confidence=0.9,
                email_kind="personal",
            ),
        ),
    )
    db.save_ingested(
        user_id,
        IngestedEmail(
            email=deadline,
            guardrail=GuardrailResult(
                is_valid=True,
                reason="institutional",
                confidence=0.9,
                is_institutional=True,
                email_kind="institutional",
            ),
        ),
    )
    db.save_triage(
        user_id,
        personal.id,
        TriageSummary(
            title="Project check-in",
            summary="A friend asked to meet today to review the project.",
            deadline_date=None,
            category="other",
            urgency_score=4,
        ),
        True,
    )
    db.save_triage(
        user_id,
        deadline.id,
        TriageSummary(
            title="Enrollment deadline",
            summary="Confirm enrollment by the deadline.",
            deadline_date=digest_day,
            category="academic",
            urgency_score=5,
        ),
        True,
    )

    digest = db.daily_digest(user_id, digest_day)

    assert [item["email_id"] for item in digest["deadlines"]] == ["deadline-update"]
    assert [item["email_id"] for item in digest["personal_service_updates"]] == [
        "personal-update"
    ]
    assert {item["email_id"] for item in digest["important_emails"]} == {
        "personal-update",
        "deadline-update",
    }

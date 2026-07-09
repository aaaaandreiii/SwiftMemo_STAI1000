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


def test_demo_reset_clears_tenant_archive_but_keeps_profile_preferences(monkeypatch, tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    monkeypatch.setattr(main, "DATABASE", db)
    user_id = "tenant-a"
    email = sample_email("reset-a", subject="HDA: Reset A")
    other_email = sample_email("reset-b", subject="HDA: Reset B")
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    db.save_ingested("tenant-b", IngestedEmail(email=other_email, guardrail=sample_guardrail()))
    summary_id = db.save_triage(user_id, email.id, sample_summary(), True)
    db.add_chat_message(user_id, "default", "user", "What is due?")
    db.save_feedback(user_id, summary_id, email.id, "administrative", "demo recategorization")
    db.create_notification_job(user_id, summary_id, "2026-07-15")
    db.set_preferences(user_id, {"events": False, "academic": True})
    db.set_profile(
        user_id,
        role="Student",
        affiliation="CCS",
        campus="Manila",
        interests=["Canvas"],
        deadlines=["Enrollment"],
        schedules=[],
        freeform_context="Demo profile",
    )

    class FakeRagService:
        cleared: list[str] = []

        def clear_user_index(self, cleared_user_id: str) -> None:
            self.cleared.append(cleared_user_id)

    fake_rag = FakeRagService()
    monkeypatch.setattr(main, "RAG_SERVICE", fake_rag)

    client = TestClient(main.app)
    response = client.post("/api/demo/reset", headers={"X-User-ID": user_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "cleared"
    assert payload["deleted"]["emails"] == 1
    assert payload["deleted"]["triage_summaries"] == 1
    assert fake_rag.cleared == [user_id]
    assert db.get_email(user_id, email.id) is None
    assert db.list_summaries(user_id, visible_only=False) == []
    assert db.chat_history(user_id, "default", 10) == []
    assert db.feedback_count(user_id) == 0
    assert db.get_email("tenant-b", other_email.id) is not None
    assert db.get_preferences(user_id)["academic"] is True
    assert db.get_preferences(user_id)["events"] is False
    assert db.get_profile(user_id)["role"] == "Student"


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


def test_lspo_daily_masses_are_not_urgent_administrative_deadlines():
    email = EmailRecord(
        id="lspo-mass",
        sender="announcement@dlsu.edu.ph",
        subject="[LSPO] Daily Masses on Campus",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body=(
            "The Lasallian Pastoral Office announces the daily Masses on campus. "
            "Masses will be held on July 12, 2026 at the Chapel. "
            "The schedule is for the DLSU community."
        ),
    )

    summary = agents.heuristic_extract_summary(email)

    assert summary.category in {"events", "other"}
    assert summary.deadline_date is None
    assert summary.urgency_score == 2


@pytest.mark.parametrize(
    ("subject", "expected_deadline"),
    [
        ("Juan dela Cruz just sent you a message in Canvas", None),
        ("New event: STAI100 Midterm Consultation", date(2026, 7, 12)),
        ("Assignment Graded: VPC Hands on Lab 5.3", None),
    ],
)
def test_canvas_notifications_classify_as_canvas_tasks(subject, expected_deadline):
    email = EmailRecord(
        id=f"canvas-{subject[:8]}",
        sender="notifications@instructure.com",
        subject=subject,
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body=(
            "Canvas notification for STAI100. "
            "The related calendar date is July 12, 2026."
        ),
    )

    summary = agents.heuristic_extract_summary(email)

    assert summary.category == "canvas_tasks"
    assert summary.deadline_date == expected_deadline


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


def test_profile_match_ranks_above_unrelated_urgent_thesis_email(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    digest_day = date(2026, 7, 11)
    db.set_profile(
        user_id,
        role="Student",
        affiliation="CCS College of Computer Studies",
        campus="",
        interests=[],
        deadlines=[],
        schedules=[],
        freeform_context="",
    )
    ccs_email = sample_email(
        "ccs-thesis",
        subject="CCS Thesis Proposal Defense Submission",
    )
    dac_email = sample_email(
        "dac-thesis",
        subject="[DAC] MSA Thesis Final Defense - Mr. Dominic Narag",
    )
    db.save_ingested(user_id, IngestedEmail(email=ccs_email, guardrail=sample_guardrail()))
    db.save_ingested(user_id, IngestedEmail(email=dac_email, guardrail=sample_guardrail()))
    db.save_triage(
        user_id,
        ccs_email.id,
        TriageSummary(
            title="CCS Thesis Proposal Defense Submission",
            summary="CCS students must submit thesis proposal defense requirements.",
            deadline_date=digest_day,
            category="academic",
            urgency_score=4,
        ),
        True,
    )
    db.save_triage(
        user_id,
        dac_email.id,
        TriageSummary(
            title="DAC MSA Thesis Final Defense",
            summary="A DAC MSA final defense announcement is scheduled.",
            deadline_date=digest_day,
            category="academic",
            urgency_score=5,
        ),
        True,
    )

    summaries = db.list_summaries(user_id, visible_only=True)
    digest = db.daily_digest(user_id, digest_day)

    assert [item["email_id"] for item in summaries][:2] == ["ccs-thesis", "dac-thesis"]
    assert [item["email_id"] for item in digest["recommended_for_you"]] == ["ccs-thesis"]
    assert [item["email_id"] for item in digest["urgent_unmatched"]] == ["dac-thesis"]
    assert digest["recommended_for_you"][0]["relevance_score"] >= 18
    assert "Affiliation: ccs" in digest["recommended_for_you"][0]["relevance_reasons"]


@pytest.mark.parametrize(
    ("profile_affiliation", "subject"),
    [
        ("RVRCOB", "Ramon V. del Rosario College of Business enrollment briefing"),
        ("GCOE", "Gokongwei College of Engineering research colloquium"),
        ("CCS", "College of Computer Studies thesis submission"),
        ("COS", "College of Science undergraduate research forum"),
        ("CLA", "College of Liberal Arts advising reminder"),
        ("BAGCED", "Br. Andrew Gonzalez FSC College of Education seminar"),
        ("SOL", "Tanada-Diokno School of Law application announcement"),
        ("SOE", "School of Economics undergraduate conference"),
        ("School of Innovation and Sustainability (Laguna)", "SIS Laguna student briefing"),
    ],
)
def test_profile_context_maps_dlsu_college_aliases(
    tmp_path,
    profile_affiliation,
    subject,
):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    db.set_profile(
        user_id,
        role="Student",
        affiliation=profile_affiliation,
        campus="",
        interests=[],
        deadlines=[],
        schedules=[],
        freeform_context="",
    )
    email = sample_email("college-match", subject=subject)
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    db.save_triage(
        user_id,
        email.id,
        TriageSummary(
            title=subject,
            summary=f"{subject} is open to members of the target college or school.",
            deadline_date=None,
            category="academic",
            urgency_score=2,
        ),
        True,
    )

    item = db.list_summaries(user_id, visible_only=True)[0]

    assert item["email_id"] == "college-match"
    assert item["relevance_score"] >= 18
    assert item["relevance_reasons"]


def test_campus_profile_boosts_manila_and_demotes_laguna(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    db.set_profile(
        user_id,
        role="Student",
        affiliation="",
        campus="Taft",
        interests=[],
        deadlines=[],
        schedules=[],
        freeform_context="",
    )
    manila = EmailRecord(
        id="manila-event",
        sender="office@dlsu.edu.ph",
        subject="Town hall at DLSU Manila Campus",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body="The activity will be held at Henry Sy Sr. Hall, Taft.",
    )
    neutral = EmailRecord(
        id="neutral-event",
        sender="office@dlsu.edu.ph",
        subject="Online thesis briefing",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body="The briefing will be held online.",
    )
    laguna = EmailRecord(
        id="laguna-event",
        sender="office@dlsu.edu.ph",
        subject="Laguna Campus lab orientation",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body="The activity is only at DLSU Laguna Campus.",
    )
    for email in (laguna, neutral, manila):
        db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
        db.save_triage(
            user_id,
            email.id,
            TriageSummary(
                title=email.subject,
                summary=email.body,
                deadline_date=None,
                category="academic",
                urgency_score=3,
            ),
            True,
        )

    summaries = db.list_summaries(user_id, visible_only=True)

    assert [item["email_id"] for item in summaries] == [
        "manila-event",
        "neutral-event",
        "laguna-event",
    ]
    assert summaries[0]["campus_match"] == "match"
    assert summaries[-1]["campus_match"] == "mismatch"


def test_new_preferences_default_and_control_feed_visibility(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    preferences = db.get_preferences(user_id)

    assert preferences["canvas_tasks"] is True
    assert preferences["webinars_seminars_workshops"] is False
    assert preferences["exchange_programs"] is True
    assert preferences["library"] is True
    assert preferences["advertisement"] is False
    assert preferences["spam"] is False

    email = sample_email("canvas-pref", subject="Assignment Graded: Lab")
    db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
    db.set_preferences(user_id, {"canvas_tasks": False})
    summary = sample_summary(category="canvas_tasks", urgency_score=2)
    db.save_triage(user_id, email.id, summary, db.category_enabled(user_id, summary.category))

    assert db.list_summaries(user_id, visible_only=True) == []
    archived = db.list_summaries(user_id, visible_only=False)
    assert archived[0]["category"] == "canvas_tasks"
    assert archived[0]["visible_in_feed"] is False


def test_advertisement_and_spam_classify_and_default_hidden_from_feed_and_digest(tmp_path):
    db = SwiftMemoDB(tmp_path / "swiftmemo.db")
    user_id = "tenant-a"
    digest_day = date(2026, 7, 9)
    ad_email = EmailRecord(
        id="ad-1",
        sender="deals@example.com",
        subject="Limited time laptop sale",
        date=datetime.fromisoformat("2026-07-09T09:00:00+08:00"),
        body="Flash sale for discounted accessories. Use this voucher today. Unsubscribe anytime.",
    )
    spam_email = EmailRecord(
        id="spam-1",
        sender="unknown-winner@example.com",
        subject="Claim your prize now",
        date=datetime.fromisoformat("2026-07-09T10:00:00+08:00"),
        body="Congratulations you won. Click here to avoid suspension and claim your prize.",
    )

    ad_summary = agents.heuristic_extract_summary(ad_email)
    spam_summary = agents.heuristic_extract_summary(spam_email)

    assert ad_summary.category == "advertisement"
    assert spam_summary.category == "spam"
    assert db.category_enabled(user_id, "advertisement") is False
    assert db.category_enabled(user_id, "spam") is False

    for email, summary in ((ad_email, ad_summary), (spam_email, spam_summary)):
        db.save_ingested(user_id, IngestedEmail(email=email, guardrail=sample_guardrail()))
        db.save_triage(user_id, email.id, summary, db.category_enabled(user_id, summary.category))

    assert db.list_summaries(user_id, visible_only=True) == []
    archived = db.list_summaries(user_id, visible_only=False)
    assert {item["category"] for item in archived} == {"advertisement", "spam"}
    assert all(item["visible_in_feed"] is False for item in archived)

    digest = db.daily_digest(user_id, digest_day)
    assert digest["recommended_for_you"] == []
    assert digest["urgent_unmatched"] == []
    assert digest["important_emails"] == []
    assert digest["personal_service_updates"] == []

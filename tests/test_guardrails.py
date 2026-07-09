from datetime import datetime

from backend.guardrails import heuristic_validate_announcement, validate_announcement
from backend.schemas import EmailRecord


def test_instructure_assignment_grade_notification_is_accepted_and_classified():
    email = EmailRecord(
        id="hda-2026-008",
        sender="notifications@instructure.com",
        subject="Assignment Graded: VPC Hands on Lab 5.3",
        date=datetime.fromisoformat("2026-07-06T23:37:00+08:00"),
        body="Your assignment VPC Hands on Lab 5.3 has been graded.\ngraded: Jul 6 at 10:37pm",
    )

    result = validate_announcement(email)

    assert result.is_valid is True
    assert result.email_kind == "lms_notification"
    assert result.is_institutional is False


def test_canvas_message_and_event_notifications_are_accepted_by_heuristic():
    subjects = [
        "Maria Santos just sent you a message in Canvas",
        "New event: STAI100 Midterm Consultation",
        "Assignment Graded: Lab 4",
    ]

    for index, subject in enumerate(subjects):
        email = EmailRecord(
            id=f"canvas-pattern-{index}",
            sender="notifications@instructure.com",
            subject=subject,
            date=datetime.fromisoformat("2026-07-06T23:37:00+08:00"),
            body="Canvas course notification.",
        )

        result = heuristic_validate_announcement(email)

        assert result.is_valid is True
        assert result.email_kind == "lms_notification"
        assert result.is_institutional is False


def test_display_name_dlsu_help_desk_sender_is_accepted_by_heuristic():
    email = EmailRecord(
        id="real-hda-2026-001",
        sender="Help Desk Announcement <announcement@dlsu.edu.ph>",
        subject="[CDO] Scheduled Power Shutdown of Laguna Campus College Block",
        date=datetime.fromisoformat("2026-07-08T05:44:37+08:00"),
        body=(
            "Please be advised that a scheduled power shutdown will be implemented "
            "on campus on July 11, 2026. All concerned offices are advised to "
            "make the necessary preparations."
        ),
    )

    result = heuristic_validate_announcement(email)

    assert result.is_valid is True
    assert result.email_kind == "institutional"


def test_personal_message_is_accepted_and_classified_by_heuristic():
    email = EmailRecord(
        id="personal-1",
        sender="friend@example.com",
        subject="Dinner later?",
        date=datetime.fromisoformat("2026-07-06T18:00:00+08:00"),
        body="Are you free after class? Where to eat near campus?",
    )

    result = heuristic_validate_announcement(email)

    assert result.is_valid is True
    assert result.email_kind == "personal"
    assert result.is_institutional is False


def test_promotional_email_is_accepted_and_classified_by_heuristic():
    email = EmailRecord(
        id="promo-1",
        sender="deals@example.com",
        subject="Limited time laptop sale",
        date=datetime.fromisoformat("2026-07-06T12:00:00+08:00"),
        body="Buy discounted accessories today. Unsubscribe any time.",
    )

    result = heuristic_validate_announcement(email)

    assert result.is_valid is True
    assert result.email_kind == "promotional"


def test_service_notification_is_accepted_and_classified_by_heuristic():
    email = EmailRecord(
        id="service-1",
        sender="no-reply@github.com",
        subject="Security alert for your account",
        date=datetime.fromisoformat("2026-07-06T12:00:00+08:00"),
        body="A new login was detected. Review your account security settings.",
    )

    result = heuristic_validate_announcement(email)

    assert result.is_valid is True
    assert result.email_kind == "service_notification"


def test_unreadable_email_is_the_only_kind_skipped_by_heuristic():
    email = EmailRecord(
        id="empty-1",
        sender="unknown@example.com",
        subject=" ",
        date=datetime.fromisoformat("2026-07-06T12:00:00+08:00"),
        body=" ",
    )

    result = heuristic_validate_announcement(email)

    assert result.is_valid is False
    assert result.email_kind == "unreadable"

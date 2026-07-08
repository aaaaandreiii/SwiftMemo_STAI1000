from datetime import datetime

from backend.guardrails import heuristic_validate_announcement, validate_announcement
from backend.schemas import EmailRecord


def test_instructure_assignment_grade_notification_is_rejected():
    email = EmailRecord(
        id="hda-2026-008",
        sender="notifications@instructure.com",
        subject="Assignment Graded: VPC Hands on Lab 5.3",
        date=datetime.fromisoformat("2026-07-06T23:37:00+08:00"),
        body="Your assignment VPC Hands on Lab 5.3 has been graded.\ngraded: Jul 6 at 10:37pm",
    )

    result = validate_announcement(email)

    assert result.is_valid is False
    assert "LMS" in result.reason


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

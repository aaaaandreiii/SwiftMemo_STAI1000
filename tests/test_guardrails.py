from datetime import datetime

from backend.guardrails import validate_announcement
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

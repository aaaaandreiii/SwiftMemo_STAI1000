from backend.json_utils import extract_json_object
from backend.schemas import TriageSummary


def test_extract_json_object_from_fenced_response():
    parsed = extract_json_object(
        '```json\n{"title":"Enrollment","summary":"Confirm enrollment by the deadline.","deadline_date":"2026-07-15","category":"academic"}\n```'
    )
    summary = TriageSummary.model_validate(parsed)
    assert summary.title == "Enrollment"
    assert summary.category == "academic"


def test_extract_json_object_from_surrounding_text():
    parsed = extract_json_object('Here is the result: {"is_valid": true, "reason": "official", "confidence": 0.9}')
    assert parsed["is_valid"] is True


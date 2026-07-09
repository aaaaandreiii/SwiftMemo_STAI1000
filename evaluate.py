import json
from datetime import date

import mlflow
from pydantic import ValidationError

from backend.agents import heuristic_extract_summary, resolve_relative_date
from backend.guardrails import heuristic_validate_announcement
from backend.ingestion import load_mock_emails
from backend.schemas import TriageSummary
from backend.telemetry import configure_mlflow


def main() -> None:
    emails = load_mock_emails()
    expected_processable = {
        email.id: bool((email.subject or "").strip() or (email.body or "").strip())
        for email in emails
    }

    classifier_true_positive = 0
    classifier_false_positive = 0
    classifier_false_negative = 0
    schema_success = 0
    schema_total = 0

    for email in emails:
        result = heuristic_validate_announcement(email)
        expected = expected_processable[email.id]
        if result.is_valid and expected:
            classifier_true_positive += 1
        elif result.is_valid and not expected:
            classifier_false_positive += 1
        elif not result.is_valid and expected:
            classifier_false_negative += 1

        if expected:
            schema_total += 1
            try:
                summary = heuristic_extract_summary(email)
                TriageSummary.model_validate(summary.model_dump())
                schema_success += 1
            except (ValidationError, ValueError):
                pass

    precision_denominator = classifier_true_positive + classifier_false_positive
    recall_denominator = classifier_true_positive + classifier_false_negative
    classifier_precision = (
        classifier_true_positive / precision_denominator if precision_denominator else 0.0
    )
    classifier_recall = (
        classifier_true_positive / recall_denominator if recall_denominator else 0.0
    )
    schema_success_rate = schema_success / schema_total if schema_total else 0.0

    base = date(2026, 7, 8)
    calendar_cases = {
        "tomorrow": "2026-07-09",
        "next Friday": "2026-07-10",
        "in 3 days": "2026-07-11",
        "by Monday": "2026-07-13",
    }
    calendar_correct = 0
    for phrase, expected in calendar_cases.items():
        actual = resolve_relative_date(phrase, base)
        if actual and actual.isoformat() == expected:
            calendar_correct += 1
    calendar_accuracy = calendar_correct / len(calendar_cases)

    report = {
        "classifier_precision": round(classifier_precision, 4),
        "classifier_recall": round(classifier_recall, 4),
        "schema_validation_success_rate": round(schema_success_rate, 4),
        "calendar_relative_date_accuracy": round(calendar_accuracy, 4),
        "counts": {
            "emails": len(emails),
            "schema_total": schema_total,
            "calendar_cases": len(calendar_cases),
        },
    }

    if configure_mlflow():
        try:
            with mlflow.start_run(run_name="deterministic_evaluation"):
                for key in (
                    "classifier_precision",
                    "classifier_recall",
                    "schema_validation_success_rate",
                    "calendar_relative_date_accuracy",
                ):
                    mlflow.log_metric(key, report[key])
                mlflow.log_text(json.dumps(report, indent=2), "evaluation_report.json")
        except Exception:
            pass

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

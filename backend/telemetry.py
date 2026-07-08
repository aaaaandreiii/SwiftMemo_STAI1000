import json
import time
from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import urlparse
from urllib.request import urlopen

import mlflow

from backend.config import Settings, get_settings

_AUTOLOG_ATTEMPTED = False


def configure_mlflow(settings: Settings | None = None) -> bool:
    global _AUTOLOG_ATTEMPTED
    settings = settings or get_settings()
    if not _tracking_uri_available(settings.mlflow_tracking_uri):
        return False
    try:
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        mlflow.set_experiment(settings.mlflow_experiment)
        if not _AUTOLOG_ATTEMPTED:
            _AUTOLOG_ATTEMPTED = True
            try:
                mlflow.langchain.autolog(log_models=False)
            except Exception:
                # Manual metrics below are the source of truth; autolog is best
                # effort because MLflow/LangChain compatibility varies by version.
                pass
        return True
    except Exception:
        return False


def _tracking_uri_available(uri: str) -> bool:
    parsed = urlparse(uri)
    if parsed.scheme not in {"http", "https"}:
        return True
    try:
        with urlopen(f"{uri.rstrip('/')}/health", timeout=0.75) as response:
            return response.status < 500
    except Exception:
        return False


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4) if text else 0


def extract_token_usage(response: Any, prompt_text: str, response_text: str) -> dict[str, int]:
    usage = getattr(response, "usage_metadata", None) or {}
    response_metadata = getattr(response, "response_metadata", None) or {}
    token_usage = response_metadata.get("token_usage") or response_metadata.get("usage") or {}

    input_tokens = (
        usage.get("input_tokens")
        or usage.get("prompt_tokens")
        or token_usage.get("prompt_tokens")
        or _estimate_tokens(prompt_text)
    )
    output_tokens = (
        usage.get("output_tokens")
        or usage.get("completion_tokens")
        or token_usage.get("completion_tokens")
        or _estimate_tokens(response_text)
    )
    total_tokens = (
        usage.get("total_tokens")
        or token_usage.get("total_tokens")
        or int(input_tokens) + int(output_tokens)
    )
    return {
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "total_tokens": int(total_tokens),
    }


@contextmanager
def telemetry_run(
    operation: str,
    params: dict[str, Any] | None = None,
    prompt: str | None = None,
) -> Iterator[dict[str, Any]]:
    start = time.perf_counter()
    payload: dict[str, Any] = {"response": None, "token_usage": None, "extra_metrics": {}}
    active_run = None
    logging_enabled = False

    if configure_mlflow():
        try:
            active_run = mlflow.start_run(run_name=operation)
            active_run.__enter__()
            logging_enabled = True
        except Exception:
            active_run = None
            logging_enabled = False

    if logging_enabled:
        if params:
            for key, value in params.items():
                if value is not None:
                    try:
                        mlflow.log_param(key, value)
                    except Exception:
                        logging_enabled = False
                        break
        if prompt is not None:
            try:
                mlflow.log_text(prompt, "prompt.txt")
                mlflow.log_metric("input_chars", len(prompt))
            except Exception:
                logging_enabled = False

    try:
        yield payload
    finally:
        latency_ms = (time.perf_counter() - start) * 1000
        try:
            if logging_enabled:
                response_text = payload.get("response")
                token_usage = payload.get("token_usage")
                if token_usage is None:
                    output_text = str(response_text or "")
                    token_usage = {
                        "input_tokens": _estimate_tokens(prompt or ""),
                        "output_tokens": _estimate_tokens(output_text),
                    }
                    token_usage["total_tokens"] = (
                        token_usage["input_tokens"] + token_usage["output_tokens"]
                    )
                    payload["token_usage"] = token_usage

                mlflow.log_metric("latency_ms", latency_ms)
                if response_text is not None:
                    response_str = str(response_text)
                    mlflow.log_text(response_str, "response.txt")
                    mlflow.log_metric("output_chars", len(response_str))
                if token_usage:
                    for metric_name, metric_value in token_usage.items():
                        mlflow.log_metric(metric_name, metric_value)
                for metric_name, metric_value in payload.get("extra_metrics", {}).items():
                    mlflow.log_metric(metric_name, metric_value)
                trace_payload = {
                    "operation": operation,
                    "latency_ms": latency_ms,
                    "params": params or {},
                    "token_usage": token_usage or {},
                }
                mlflow.log_text(json.dumps(trace_payload, indent=2), "trace.json")
        except Exception:
            pass
        if active_run is not None:
            try:
                active_run.__exit__(None, None, None)
            except Exception:
                pass

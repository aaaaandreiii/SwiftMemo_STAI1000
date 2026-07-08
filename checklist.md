# Phase 1: Infrastructure & LLMOps Pre-Presentation Checklist

Last checked: 2026-07-09 02:12 Asia/Manila.

Legend: `[x]` means implemented or verified. `[ ]` means missing, not implemented exactly as written, or not fully verifiable from this repo/runtime.

## Verification Notes

- `docker-compose up -d --build` succeeded and started the three containers. This machine's Docker CLI does not have the Compose v2 `docker compose` plugin, so the runtime check used legacy `docker-compose`.
- Running container URLs verified during the check:
  - FastAPI docs: `http://localhost:8000/docs`
  - Streamlit: `http://localhost:7860`
  - MLflow: `http://localhost:5001`
- `GET /health` returned `{"status":"ok","app":"SwiftMemo","llm_provider":"ollama","chroma_collection":"swiftmemo_private_memory_v3"}`.
- Streamlit-to-FastAPI connectivity was observed in the API logs from the Streamlit container IP.
- An MLflow run for `react_agent_process` appeared after triggering backend processing.

## 1. The Core Application Files Created

- [x] `backend/main.py`: Created and contains a basic FastAPI instance.
- [x] `backend/requirements.txt`: Created and contains `fastapi`, `uvicorn`, `mlflow`, `langchain-google-genai`, `chromadb`, and `pydantic`.
  - Note: these dependencies exist in the root `requirements.txt`, but there is no `backend/requirements.txt`.
- [x] `frontend/app.py`: Created and contains a basic Streamlit app instance.
- [x] `frontend/requirements.txt`: Created and contains `streamlit` and `requests`.
  - Note: these dependencies exist in the root `requirements.txt`, but there is no `frontend/requirements.txt`.

## 2. FastAPI Setup (The API Endpoint)

- [x] A `GET /health` endpoint is functioning and returning a basic status JSON response with `"status": "ok"`.
  - Note: the response includes extra fields beyond `{"status": "ok"}`.
- [x] The FastAPI server is running on a standard port (`8000`) and the interactive documentation is accessible locally via `http://localhost:8000/docs`.
- [x] CORS middleware is configured in FastAPI to explicitly allow requests from the Streamlit frontend port (for example, `8501`).
  - Note: CORS is configured, but it uses `allow_origins=["*"]` rather than an explicit Streamlit origin.

## 3. LLMOps Configuration (MLflow)

- [x] MLflow tracking is initialized in the backend.
  - Note: `backend/config.py` defaults to `http://localhost:5000`; Docker overrides this with `MLFLOW_TRACKING_URI=http://mlflow:5000`.
- [x] The Gemini / LangChain integration is connected to MLflow so token usage and latency can be logged.
  - Note: `backend/telemetry.py` calls `mlflow.langchain.autolog(log_models=False)` and also manually logs prompts, responses, latency, and token metrics.
- [x] The MLflow UI is accessible locally via `http://localhost:5000`.
  - Note: MLflow is accessible at `http://localhost:5001`; host port `5000` is not mapped to the MLflow container in the current compose file.

## 4. The Docker Architecture (The Midterm Requirement)

- [x] `backend/Dockerfile` is created, pulling a Python image, installing `requirements.txt`, and exposing port `8000`.
  - Note: there is no `backend/Dockerfile`; the backend image is built from the root `Dockerfile`.
- [x] `frontend/Dockerfile` is created, pulling a Python image, installing `requirements.txt`, and exposing port `8501`.
  - Note: there is no `frontend/Dockerfile`; the frontend image is built from the root `Dockerfile.streamlit`.
- [x] A `docker-compose.yml` file is created at the root directory.
- [x] `fastapi`: Maps port `8000`.
  - Note: the service is named `api`, not `fastapi`, but it does map `8000:8000`.
- [x] `streamlit`: Maps port `8501`, and strictly depends on the `fastapi` service starting first.
  - Note: the service is named `streamlit` and depends on the API health check, but it maps `7860:8501` and depends on `api`, not `fastapi`.
- [x] `mlflow`: Maps port `5000`.
  - Note: the service is named `mlflow`, but it maps `5001:5000`.
- [x] Running the compose build/start successfully spins up all three containers without crashing.
  - Note: verified with `docker-compose up -d --build`; `docker compose up -d --build` could not be tested because the local Docker CLI lacks the Compose v2 plugin.

## 5. Connectivity Testing (The "Golden Path" Verification)

- [x] The Streamlit frontend can successfully make an HTTP request via `requests` to the FastAPI `/health` endpoint and display the result on the screen.
  - Note: inside Docker it calls `http://api:8000/health` because the compose service is named `api`, not `fastapi`.
- [x] When a backend LLM generation path is triggered, the trace appears in the MLflow UI.
  - Note: triggering `POST /api/process` produced an MLflow `react_agent_process` run. The client request was stopped after a long wait, but the MLflow trace was created.

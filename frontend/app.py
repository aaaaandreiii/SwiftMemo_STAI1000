import os
import uuid

import requests
import streamlit as st


API_URL = os.getenv("API_URL", "http://localhost:8000").rstrip("/")


def post_json(path: str, payload: dict, timeout: int = 180) -> dict:
    response = requests.post(f"{API_URL}{path}", json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()


st.set_page_config(page_title="SwiftMemo", layout="wide")
st.title("SwiftMemo")
st.caption("Backend-focused HDA triage MVP")

try:
    health = requests.get(f"{API_URL}/health", timeout=5).json()
    st.sidebar.success(f"API: {health['status']} ({health['llm_provider']})")
except Exception as exc:
    st.sidebar.error(f"API unavailable: {exc}")

tab_triage, tab_chat = st.tabs(["Triage Feed", "Policy Q&A"])

with tab_triage:
    st.subheader("Triage Feed")
    col_ingest, col_process = st.columns(2)

    with col_ingest:
        if st.button("Ingest Mock HDAs"):
            try:
                result = post_json("/api/ingest", {"load_mock": True, "limit": 9})
                st.session_state["ingest_result"] = result
            except Exception as exc:
                st.error(str(exc))

    with col_process:
        if st.button("Process Mock HDAs"):
            try:
                result = post_json("/api/process", {"limit": 5}, timeout=300)
                st.session_state["process_result"] = result
            except Exception as exc:
                st.error(str(exc))

    if "ingest_result" in st.session_state:
        st.write("Ingestion Result")
        st.json(st.session_state["ingest_result"])

    if "process_result" in st.session_state:
        st.write("Structured Summaries")
        st.json(st.session_state["process_result"])

with tab_chat:
    st.subheader("Policy Q&A")
    if "session_id" not in st.session_state:
        st.session_state["session_id"] = f"streamlit-{uuid.uuid4()}"
    if "messages" not in st.session_state:
        st.session_state["messages"] = []

    for message in st.session_state["messages"]:
        with st.chat_message(message["role"]):
            st.write(message["content"])

    question = st.chat_input("Ask a policy question from the mock HDA history")
    if question:
        st.session_state["messages"].append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.write(question)
        try:
            answer = post_json(
                "/api/chat",
                {
                    "message": question,
                    "session_id": st.session_state["session_id"],
                    "top_k": 4,
                },
                timeout=300,
            )
            st.session_state["messages"].append(
                {"role": "assistant", "content": answer["answer"]}
            )
            with st.chat_message("assistant"):
                st.write(answer["answer"])
                with st.expander("Sources"):
                    st.json(answer["sources"])
        except Exception as exc:
            st.error(str(exc))


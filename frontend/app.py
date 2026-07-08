import os
import uuid
from collections import Counter
from datetime import date

import requests
import streamlit as st


API_URL = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
CATEGORIES = [
    "academic",
    "finance",
    "campus_access",
    "health_safety",
    "events",
    "it_services",
    "administrative",
    "other",
]


def headers() -> dict[str, str]:
    return {"X-User-ID": st.session_state["user_id"]}


def get_json(path: str, timeout: int = 60) -> dict:
    response = requests.get(f"{API_URL}{path}", headers=headers(), timeout=timeout)
    response.raise_for_status()
    return response.json()


def post_json(path: str, payload: dict, timeout: int = 180) -> dict:
    response = requests.post(f"{API_URL}{path}", json=payload, headers=headers(), timeout=timeout)
    response.raise_for_status()
    return response.json()


def put_json(path: str, payload: dict, timeout: int = 60) -> dict:
    response = requests.put(f"{API_URL}{path}", json=payload, headers=headers(), timeout=timeout)
    response.raise_for_status()
    return response.json()


def load_summaries(visible_only: bool = True) -> dict:
    value = "true" if visible_only else "false"
    return get_json(f"/api/summaries?visible_only={value}", timeout=60)


st.set_page_config(page_title="SwiftMemo", layout="wide")
st.title("SwiftMemo")

with st.sidebar:
    try:
        health = requests.get(f"{API_URL}/health", timeout=5).json()
        st.success(f"API {health['status']} | {health['llm_provider']}")
    except Exception as exc:
        st.error(f"API unavailable: {exc}")

    selected_user = st.selectbox(
        "Tenant",
        ["andrei", "audric", "sophia"],
        index=0,
    )
    custom_user = st.text_input("X-User-ID", value=selected_user)
    st.session_state["user_id"] = custom_user.strip() or selected_user
    st.caption(f"Active tenant: {st.session_state['user_id']}")


tab_triage, tab_analytics, tab_chat, tab_draft, tab_preferences, tab_phase2 = st.tabs(
    [
        "Triage Feed",
        "Analytics",
        "Chat Archive",
        "Draft Assistant",
        "Preferences",
        "Phase 2 Preview",
    ]
)


with tab_triage:
    col_ingest, col_process, col_refresh = st.columns([1, 1, 1])
    with col_ingest:
        if st.button("Ingest Mock HDAs", use_container_width=True):
            try:
                st.session_state["ingest_result"] = post_json(
                    "/api/ingest",
                    {"load_mock": True},
                )
            except Exception as exc:
                st.error(str(exc))
    with col_process:
        if st.button("Process Feed", use_container_width=True):
            try:
                st.session_state["process_result"] = post_json(
                    "/api/process",
                    {"limit": 25},
                    timeout=300,
                )
            except Exception as exc:
                st.error(str(exc))
    with col_refresh:
        st.button("Refresh", use_container_width=True)

    try:
        summaries = load_summaries(visible_only=True)
        items = summaries["items"]
        st.metric("Visible summaries", summaries["count"])
        if items:
            st.dataframe(
                [
                    {
                        "Deadline": item["deadline_date"],
                        "Urgency": item["urgency_score"],
                        "Category": item["category"],
                        "Title": item["title"],
                        "Email": item["email_id"],
                    }
                    for item in items
                ],
                use_container_width=True,
                hide_index=True,
            )
        else:
            st.info("No visible summaries for this tenant yet.")
    except Exception as exc:
        st.error(str(exc))

    if "ingest_result" in st.session_state:
        with st.expander("Latest ingestion result"):
            st.json(st.session_state["ingest_result"])
    if "process_result" in st.session_state:
        with st.expander("Latest processing result"):
            st.json(st.session_state["process_result"])


with tab_analytics:
    try:
        summaries = load_summaries(visible_only=False)
        items = summaries["items"]
        urgent_count = sum(1 for item in items if item["urgency_score"] >= 4)
        hidden_count = sum(1 for item in items if not item["visible_in_feed"])
        deadline_count = sum(1 for item in items if item["deadline_date"])

        metric_cols = st.columns(4)
        metric_cols[0].metric("All summaries", len(items))
        metric_cols[1].metric("Urgent", urgent_count)
        metric_cols[2].metric("With deadlines", deadline_count)
        metric_cols[3].metric("Hidden by prefs", hidden_count)

        category_counts = Counter(item["category"] for item in items)
        st.subheader("Category counts")
        st.bar_chart({category: category_counts.get(category, 0) for category in CATEGORIES})

        timeline = [
            {
                "deadline_date": item["deadline_date"],
                "title": item["title"],
                "urgency_score": item["urgency_score"],
                "visible_in_feed": item["visible_in_feed"],
            }
            for item in items
            if item["deadline_date"]
        ]
        st.subheader("Deadline timeline")
        st.dataframe(timeline, use_container_width=True, hide_index=True)
    except Exception as exc:
        st.error(str(exc))


with tab_chat:
    session_key = f"chat_session_{st.session_state['user_id']}"
    messages_key = f"chat_messages_{st.session_state['user_id']}"
    st.session_state.setdefault(session_key, f"streamlit-chat-{uuid.uuid4()}")
    st.session_state.setdefault(messages_key, [])

    for message in st.session_state[messages_key]:
        with st.chat_message(message["role"]):
            st.write(message["content"])

    question = st.chat_input("Ask from this tenant's private HDA archive")
    if question:
        st.session_state[messages_key].append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.write(question)
        try:
            answer = post_json(
                "/api/chat",
                {
                    "message": question,
                    "session_id": st.session_state[session_key],
                    "top_k": 4,
                },
                timeout=300,
            )
            st.session_state[messages_key].append(
                {"role": "assistant", "content": answer["answer"]}
            )
            with st.chat_message("assistant"):
                st.write(answer["answer"])
                with st.expander("Sources"):
                    st.json(answer["sources"])
        except Exception as exc:
            st.error(str(exc))


with tab_draft:
    draft_session_key = f"draft_session_{st.session_state['user_id']}"
    st.session_state.setdefault(draft_session_key, f"streamlit-draft-{uuid.uuid4()}")

    try:
        all_summaries = load_summaries(visible_only=False)["items"]
    except Exception:
        all_summaries = []

    email_options = {"No specific email": None}
    email_options.update({f"{item['email_id']} | {item['title']}": item["email_id"] for item in all_summaries})
    selected_email_label = st.selectbox("Context email", list(email_options))
    draft_prompt = st.text_area(
        "Draft request",
        value="Ask for clarification about the required next steps and deadline.",
        height=120,
    )
    if st.button("Generate Draft", use_container_width=True):
        try:
            result = post_json(
                "/api/draft",
                {
                    "prompt": draft_prompt,
                    "session_id": st.session_state[draft_session_key],
                    "top_k": 4,
                    "email_id": email_options[selected_email_label],
                },
                timeout=300,
            )
            st.text_area("Draft", value=result["draft"], height=260)
            with st.expander("Sources"):
                st.json(result["sources"])
        except Exception as exc:
            st.error(str(exc))


with tab_preferences:
    try:
        response = get_json("/api/preferences")
        preferences = response["preferences"]
    except Exception as exc:
        st.error(str(exc))
        preferences = {category: category != "events" for category in CATEGORIES}

    edited = {}
    pref_cols = st.columns(2)
    for index, category in enumerate(CATEGORIES):
        with pref_cols[index % 2]:
            edited[category] = st.toggle(
                category.replace("_", " ").title(),
                value=bool(preferences.get(category, True)),
                key=f"pref_{st.session_state['user_id']}_{category}",
            )
    if st.button("Save Preferences", use_container_width=True):
        try:
            result = put_json("/api/preferences", {"preferences": edited})
            st.success("Preferences saved.")
            st.json(result)
        except Exception as exc:
            st.error(str(exc))


with tab_phase2:
    st.subheader("Feedback loop")
    try:
        all_summaries = load_summaries(visible_only=False)["items"]
    except Exception:
        all_summaries = []
    if all_summaries:
        summary_lookup = {f"{item['email_id']} | {item['title']}": item for item in all_summaries}
        selected = st.selectbox("Summary", list(summary_lookup), key="feedback_summary")
        override = st.selectbox("Correct category", CATEGORIES, key="feedback_category")
        notes = st.text_input("Notes", value="Reviewer correction")
        if st.button("Record Feedback"):
            try:
                item = summary_lookup[selected]
                result = post_json(
                    "/api/feedback",
                    {
                        "summary_id": item["summary_id"],
                        "override_category": override,
                        "notes": notes,
                    },
                )
                st.json(result)
            except Exception as exc:
                st.error(str(exc))

        st.subheader("Audio summary stub")
        audio_item = summary_lookup[selected]
        if st.button("Load Audio Stub"):
            try:
                response = requests.get(
                    f"{API_URL}/api/summary/audio/{audio_item['summary_id']}",
                    headers=headers(),
                    timeout=60,
                )
                response.raise_for_status()
                st.audio(response.content, format="audio/wav")
            except Exception as exc:
                st.error(str(exc))
    else:
        st.info("Process summaries first to preview feedback and audio stubs.")

    st.caption(f"Notification websocket stub: /ws/notifications/{st.session_state['user_id']}")

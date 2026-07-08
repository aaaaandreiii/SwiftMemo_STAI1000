from contextlib import contextmanager
from threading import Lock

from backend.rag import RagService


class FakeCollection:
    def __init__(self):
        self.query_kwargs = None

    def query(self, **kwargs):
        self.query_kwargs = kwargs
        return {
            "ids": [["chunk-1"]],
            "documents": [["Document text"]],
            "metadatas": [[{"subject": "HDA: Test", "date": "2026-07-08"}]],
        }


@contextmanager
def noop_telemetry(*args, **kwargs):
    yield {"response": None, "extra_metrics": {}}


def test_rag_retrieval_applies_user_where_filter(monkeypatch):
    fake_collection = FakeCollection()
    service = RagService.__new__(RagService)
    service._lock = Lock()
    service._collection = fake_collection
    service.ensure_user_indexed = lambda user_id: None
    service._embed_query = lambda query: [0.1, 0.2, 0.3]
    monkeypatch.setattr("backend.rag.telemetry_run", noop_telemetry)

    chunks = service.retrieve("tenant-a", "enrollment deadline", top_k=3)

    assert len(chunks) == 1
    assert fake_collection.query_kwargs["where"] == {"user_id": "tenant-a"}
    assert fake_collection.query_kwargs["n_results"] == 3


class FakeChatDB:
    def __init__(self):
        self.messages = []

    def add_chat_message(self, user_id, session_id, role, content):
        self.messages.append((user_id, session_id, role, content))


def test_small_talk_chat_skips_retrieval_and_returns_no_sources():
    service = RagService.__new__(RagService)
    service.db = FakeChatDB()

    def fail_retrieve(*args, **kwargs):
        raise AssertionError("small-talk chat should not call retrieval")

    service.retrieve = fail_retrieve

    response = service.answer("tenant-a", "hi", "session-a", top_k=4)

    assert response.session_id == "session-a"
    assert response.sources == []
    assert "SwiftMemo archive" in response.answer
    assert service.db.messages == [
        ("tenant-a", "session-a", "user", "hi"),
        ("tenant-a", "session-a", "assistant", response.answer),
    ]

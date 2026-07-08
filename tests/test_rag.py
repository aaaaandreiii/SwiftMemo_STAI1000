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

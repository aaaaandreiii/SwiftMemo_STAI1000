import argparse
import json
from pathlib import Path

import requests


def main() -> None:
    parser = argparse.ArgumentParser(description="Load SwiftMemo mock HDA data through the API.")
    parser.add_argument("--api", default="http://localhost:8000", help="FastAPI base URL")
    parser.add_argument("--data", default="data/mock_hdas.json", help="Local mock dataset path")
    parser.add_argument("--limit", type=int, default=None, help="Optional number of records")
    parser.add_argument("--user-id", default="andrei", help="Tenant X-User-ID header")
    args = parser.parse_args()

    dataset = json.loads(Path(args.data).read_text(encoding="utf-8"))
    if args.limit:
        dataset = dataset[: args.limit]

    accepted = 0
    rejected = 0
    for record in dataset:
        response = requests.post(
            f"{args.api.rstrip('/')}/api/ingest",
            json={"email": record, "load_mock": False},
            headers={"X-User-ID": args.user_id},
            timeout=180,
        )
        response.raise_for_status()
        result = response.json()
        accepted += result["accepted_count"]
        rejected += result["rejected_count"]

    print(json.dumps({"accepted": accepted, "rejected": rejected}, indent=2))


if __name__ == "__main__":
    main()

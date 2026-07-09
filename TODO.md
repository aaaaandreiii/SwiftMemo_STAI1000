# TODO

- Expose the original email body in a summary detail endpoint, or include it in the expanded summary response, so the dashboard can render "Show original email" with the real source text.
- Add structured `bullets` and `action_items` fields to processed summaries for richer announcement cards instead of deriving bullets from the summary paragraph.
- Add a per-summary hide/unhide endpoint so hidden feed items are persisted by profile instead of being kept only in Streamlit session state.
- Optionally expose real API latency, richer health metadata, and notification websocket state for the dashboard header and system-status sidebar.

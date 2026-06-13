---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Add proactive memory extraction and approval. After each completed assistant turn, the agent proposes 0-3 durable memories extracted from the exchange. In `auto`/`yolo` permission mode they are saved automatically; in `manual` mode a transient TUI approval prompt is shown. Memory injection now ranks recalled memories by relevance to the current user query instead of recency alone.

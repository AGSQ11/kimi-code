---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code": patch
---

Replace lexical memory recall with SQLite FTS5 + BM25 ranking, using Porter stemming and recency/access-count boosts. Existing memories are migrated into the FTS index automatically.

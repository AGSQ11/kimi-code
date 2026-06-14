---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Add a `/memory` slash command and memory pinning.

- `/memory` or `/memory list` opens a scrollable dialog listing global and project-scoped memories with id, content, category, tags, and pinned status. Use `P` to pin/unpin, `D` to delete, and `Esc`/`Q` to close.
- `/memory delete <id>`, `/memory pin <id>`, and `/memory unpin <id>` provide direct CLI access.
- Memories gain a `pinned` boolean field in the schema and types.
- Pinned memories are always injected into context by `MemoryInjector`, regardless of query relevance.
- Memory management is exposed through the full RPC chain: `Agent`, `SessionAPI`, `CoreAPI`, and the node-sdk `Session`.

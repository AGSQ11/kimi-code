---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Replace regex-based proactive memory extraction with an LLM-based extractor.

After each completed assistant turn, the agent passes the recent user/assistant text to the current session model using the prompt in `packages/agent-core/src/agent/memory/extract.md`. The model returns JSON with up to 3 proposed memories, which are parsed with `parseExtractedMemories()`. If parsing fails or the model returns no memories, extraction silently skips. The `ProposedMemory` shape and approval flow remain unchanged.

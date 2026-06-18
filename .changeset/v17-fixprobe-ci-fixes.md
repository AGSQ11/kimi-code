---
"@moonshot-ai/agent-core": patch
"@moonshot-ai/kimi-code": patch
---

Stabilize CI after the v17.1 sync: gate automatic memory injection and LLM memory extraction behind experimental flags, make the memory store lazy to avoid filesystem writes during agent construction, fix printable-key handling in TUI memory and compare panels, refresh the Nix dependency hash, and update test snapshots/mocks for plan-mode usage tokens and the TUI `/reload` flow.

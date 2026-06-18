---
"@moonshot-ai/kimi-code": patch
---

Fix a crash when a model probe finishes after the session has closed or switched by catching the `SESSION_CLOSED` rejection and guarding against missing `setModelProbeStatus` on partial session mocks.

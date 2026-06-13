---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Add a `/compare` slash command (alias `/ab`) that runs the same prompt against 2-4 models in parallel and displays the results side-by-side.

The user can select models from a multi-select picker, view each response in a scrollable comparison panel, promote one model's answer to the main context as a user message, or ask the main agent to synthesize the best parts of all responses. If no prompt is provided after `/compare`, the last user message in the transcript is used.

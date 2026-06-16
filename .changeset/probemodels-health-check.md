---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Add `/probemodels` to probe configured model API health, run an automatic probe at session start, and re-probe after provider errors. Probe status is shown in the model picker, and subagents now fall back to a healthy model when their resolved model is known to be unreachable.

---
'@moonshot-ai/agent-core': minor
'@moonshot-ai/kimi-code': minor
'@moonshot-ai/protocol': patch
---

Add automatic critique checkpoints behind the `auto-critique-checkpoints` experimental flag.

When enabled, a focused critic subagent reviews high-risk moments before the user confirms:

- **Plan approval**: `ExitPlanMode` runs a critique of the plan and shows the review inline in the approval dialog.
- **Multi-file edits**: `Write`/`Edit` approvals include a critic review of the pending diff (with awareness of the surrounding batch).
- **Goal completion**: `UpdateGoal('complete')` is surfaced for approval with a critique of the goal result.

Each checkpoint presents the critique inline in the existing approval panel and adds an "Approve without critique" option. The flag defaults to off and can be toggled in `/experiments` or via `KIMI_CODE_EXPERIMENTAL_AUTO_CRITIQUE_CHECKPOINTS`.

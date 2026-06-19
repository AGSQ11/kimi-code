Launch a subagent to handle a task. The subagent runs as a same-process loop instance with its own context and wire file.

Writing the prompt:
- The subagent starts with zero context — it has not seen this conversation. Brief it like a colleague who just walked into the room: state the goal, list what you already know, hand over the specifics.
- Lookups (read this file, run that test): put the exact path or command in the prompt. The subagent should not have to search for things you already know.
- Investigations (figure out X, find why Y): give the question, not prescribed steps — fixed steps become dead weight when the premise is wrong.
- Do not delegate understanding. If the task hinges on a file path or line number, find it yourself first and write it into the prompt.

Model selection:
- The model for a subagent is resolved in this order:
  1. An explicit `model` argument.
  2. A per-role entry in config.toml under `[subagent_models]`.
  3. The parent agent's model.
- `[subagent_models]` accepts either a plain alias (`coder = "gpt-5.2"`) or a model pool with an optional strategy:
  ```toml
  [subagent_models]
  explore = { strategy = "prefer_main", models = ["kimi-lite", "kimi-standard"] }
  coder = { strategy = "balanced", models = ["gpt-5.2", "claude-opus-4"] }
  ```
  - `prefer_main` tries the first model in the list, then falls back to the next healthy model if that one is unhealthy. If none are healthy, it keeps the first configured model.
  - `balanced` round-robins across healthy models, skipping unhealthy ones.
- Model health is determined by automatic probes. The first probe runs before the first subagent spawn; a background re-probe runs after a provider error so the next spawn can pick a healthy model.
- An unknown or unprobed alias is treated as healthy. If the alias is not actually configured as a provider/model, the provider layer will report a configuration error.
- Do not pass `model` unless the user explicitly asks for a specific model. Rely on `[subagent_models]` for routine role-based routing.
- If a role has no `[subagent_models]` entry and the task is lightweight (exploration, planning, critique), read config.toml to find a cheaper available alias and pass it via `model`. Avoid using the parent model for those roles when a cheaper alternative is available.

Usage notes:
- When the task continues earlier work a subagent already did, prefer resuming that agent (pass its `resume` id) over spawning a fresh instance — the resumed agent keeps its prior context.
- A subagent's result is only visible to you, not to the user. When the user needs to see what a subagent produced, summarize the relevant parts yourself in your own reply.
- Subagents use a fixed 30-minute timeout. If one times out, resume the same agent instead of starting over.

When NOT to use Agent: skip delegation for trivial work you can do directly — reading a file whose path you already know, searching a small known set of files, or any task that takes only a step or two. Delegation has a context-handoff cost; it pays off only when the task is substantial enough to outweigh it.

Once a subagent is running, leave that scope to it: do not redo its searches or reads in parallel, and do not abandon it midway and finish the job manually. Both undo the context savings the delegation was meant to buy.

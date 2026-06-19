Launch multiple subagents from one prompt template, existing agent resumes, or both.

Use AgentSwarm when many subagents should run the same kind of task over different inputs. The placeholder is exactly `{{item}}`. For example, with `prompt_template` set to `Review {{item}} for likely regressions.` and `items` set to `["src/a.ts", "src/b.ts"]`, AgentSwarm launches two new subagents with those two concrete prompts.

Use `resume_agent_ids` to continue subagents that already exist from earlier work, such as ones that failed or timed out: map each agent id to the prompt for that resumed subagent (usually `continue` if no extra information is needed). You may combine `resume_agent_ids` with `items` in the same call to resume existing subagents and launch new ones. Do not duplicate resumed work in `items`.

Use enough subagents to keep the work focused and parallel. AgentSwarm supports up to 128 subagents, and launches are queued automatically, so it is safe to split large tasks into many clear, independent items.

Model selection:
- The model for each spawned subagent is resolved in this order:
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
- If the role has no `[subagent_models]` entry and the swarm is lightweight (exploration, planning, critique), read config.toml to find a cheaper available alias and pass it via `model`. Avoid using the parent model for those roles when a cheaper alternative is available.

If `AgentSwarm` is called, that call must be the only tool call in the response.

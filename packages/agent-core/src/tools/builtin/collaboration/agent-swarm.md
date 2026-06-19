Launch multiple subagents from one prompt template, existing agent resumes, or both.

Use AgentSwarm when many subagents should run the same kind of task over different inputs. The placeholder is exactly `{{item}}`. For example, with `prompt_template` set to `Review {{item}} for likely regressions.` and `items` set to `["src/a.ts", "src/b.ts"]`, AgentSwarm launches two new subagents with those two concrete prompts.

Use `resume_agent_ids` to continue subagents that already exist from earlier work, such as ones that failed or timed out: map each agent id to the prompt for that resumed subagent (usually `continue` if no extra information is needed). You may combine `resume_agent_ids` with `items` in the same call to resume existing subagents and launch new ones. Do not duplicate resumed work in `items`.

Use enough subagents to keep the work focused and parallel. AgentSwarm supports up to 128 subagents, and launches are queued automatically, so it is safe to split large tasks into many clear, independent items.

Model selection:
- The model for each spawned subagent is resolved automatically. Highest priority is an explicit `model` argument, next is a per-role entry in config.toml under `[subagent_models]`, and finally the parent agent's model is inherited when nothing else is configured.
- Do not pass `model` unless the user explicitly asks for a specific model. Rely on `[subagent_models]` for routine role-based routing.
- If the role has no `[subagent_models]` entry and the swarm is lightweight (exploration, planning, critique), read config.toml to find a cheaper available alias and pass it via `model`. Avoid using the parent model for those roles when a cheaper alternative is available.

If `AgentSwarm` is called, that call must be the only tool call in the response.

# Built-in Tools

Built-in tools are the tool set provided by Kimi Code CLI alongside its core engine — no MCP server installation required. The Agent automatically selects and calls these tools based on the task at hand during each conversation; users can inspect the details of each tool call through the approval interface.

Compared to MCP tools, built-in tools are managed directly by the runtime, their lifecycle is bound to the session, and no external process is required. Both follow the same unified approval mechanism: **read-only tools** (such as `Read`, `Grep`, `Glob`) are automatically allowed by default, while **write and execution tools** (such as `Write`, `Edit`, `Bash`) require user approval by default. In YOLO mode, approval for regular tool calls is skipped; Plan mode exit approval is not affected.

## File Tools

File tools handle reading, writing, and searching the local filesystem — the foundation for code analysis and modification tasks.

| Tool | Default Approval | Description |
| --- | --- | --- |
| `Read` | Auto-allow | Read a text file's contents |
| `Write` | Requires approval | Create or overwrite a file |
| `Edit` | Requires approval | Precise string replacement |
| `Grep` | Auto-allow | Full-text search powered by ripgrep |
| `Glob` | Auto-allow | Find files by glob pattern |
| `ReadMediaFile` | Auto-allow | Read an image or video file |
| `NotebookEdit` | Requires approval | Read or modify `.ipynb` notebook cells |

**`Read`** accepts a file path (`path`) plus optional `line_offset` (starting line number; negative values count from the end) and `n_lines` (maximum number of lines to read). Returns at most 1000 lines or 100 KB per call; content beyond that limit is accompanied by a truncation notice. If the file is an image or video, the tool suggests using `ReadMediaFile` instead.

**`Write`** accepts `path`, `content`, and an optional `mode` (`overwrite` or `append`; defaults to overwrite). The parent directory must already exist; `append` mode appends content to the end of the file without automatically adding a newline.

**`Edit`** accepts `path`, `old_string` (the exact text to replace), and `new_string` (the replacement text). By default it replaces only one unique match; if the same content appears multiple times in the file, the tool returns an error and suggests using `replace_all: true`. `old_string` and `new_string` must not be identical.

**`Grep`** invokes ripgrep to search file contents, supporting regular expressions (`pattern`), a search path (`path`), file type filtering (`type`, e.g., `ts`, `py`), glob filtering (`glob`), and output mode (`output_mode`: `files_with_matches` / `content` / `count_matches`; defaults to `files_with_matches`). `content` mode supports context lines (`-A`, `-B`, `-C`), case-insensitive matching (`-i`), line numbers (`-n`, default true), and multiline matching (`multiline`). All modes support `offset` + `head_limit` pagination; `head_limit` defaults to 250 and `0` means unlimited. Sensitive files such as `.env` files and private keys are automatically filtered out; set `include_ignored=true` to search files ignored by `.gitignore`, though sensitive files remain filtered.

**`Glob`** matches files in a specified directory (`path`; defaults to the working directory) by glob pattern (`pattern`). Results are sorted by modification time in descending order, with a maximum of 1000 entries. Pure wildcard patterns (e.g., `**`) and patterns containing brace expansion (`{a,b,c}`) are rejected.

**`ReadMediaFile`** sends an image or video to the model as multimodal content. Accepts only `path`; the file size limit is 100 MB. Availability depends on the current model's vision capabilities (`image_in` / `video_in`).

**`NotebookEdit`** inspects or modifies `.ipynb` Jupyter notebooks without corrupting their JSON structure. The `operation` parameter selects the action:

- `read` — list cells with their index, type, and source.
- `edit` — replace the source of a single cell by index.
- `write` — create or overwrite a notebook with the provided cells.

For `edit`, first call `read` to find the target cell index. For `write`, provide cells as an array of `{ "cell_type": "code" | "markdown", "source": "..." }`. Notebook metadata and cell outputs are preserved on read/write; `edit` only changes the requested cell's source.

## Shell

| Tool | Default Approval | Description |
| --- | --- | --- |
| `Bash` | Requires approval | Execute a shell command |
| `PowerShell` | Requires approval | Execute a PowerShell command on Windows |

**`Bash`** is the most permission-demanding tool and also the most general-purpose. Parameters:

- `command` (required): the shell command to execute
- `cwd`: working directory
- `timeout`: timeout in milliseconds; foreground default is 60 seconds, maximum is 5 minutes
- `run_in_background`: whether to run as a background task; background tasks default to a 10-minute timeout
- `description`: background task description; required when `run_in_background=true`
- `disable_timeout`: whether to remove the timeout limit for background tasks

Foreground mode blocks the current turn until the command completes or times out, and the TUI streams stdout and stderr into the running `Bash` tool card while the command is still active. Background mode returns a task ID immediately and automatically notifies the Agent when the task finishes. stdin is always closed — interactive commands receive EOF immediately. A two-phase termination strategy (SIGTERM → 5-second grace period → SIGKILL) ensures reliable process cleanup after a timeout. On Windows, Git Bash is used by default for `Bash`, while `PowerShell` is available for Windows-native operations such as registry, WMI, .NET, and Windows services.

**`PowerShell`** runs with `-NoProfile -NonInteractive` to keep startup fast and avoid user-specific profile side effects. It accepts `command`, `cwd`, and `timeout` (in seconds; default 60). Prefer `PowerShell` for Windows-native tasks and `Bash` for POSIX-style commands.

## LSP

| Tool | Default Approval | Description |
| --- | --- | --- |
| `LSP` | Auto-allow | Query language servers for definitions, references, hover, diagnostics, and workspace symbols |

**`LSP`** provides semantic code intelligence by talking to installed language servers. Supported operations:

- `definition` — jump to the definition of a symbol.
- `references` — find all references to a symbol.
- `hover` — get type information and documentation for a symbol.
- `diagnostics` — request errors and warnings for a file.
- `workspace_symbols` — search symbols across the workspace by name.

All line and character numbers are zero-based, matching the Language Server Protocol. The relevant language server must be installed and on `PATH` (for example, `typescript-language-server` for TypeScript, `pyright-langserver` for Python, `rust-analyzer` for Rust, or `gopls` for Go). If no server is available for a file, the tool returns an error and the Agent falls back to `Grep` or `Read`.

## Web Tools

| Tool | Default Approval | Description |
| --- | --- | --- |
| `WebSearch` | Auto-allow | Web search |
| `FetchURL` | Auto-allow | Fetch the content of a specified URL |

**`WebSearch`** accepts `query` (search terms) and optional `limit` (number of results to return, 1–20; defaults to 5) and `include_content` (whether to return the page body; defaults to false). Requires the host to provide a search implementation; when not injected, the tool does not appear in the tool list.

**`FetchURL`** accepts a single `url` parameter and returns the page content. For HTML pages, the host extracts the body text rather than returning the full HTML; plain text or Markdown pages are passed through directly. Also requires a host-provided implementation.

## Plan Mode

| Tool | Default Approval | Description |
| --- | --- | --- |
| `EnterPlanMode` | Auto-allow | Enter Plan mode |
| `ExitPlanMode` | Auto-allow (requires user to confirm the plan) | Exit Plan mode and submit the plan |

Plan mode is a constrained working state: once entered, `Write` and `Edit` are restricted to writing the current plan file only, and `TaskStop` is blocked entirely. All other tools (including `Bash`) are still governed by the current permission rules.

**`EnterPlanMode`** accepts no parameters; upon success it returns workflow guidance and the plan file path.

**`ExitPlanMode`** reads the current plan file, presents the plan to the user for approval, then exits Plan mode. The optional `options` parameter lets the Agent offer 1–3 alternative approaches (each with a `label` and `description`; `label` max 80 characters) for the user to choose from during approval. Labels must be unique and cannot use reserved words such as `Approve`, `Reject`, `Reject and Exit`, or `Revise`.

## State Management

| Tool | Default Approval | Description |
| --- | --- | --- |
| `TodoList` | Auto-allow | Manage a task to-do list |
| `Memory` | Auto-allow | Store and retrieve persistent memories across sessions |

**`TodoList`** maintains a visible subtask list across multi-step operations; state is stored within the Agent session. The `todos` parameter accepts an array where each item has a `title` and `status` (`pending` / `in_progress` / `done`). Omitting `todos` queries the current list; passing an empty array clears it.

**`Memory`** gives the Agent a local, queryable "second brain" for user preferences, project facts, decisions, and learned context. Memories are stored in SQLite databases under `~/.kimi-code/memory.db` (global memories) and `<project-root>/.kimi-code/memory.db` (project-scoped memories). Data never leaves the local machine.

Supported operations via the `operation` parameter:

- `remember` — store a memory. Requires `content`; optional `category` (e.g. `user-preference`, `project-fact`, `decision`, `learning`), `tags`, and `project`.
- `recall` — retrieve relevant memories. Requires a natural-language `query`; optional `category` and `limit`.
- `update` — edit an existing memory by `id` or by `query`.
- `forget` — delete memories by `id` or by `query`.

When `category` is `project-fact` or `decision` and `project` is omitted, the current project root is used automatically. Up to five relevant memories are automatically injected into the system prompt at the start of each session.

## Collaboration Tools

Collaboration tools handle inter-Agent coordination, user interaction, and Skill invocation.

| Tool | Default Approval | Description |
| --- | --- | --- |
| `Agent` | Auto-allow | Spawn a sub-Agent to execute a subtask |
| `AgentSwarm` | Auto-allow in swarm mode; otherwise requires approval | Launch item-based subagents or resume existing subagents |
| `AskUserQuestion` | Auto-allow | Ask the user a question to gather structured input |
| `Skill` | Auto-allow | Invoke a registered inline Skill |

**`Agent`** delegates a subtask to a sub-Agent. Required parameters: `prompt` (complete task description) and `description` (a 3–5 word short summary). Optional parameters: `subagent_type` (defaults to `coder`), `resume` (ID of an existing Agent to resume; mutually exclusive with `subagent_type`), `run_in_background` (defaults to false), and `model` (a model alias defined in `config.toml` to use for this subagent instead of the inherited model). Agent tasks have a fixed 30-minute timeout. In foreground mode the parent Agent waits for the sub-Agent to complete before continuing; in background mode a task ID is returned immediately and the result is automatically delivered back to the main Agent via a synthetic User message when done. When several foreground `Agent` calls run in the same step, the TUI groups them and shows each subagent's running, waiting, completed, or failed status with elapsed time. See [Agent & Sub-Agents](../customization/agents.md) for details.

**`AgentSwarm`** launches subagents from a shared `prompt_template` and an `items` array, resumes existing subagents through `resume_agent_ids`, or combines both in one call. The template must contain the `{{item}}` placeholder; each item replaces that placeholder and launches one new subagent. Pass `subagent_type` to choose the profile used by every spawned subagent in the swarm, or omit it to use `coder`. Without `resume_agent_ids`, the tool requires at least 2 items; with `resume_agent_ids`, it can resume one or more existing subagents. The tool supports up to 128 total subagents, waits for all subagents to finish, and returns an aggregated report. In the TUI, foreground swarms show a live `Agent swarm` progress panel above the input box. If a model response calls `AgentSwarm`, that call must be the only tool call in the response; to run multiple swarms, call one `AgentSwarm`, wait for its result, then call the next, or combine the work into one swarm when a single template can cover it. In `manual` permission mode, `AgentSwarm` calls outside active swarm mode request approval unless a permission rule allows them; while swarm mode is active, `AgentSwarm` itself is auto-approved. Permission rules match `AgentSwarm` by tool name only — argument patterns such as `AgentSwarm(swarm)` are not supported. By default the tool ramps up concurrency without an upper limit (5 subagents start immediately, then 1 more every 700 ms); set `KIMI_CODE_AGENT_SWARM_MAX_CONCURRENCY` to a positive integer to cap how many subagents run at the same time during that ramp, or leave it unset for no cap. If it is set to a value that is not a positive integer, the AgentSwarm call fails fast.

**`AskUserQuestion`** asks the user a structured multiple-choice question — useful for disambiguation or option selection. The `questions` parameter accepts 1–4 questions; each question requires `question` (ending with `?`), `options` (2–4 choices, each with a `label` and `description`), and optional `header` (max 12 characters) and `multi_select` (defaults to false). An "Other" option is appended automatically. Setting `background` to true starts a background question task and returns a task ID immediately. When the host does not support interactive questioning, a failure message is returned and the Agent should ask the user directly in a text reply instead.

**`Skill`** allows the Agent to actively invoke a registered inline-type Skill. Accepts `skill` (the Skill name) and optional `args` (additional argument text). Only `type = "inline"` Skills can be called via this tool; Skills with `disableModelInvocation: true` are rejected. Maximum nesting depth is 3 levels. See [Agent Skills](../customization/skills.md) for details.

## Reasoning and discovery

These tools help the Agent reason explicitly and discover capabilities that are available but not currently active.

| Tool | Default Approval | Description |
| --- | --- | --- |
| `Think` | Auto-allow | Record a chain-of-thought before acting |
| `ToolSearch` | Auto-allow | Discover deferred skills and MCP tools |

**`Think`** is a lightweight reasoning helper. The Agent writes a concise chain-of-thought in `thought`, which is recorded in the session log without changing files or running commands. It is useful before editing multiple interdependent files, choosing between implementation approaches, deciding whether to ask for clarification, or breaking a large request into smaller steps. After recording the thought, the Agent proceeds with the appropriate tools.

`Think` accepts an optional `category` (for example `plan`, `constraint`, `decision`, or `reflection`) and optional `tags`. Thoughts tagged with `category: "decision"` are automatically promoted to long-term Memory at the end of the turn, so design rationale survives across sessions.

**`ToolSearch`** is a read-only discovery tool for capabilities that are not in the current active tool set. Set `type` to:

- `skill` — list invocable skills. Once a relevant skill is found, the Agent can call `Skill` with its name.
- `mcp` — list connected MCP servers and the tools they expose, noting which tools are currently enabled.
- `all` (or omit `type`) — return a combined view.

Use `query` to narrow results by name or description. `ToolSearch` does not change files, run commands, or enable/disable anything.

## Background Tasks

Background task tools manage tasks started via `Bash`, `Agent`, or `AskUserQuestion`. When a task reaches a terminal state, its status and trailing output are automatically delivered back to the Agent; use `TaskOutput` to check progress early.

| Tool | Default Approval | Description |
| --- | --- | --- |
| `TaskList` | Auto-allow | List background tasks |
| `TaskOutput` | Auto-allow | View the output of a background task |
| `TaskStop` | Requires approval | Stop a running background task |

**`TaskList`** returns the list of background tasks. Optional parameters: `active_only` (defaults to true; lists only running tasks) and `limit` (defaults to 20; range 1–100).

**`TaskOutput`** returns the status and output of a task given its `task_id`. The inline preview includes at most the most recent 32 KB of content; the full log is saved to disk, and the tool also returns an `output_path` with a suggestion to use `Read` for paginated access. Optional `block` (defaults to false) and `timeout` (seconds to wait; defaults to 30; range 0–3600) parameters allow waiting for the task to complete before returning.

**`TaskStop`** accepts a `task_id` and optional `reason` (defaults to `Stopped by TaskStop`). Safe to call on tasks that are already in a terminal state.

## Scheduled Tasks

Scheduled task tools allow the Agent to re-inject a prompt into the current session at a future time — either as a one-time reminder or as a recurring cron-triggered task (periodic checks, daily reports, deployment monitoring, etc.). Schedules are bound to the session and remain active after `kimi resume`, but are not carried into a brand-new session. A single session can hold at most 50 active scheduled tasks. Set `KIMI_DISABLE_CRON=1` to disable them entirely; see [Environment Variables](../configuration/env-vars.md#运行时开关).

| Tool | Default Approval | Description |
| --- | --- | --- |
| `CronCreate` | Requires approval | Schedule a prompt to fire at a future time |
| `CronList` | Auto-allow | List scheduled tasks |
| `CronDelete` | Requires approval | Cancel a scheduled task |

**`CronCreate`** accepts `cron` (a standard 5-field cron expression in the user's local timezone: `minute hour day-of-month month day-of-week`), `prompt` (the text to inject when triggered; UTF-8 limit 8 KB), and optional `recurring` (defaults to `true`; pass `false` for a one-time reminder that auto-deletes after firing). On success, returns an 8-hex-digit `id`, a human-readable `humanSchedule` (e.g., `every 5 minutes`), and `nextFireAt` (the ISO timestamp of the next fire time).

To prevent all users from firing at the same time on the hour, the scheduler applies deterministic jitter: recurring tasks are shifted forward by `min(10% of the period, 15 minutes)`; one-time tasks that fall exactly on `:00` or `:30` are moved forward by up to 90 seconds. If the scheduler misses several fire times (e.g., because the laptop was sleeping), it fires only once on wake-up — the prompt is wrapped in a `<cron-fire>` envelope with a `coalescedCount`. Recurring tasks that have been alive for more than 7 days fire one final time with `stale="true"` and are then automatically deleted; call `CronCreate` again to keep them.

**`CronList`** is a read-only tool that accepts no parameters. It returns one record per active task with fields: `id`, `cron`, `humanSchedule`, `nextFireAt`, `recurring`, `ageDays`, and `stale`. Records are separated by `---` and sorted by schedule time.

**`CronDelete`** accepts a single `id`. For recurring tasks, all future fires stop immediately; for one-time tasks, the pending fire is cancelled. One-time tasks that have already fired are auto-deleted, so calling `CronDelete` on an already-fired one-time task returns `No cron job with id ...`. Deletion is irreversible — use `CronCreate` again to restore. `CronDelete` is also blocked in Plan mode.

## Next steps

- [Agent & Sub-Agents](../customization/agents.md) — Scheduling mechanics and context isolation for the `Agent` tool
- [Hooks](../customization/hooks.md) — Trigger local scripts before and after tool calls
- [Slash Commands](./slash-commands.md) — Quick reference for TUI built-in control commands

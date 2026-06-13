Use ToolSearch to discover capabilities that are available but not currently in the active tool set.

- Call it with `type: "skill"` to list invocable skills. Once you find a relevant skill, call `Skill` with its name.
- Call it with `type: "mcp"` to list connected MCP servers and the tools they expose. The output notes which tools are currently enabled.
- Call it with `type: "all"` (or no `type`) for a combined view.
- Use `query` to narrow results by name or description.

This is a read-only discovery tool: it does not change files, run commands, or enable/disable anything.
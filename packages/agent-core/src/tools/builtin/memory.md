Use this tool to store and retrieve long-term memories across sessions. Memories are kept in a local SQLite database and are never sent to external services.

**When to use:**
- The user states a preference that should persist across sessions (e.g., "I prefer 2-space indentation", "always use pnpm").
- A project-specific decision, convention, or fact is established (e.g., "this repo uses TypeScript strict mode", "run tests with `pnpm test`").
- You learn something during an investigation that future sessions should know (e.g., "the auth flow uses OAuth device code").

**When NOT to use:**
- Short-term task tracking — use TodoList instead.
- Sensitive secrets such as passwords or API keys — use `/login` or the system keychain instead.
- Data that should not persist on disk.

**Scopes:**
- `user-preference` and `learning` memories are global and apply everywhere.
- `project-fact` and `decision` memories are scoped to the current project root. When `category` is `project-fact` or `decision` and you do not provide a `project`, the tool will automatically use the current project root.

**How to use:**
- `remember` — store a new memory. Provide `content`, optional `category`, `tags`, and `project`.
- `recall` — retrieve relevant memories. Provide a natural-language `query`. Results include both project-scoped and global memories.
- `update` — edit an existing memory by `id`, or find the best match with `query` and rewrite it.
- `forget` — delete memories by `id` or by `query`. Prefer `id` when you know it.

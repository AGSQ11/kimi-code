# Getting started

## What is Kimi Code CLI

Kimi Code CLI is an AI agent that runs in the terminal, helping you carry out software development tasks and day-to-day terminal operations — reading and modifying code, running shell commands, searching files, fetching web pages, and autonomously planning and adjusting its next steps based on feedback as it works.

It fits scenarios such as:

- **Writing and modifying code**: implementing new features, fixing bugs, completing refactors
- **Understanding a project**: exploring an unfamiliar codebase and answering questions about architecture and implementation
- **Automating tasks**: batch-processing files, running builds and tests, chaining multiple scripts together

The CLI is written in TypeScript and runs on Node.js from a source checkout.

## Installation

This fork is installed from source. You need **Node.js ≥ 24.15.0** and **pnpm 10.33.0**.

::: tip Before you install
Kimi Code CLI is a fully interactive TUI application. For the best visual experience, run it in a terminal with true-color and ligature support, such as [Kitty](https://sw.kovidgoyal.net/kitty/) or [Ghostty](https://ghostty.org/).
:::

```sh
git clone https://github.com/AGSQ11/kimi-code.git
cd kimi-code
pnpm install
pnpm --filter @moonshot-ai/kimi-code build
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Kimi Code CLI uses the bundled Git Bash as its shell environment; if Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

Run the CLI from the repo root:

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- --version
```

For convenience, add an alias to your shell (example for `.bashrc` / `.zshrc`):

```sh
alias kimi='pnpm --filter @moonshot-ai/kimi-code run dev:prod --'
```

## Upgrade and uninstall

**Upgrade**: pull the latest fork changes, reinstall dependencies, and rebuild:

```sh
git pull
pnpm install
pnpm --filter @moonshot-ai/kimi-code build
```

**Uninstall**: delete the local repository clone.

## First launch

Move into your project directory and run the CLI to start the interactive UI:

```sh
cd your-project
pnpm --filter @moonshot-ai/kimi-code run dev:prod
```

To run a single instruction without entering the interactive UI, use `-p`:

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- -p "Take a look at this project's directory structure"
```

To resume the previous session, add `-C`:

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- -C
```

On first launch you need to configure an API source. In the interactive UI, enter `/login` to begin the login flow:

```
/login
```

`/login` opens a platform selector supporting two options:

- **Kimi Code (OAuth)** — device-code flow; open the link on any device, sign in, and enter the code to authorize
- **Kimi Platform API key** — enter an API key from `platform.kimi.com` or `platform.kimi.ai`

To sign out, enter `/logout` to clear the current credentials.

::: tip Using other AI providers
If you want to connect Anthropic, OpenAI, Google, or other providers, edit `~/.kimi-code/config.toml` directly to configure the API key. See [Providers and models](../configuration/providers.md) for details. For the full reference of all config options, see [Configuration files](../configuration/config-files.md), [Environment variables](../configuration/env-vars.md), and [Configuration overrides](../configuration/overrides.md).
:::

## Your first conversation

Once logged in, describe a task in natural language. A good starting point is to let Kimi Code CLI familiarize itself with the project:

```
Take a look at this project's directory structure and briefly describe what each directory is for.
```

Kimi Code CLI automatically calls file-reading, search, and other tools to browse the relevant content before responding. Read-only operations are executed automatically by default without requiring confirmation. For operations that modify files or run shell commands, it asks for your confirmation before proceeding.

You can also describe a more concrete task directly:

```
Add a function in src/utils that converts any string to kebab-case, and add a unit test for it.
```

Kimi Code CLI plans the steps, modifies the code, runs the tests, and tells you what it did at each step.

::: tip Not sure what to do? Type `/help`
Type `/help` at any time to open the built-in command and keyboard shortcut panel. Use `↑`/`↓` to browse and `Esc` to close. To exit, type `/exit`, press `Ctrl-C` twice, or press `Ctrl-D` with the input box empty.
:::

## Common commands and keyboard shortcuts

For a first-time user, the following is all you need to know:

**Session commands**

| Command | Description |
| --- | --- |
| `/new` | Start a new session, clearing the current context |
| `/sessions` | Browse session history and choose one to resume |
| `/model` | Switch the current model |
| `/compact` | Manually compress the context to free up tokens |
| `/fork` | Fork the current session, keeping history but continuing independently |

**Most-used keyboard shortcuts**

| Shortcut | Description |
| --- | --- |
| `Esc` | Interrupt streaming output / close a popup |
| `Ctrl-C` | Interrupt output; press twice while idle to exit |
| `Shift-Tab` | Toggle Plan mode |
| `Ctrl-S` | Inject a message mid-stream without waiting for the current response to finish |
| `Ctrl-O` | Collapse / expand tool output |

For the full list, type `/help` or visit [Slash commands reference](../reference/slash-commands.md) and [Keyboard shortcuts](../reference/keyboard.md).

## Where data is stored

Kimi Code CLI stores its local data under `~/.kimi-code/` by default — config files, session records, logs, and the update cache. To move it elsewhere, point to a new path via the `KIMI_CODE_HOME` environment variable. For the full directory layout, see [Data locations](../configuration/data-locations.md) and [Environment variables](../configuration/env-vars.md).

## Next steps

- [Interaction and input](./interaction.md) — input box operations, approval flow, Plan mode, and YOLO mode explained
- [Sessions and context](./sessions.md) — resuming sessions, compressing context, exporting sessions
- [Common use cases](./use-cases.md) — prompt examples for typical tasks

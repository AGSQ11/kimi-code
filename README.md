# Kimi Code CLI

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Docs](https://img.shields.io/badge/docs-online-blue)](https://moonshotai.github.io/kimi-code/en/) <br>
[Documentation](https://moonshotai.github.io/kimi-code/en/) · [Issues](https://github.com/AGSQ11/kimi-code/issues) · [中文](README.zh-CN.md)

![Demo of using Kimi Code](./docs/media/intro.gif)

## What is Kimi Code CLI

Kimi Code CLI is an AI coding agent that runs in your terminal — it can read and edit code, run shell commands, search files, fetch web pages, and choose the next step based on the feedback it receives. It works out of the box with Moonshot AI’s Kimi models and can also be configured to use other compatible providers.

## Install

This fork is installed from source. Requires **Node.js ≥ 24.15.0** and **pnpm 10.33.0**.

```sh
git clone https://github.com/AGSQ11/kimi-code.git
cd kimi-code
pnpm install
pnpm --filter @moonshot-ai/kimi-code build
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Kimi Code CLI uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

Run the CLI from the repo root:

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- --version
```

For convenience, add an alias to your shell (example for `.bashrc` / `.zshrc`):

```sh
alias kimi='pnpm --filter @moonshot-ai/kimi-code run dev:prod --'
```

For build and development commands, see the [Develop](#develop) section below.

## Quick Start

Open a project and start the interactive UI:

```sh
cd your-project
pnpm --filter @moonshot-ai/kimi-code run dev:prod
```

On first launch, run `/login` inside Kimi Code CLI and choose either Kimi Code OAuth or a Moonshot AI Open Platform API key. After login, try your first task:

```
Take a look at this project and explain its main directories.
```

## Key Features

- **Source install.** Clone and build from the GitHub fork, ideal for customization and staying current with fork updates.
- **Blazing-fast startup.** The TUI is ready in milliseconds, so starting a session never feels heavy.
- **Purpose-built TUI.** A carefully tuned interface, optimized end to end for long, focused agent sessions.
- **Video input.** Drop a screen recording or demo clip into the chat and let the agent watch what is hard to describe in words — turn a reference clip into a LUT, a long video into a short, a screen recording into working code, and more.
- **AI-native MCP configuration.** Add, edit, and authenticate Model Context Protocol servers conversationally with `/mcp-config`, without hand-editing JSON.
- **Rich plugin ecosystem.** Install skills, MCP servers, and data sources from the marketplace or any GitHub repo, with each install's trust level surfaced up front.
- **Subagents for focused, parallel work.** Dispatch built-in `coder`, `explore`, and `plan` subagents in isolated contexts while keeping the main conversation clean.
- **Lifecycle hooks.** Run local commands at key points to gate risky tool calls, audit decisions, trigger desktop notifications, or connect to your own automation.
- **Editor & IDE integration (ACP).** Drive a Kimi Code CLI session straight from Zed, JetBrains, or any [Agent Client Protocol](https://agentclientprotocol.com/) client with `kimi acp`.
- **Persistent, learning memory.** Project facts, decisions, critiques, comparisons, and eval summaries survive across sessions, so the agent builds institutional knowledge.

## Memory, reasoning, and quality loop

These features work together so later sessions benefit from earlier ones:

- **Persistent Memory** — project facts, user preferences, decisions, critique findings, comparison summaries, and eval results are recalled automatically when relevant. Use [`/memory`](https://moonshotai.github.io/kimi-code/en/reference/slash-commands) to list, pin, or delete memories.
- **Think tool** — the agent can record concise reasoning steps; decision-category thoughts are promoted to long-term Memory at the end of a turn. See the [Tools reference](https://moonshotai.github.io/kimi-code/en/reference/tools).
- **Criticize** — [`/criticize`](https://moonshotai.github.io/kimi-code/en/reference/slash-commands) spawns a critic that starts with the same relevant memories as the main agent and stores its findings as `critique-finding` memories.
- **Compare** — [`/compare`](https://moonshotai.github.io/kimi-code/en/reference/slash-commands) runs the same prompt against 2–4 models side-by-side, remembers the comparison summary, and records promoted or synthesized choices as `decision` memories.
- **Eval** — `kimi eval` runs prompt/model/variation benchmarks with a memory snapshot and stores an aggregate summary as an `eval` memory. See the [`kimi eval` reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-command#kimi-eval).

## Use it in your editor (ACP)

Kimi Code CLI speaks the [Agent Client Protocol](https://agentclientprotocol.com/), so ACP-compatible editors and IDEs (Zed, JetBrains, …) can drive a session over stdio. Log in once, then point your editor at the `acp` subcommand — no extra login needed.

For Zed, add this to `~/.config/zed/settings.json`:

```json
{
  "agent_servers": {
    "Kimi Code CLI": {
      "type": "custom",
      "command": "pnpm",
      "args": ["--filter", "@moonshot-ai/kimi-code", "run", "dev:prod", "--", "acp"],
      "env": {}
    }
  }
}
```

Then open a new conversation in Zed's Agent panel. See [Using in IDEs](https://moonshotai.github.io/kimi-code/en/guides/ides) for JetBrains setup and troubleshooting, and the [`kimi acp` reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp) for the full capability matrix.

## Docs

- [Getting Started](https://moonshotai.github.io/kimi-code/en/guides/getting-started)
- [Interaction and approvals](https://moonshotai.github.io/kimi-code/en/guides/interaction)
- [Sessions](https://moonshotai.github.io/kimi-code/en/guides/sessions)
- [Using in IDEs (ACP)](https://moonshotai.github.io/kimi-code/en/guides/ides)
- [Configuration](https://moonshotai.github.io/kimi-code/en/configuration/config-files)
- [Command reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-command)

## Develop

Requirements: Node.js ≥ 24.15.0, pnpm 10.33.0.

```sh
git clone https://github.com/AGSQ11/kimi-code.git
cd kimi-code
pnpm install
```

```sh
pnpm dev:cli    # run the CLI in dev mode
pnpm test       # run tests
pnpm typecheck  # TypeScript check
pnpm lint       # oxlint
pnpm build      # build all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide.

## Community

- [Issues](https://github.com/AGSQ11/kimi-code/issues)
- For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## Acknowledgements

Our TUI is built on top of [`pi-tui`](https://github.com/earendil-works/pi-mono/tree/main/packages/tui). We thank the authors of `pi-tui` for their valuable work.

## License

Released under the [MIT License](LICENSE).

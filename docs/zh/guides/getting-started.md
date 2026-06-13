# 开始使用

## Kimi Code CLI 是什么

Kimi Code CLI 是一个运行在终端中的 AI Agent，帮助你完成软件开发任务和日常的终端操作——阅读和修改代码、执行 Shell 命令、搜索文件、抓取网页，并在执行过程中根据反馈自主规划和调整下一步行动。

它适用于以下场景：

- **编写和修改代码**：实现新功能、修复 bug、完成重构
- **理解项目**：探索陌生的代码库，解答架构和实现层面的问题
- **自动化任务**：批量处理文件、运行构建与测试、串联多个脚本

整套 CLI 以 TypeScript 编写，从源码检出运行在 Node.js 之上。

## 安装

本 fork 需要从源码安装。要求 **Node.js ≥ 24.15.0** 和 **pnpm 10.33.0**。

::: tip 安装之前
Kimi Code CLI 为全交互式 TUI 应用，推荐在支持真彩色与连字的现代终端中运行以获得最佳体验，例如 [Kitty](https://sw.kovidgoyal.net/kitty/) 或 [Ghostty](https://ghostty.org/)。
:::

```sh
git clone https://github.com/AGSQ11/kimi-code.git
cd kimi-code
pnpm install
pnpm --filter @moonshot-ai/kimi-code build
```

> Windows 用户首次启动前还需要安装 [Git for Windows](https://gitforwindows.org/)，Kimi Code CLI 会使用其中的 Git Bash 作为 Shell 环境。如果 Git Bash 安装在非标准路径，请把 `KIMI_SHELL_PATH` 设为 `bash.exe` 的绝对路径。

从仓库根目录运行 CLI：

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- --version
```

可以给 shell 加一个别名（以 `.bashrc` / `.zshrc` 为例）：

```sh
alias kimi='pnpm --filter @moonshot-ai/kimi-code run dev:prod --'
```

## 升级与卸载

**升级**：拉取 fork 最新代码，重新安装依赖并构建：

```sh
git pull
pnpm install
pnpm --filter @moonshot-ai/kimi-code build
```

**卸载**：删除本地仓库克隆即可。

## 第一次启动

进入项目目录后运行 CLI 启动交互界面：

```sh
cd your-project
pnpm --filter @moonshot-ai/kimi-code run dev:prod
```

只想执行一条指令而不进入交互界面时，使用 `-p`：

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- -p "帮我看一下这个项目的目录结构"
```

继续上一次会话加 `-C`：

```sh
pnpm --filter @moonshot-ai/kimi-code run dev:prod -- -C
```

首次启动时需要配置 API 来源。在交互界面中输入 `/login` 进入登录流程：

```
/login
```

`/login` 会弹出平台选择器，支持两种方式：

- **Kimi Code（OAuth）** — 验证码流程，在任意设备打开链接、登录并输入验证码即可授权
- **Kimi Platform API 密钥** — 输入来自 `platform.kimi.com` 或 `platform.kimi.ai` 的 API 密钥

需要退出登录时，输入 `/logout` 清除当前凭证。

::: tip 使用其他 AI 供应商
如果你想接入 Anthropic、OpenAI、Google 等其他供应商，需要直接编辑 `~/.kimi-code/config.toml` 配置 API 密钥，详见[平台与模型](../configuration/providers.md)。配置项完整说明见[配置文件](../configuration/config-files.md)、[环境变量](../configuration/env-vars.md)和[配置覆盖](../configuration/overrides.md)。
:::

## 第一个对话

登录完成后，用自然语言描述任务即可。先让它熟悉当前项目：

```
帮我看一下这个项目的目录结构，简单介绍一下每个目录是做什么的
```

Kimi Code CLI 会自动调用文件读取、搜索等工具浏览相关内容后给出回答。只读操作默认自动执行无需确认；对于会修改文件或执行 Shell 命令的操作，默认会在执行前征求确认。

也可以直接描述更具体的任务：

```
在 src/utils 里新增一个函数，用来把任意字符串转成 kebab-case，并补一个单元测试
```

Kimi Code CLI 会规划步骤、修改代码、运行测试，并在每一步告诉你它做了什么。

::: tip 不知道能做什么？输入 `/help`
随时在输入框输入 `/help`，可以打开内置的命令和快捷键面板，按 `↑`/`↓` 翻看，`Esc` 关闭。退出时输入 `/exit`，或按 `Ctrl-C` 两次，或在输入框为空时按 `Ctrl-D`。
:::

## 常用命令与快捷键速查

第一次使用时，记住下面这些就够了：

**会话相关命令**

| 命令 | 说明 |
| --- | --- |
| `/new` | 开启新会话，清空当前上下文 |
| `/sessions` | 浏览历史会话，选择恢复 |
| `/model` | 切换当前使用的模型 |
| `/compact` | 手动压缩上下文，释放 token |
| `/fork` | 派生当前会话，保留历史独立继续 |

**最常用快捷键**

| 快捷键 | 说明 |
| --- | --- |
| `Esc` | 中断流式输出 / 关闭弹窗 |
| `Ctrl-C` | 中断输出；空闲时连按两次退出 |
| `Shift-Tab` | 切换 Plan 模式 |
| `Ctrl-S` | 输出中途插入消息，无需等待结束 |
| `Ctrl-O` | 折叠 / 展开工具输出 |

想看完整列表，输入 `/help` 或访问[斜杠命令参考](../reference/slash-commands.md)和[键盘快捷键](../reference/keyboard.md)。

## 数据存放在哪里

Kimi Code CLI 的本地数据默认保存在 `~/.kimi-code/` 下，包含配置文件、会话记录、日志和更新缓存。如需迁移到别处，通过 `KIMI_CODE_HOME` 环境变量指定新路径。完整说明见[数据路径](../configuration/data-locations.md)和[环境变量](../configuration/env-vars.md)。

## 下一步

- [交互与输入](./interaction.md) — 输入框操作、审批流程、Plan 模式和 YOLO 模式详解
- [会话与上下文](./sessions.md) — 恢复会话、上下文压缩、导出会话
- [常见使用案例](./use-cases.md) — 典型任务的 prompt 示例

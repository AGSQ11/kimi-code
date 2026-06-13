Use the PowerShell tool to execute PowerShell commands on Windows. It is the Windows counterpart to the Bash tool.

- Runs with `-NoProfile -NonInteractive` to keep startup fast and avoid user-specific profile side effects.
- The `cwd` argument sets the working directory for the command.
- Use a `timeout` (in seconds) for long-running commands; the default is 60s.
- Prefer PowerShell for Windows-native operations (registry, WMI, .NET, Windows services) and Bash (Git Bash) for POSIX-style commands.

Do not use PowerShell for operations that have a dedicated tool (Read, Write, Edit, Grep, Glob, etc.).
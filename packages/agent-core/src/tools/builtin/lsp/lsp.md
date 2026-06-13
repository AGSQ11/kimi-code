Use the LSP tool for semantic code intelligence instead of text search when possible.

Supported operations:
- `definition` — jump to the definition of a symbol.
- `references` — find all references to a symbol.
- `hover` — get type information and documentation for a symbol.
- `diagnostics` — request errors and warnings for a file.
- `workspace_symbols` — search symbols across the workspace by name.

All line and character numbers are **zero-based**, matching the Language Server Protocol.

The relevant language server must be installed and on PATH (e.g. `typescript-language-server` for TypeScript, `pyright-langserver` for Python, `rust-analyzer` for Rust, `gopls` for Go). If no server is available for a file, the tool returns an error and you should fall back to Grep/Read.
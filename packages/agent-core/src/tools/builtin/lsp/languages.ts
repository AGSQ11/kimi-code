/**
 * Minimal language-server registry for the LSP tool.
 *
 * Servers are started lazily: the first request for a given language id
 * spawns the matching command. The user must have the relevant server
 * installed and on PATH.
 */

export interface LanguageServerConfig {
  readonly languageId: string;
  readonly command: string;
  readonly args: string[];
  readonly extensions: string[];
}

export const DEFAULT_LANGUAGE_SERVERS: readonly LanguageServerConfig[] = [
  {
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    languageId: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensions: ['.py', '.pyi'],
  },
  {
    languageId: 'rust',
    command: 'rust-analyzer',
    args: [],
    extensions: ['.rs'],
  },
  {
    languageId: 'go',
    command: 'gopls',
    args: [],
    extensions: ['.go'],
  },
];

export function languageIdForFile(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  for (const server of DEFAULT_LANGUAGE_SERVERS) {
    if (server.extensions.some((ext) => lower.endsWith(ext))) {
      return server.languageId;
    }
  }
  return undefined;
}

export function serverConfigForLanguageId(languageId: string): LanguageServerConfig | undefined {
  return DEFAULT_LANGUAGE_SERVERS.find((s) => s.languageId === languageId);
}

export function serverConfigForFile(filePath: string): LanguageServerConfig | undefined {
  const id = languageIdForFile(filePath);
  if (id === undefined) return undefined;
  return serverConfigForLanguageId(id);
}

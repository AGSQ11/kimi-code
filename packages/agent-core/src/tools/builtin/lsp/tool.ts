/**
 * LspTool — semantic code intelligence via Language Server Protocol.
 *
 * Delegates to LspManager, which lazily starts language servers per workspace.
 */

import type { Kaos } from '@moonshot-ai/kaos';
import { z } from 'zod';

import type { BuiltinTool } from '#/agent/tool';
import { ToolAccesses } from '#/loop/tool-access';
import type { ExecutableToolResult, ToolExecution } from '#/loop/types';
import { resolvePathAccessPath } from '#/tools/policies/path-access';
import { toInputJsonSchema } from '#/tools/support/input-schema';
import { literalRulePattern, matchesPathRuleSubject } from '#/tools/support/rule-match';
import type { WorkspaceConfig } from '#/tools/support/workspace';
import DESCRIPTION from './lsp.md?raw';
import { LspManager } from './manager';

export const LSP_TOOL_NAME = 'LSP' as const;

export interface LspInput {
  operation: 'definition' | 'references' | 'hover' | 'diagnostics' | 'workspace_symbols';
  file?: string;
  line?: number;
  character?: number;
  query?: string;
}

const LspInputSchema: z.ZodType<LspInput> = z.object({
  operation: z
    .enum(['definition', 'references', 'hover', 'diagnostics', 'workspace_symbols'])
    .describe('LSP operation to perform.'),
  file: z
    .string()
    .optional()
    .describe('Required for file-based operations. Path to the source file.'),
  line: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based line number for file-based operations.'),
  character: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based character number for file-based operations.'),
  query: z.string().optional().describe('Required for workspace_symbols: symbol name query.'),
});

export class LspTool implements BuiltinTool<LspInput> {
  readonly name = LSP_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(LspInputSchema);

  private manager: LspManager | undefined;

  constructor(
    private readonly kaos: Kaos,
    private readonly workspace: WorkspaceConfig,
  ) {}

  resolveExecution(args: LspInput): ToolExecution {
    const filePath =
      args.file !== undefined
        ? resolvePathAccessPath(args.file, {
            kaos: this.kaos,
            workspace: this.workspace,
            operation: 'read',
          })
        : undefined;

    return {
      accesses: filePath !== undefined ? ToolAccesses.readFile(filePath) : ToolAccesses.none(),
      description: `LSP ${args.operation}${filePath !== undefined ? ` on ${args.file}` : ''}`,
      approvalRule: literalRulePattern(this.name, args.operation),
      matchesRule: (ruleArgs) =>
        filePath !== undefined
          ? matchesPathRuleSubject(ruleArgs, filePath, {
              cwd: this.workspace.workspaceDir,
              pathClass: this.kaos.pathClass(),
              homeDir: this.kaos.gethome(),
            })
          : true,
      execute: () => this.execution(args, filePath),
    };
  }

  private async execution(
    args: LspInput,
    filePath: string | undefined,
  ): Promise<ExecutableToolResult> {
    try {
      this.manager ??= new LspManager(this.kaos, this.workspace.workspaceDir);
      const result = await this.runOperation(args, filePath);
      return { isError: false, output: renderResult(result) };
    } catch (error) {
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runOperation(
    args: LspInput,
    filePath: string | undefined,
  ): Promise<unknown> {
    const manager = this.manager!;

    switch (args.operation) {
      case 'workspace_symbols': {
        if (args.query === undefined) throw new Error('query is required for workspace_symbols.');
        return manager.workspaceSymbols(args.query);
      }
      case 'diagnostics': {
        if (filePath === undefined) throw new Error('file is required for diagnostics.');
        return manager.diagnosticsForFile(filePath);
      }
      case 'definition':
      case 'references':
      case 'hover': {
        if (filePath === undefined) throw new Error(`file is required for operation=${args.operation}.`);
        if (args.line === undefined) throw new Error(`line is required for operation=${args.operation}.`);
        if (args.character === undefined)
          throw new Error(`character is required for operation=${args.operation}.`);

        const uri = pathToFileUrl(filePath);
        const params = {
          textDocument: { uri },
          position: { line: args.line, character: args.character },
        };
        if (args.operation === 'definition') {
          return manager.requestFileOperation(filePath, 'textDocument/definition', params);
        }
        if (args.operation === 'references') {
          return manager.requestFileOperation(filePath, 'textDocument/references', {
            ...params,
            context: { includeDeclaration: true },
          });
        }
        return manager.requestFileOperation(filePath, 'textDocument/hover', params);
      }
    }
  }
}

function pathToFileUrl(filePath: string): string {
  // Quick file:// URL construction that works for POSIX and Windows absolute paths.
  const prefix = 'file://';
  if (process.platform === 'win32' && /^[A-Za-z]:/.test(filePath)) {
    return `${prefix}/${filePath.replaceAll('\\', '/')}`;
  }
  return `${prefix}${filePath}`;
}

function renderResult(result: unknown): string {
  if (result === undefined || result === null) return 'No results.';
  if (Array.isArray(result) && result.length === 0) return 'No results.';
  return JSON.stringify(result, null, 2);
}

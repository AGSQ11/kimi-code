/**
 * NotebookEditTool — read/write .ipynb notebook cells.
 *
 * Preserves JSON structure and metadata while letting the model inspect or
 * modify cell source. Uses Kaos for I/O so workspace path policies apply.
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
import DESCRIPTION from './notebook-edit.md?raw';

export const NOTEBOOK_EDIT_TOOL_NAME = 'NotebookEdit' as const;

const NotebookCellSchema = z.object({
  cell_type: z.enum(['code', 'markdown']).describe('Cell type.'),
  source: z.string().describe('Cell source code or markdown.'),
});

const NotebookEditInputSchema = z
  .object({
    path: z.string().describe('Path to the .ipynb file.'),
    operation: z
      .enum(['read', 'edit', 'write'])
      .describe('Operation to perform: read, edit a single cell, or write the whole notebook.'),
    cell_index: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Required for operation=edit: the zero-based index of the cell to edit.'),
    source: z
      .string()
      .optional()
      .describe('Required for operation=edit and for each cell in operation=write.'),
    cells: z
      .array(NotebookCellSchema)
      .optional()
      .describe('Required for operation=write: array of cells.'),
  })
  .superRefine((val, ctx) => {
    if (val.operation === 'edit') {
      if (val.cell_index === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cell_index'],
          message: 'cell_index is required for operation=edit.',
        });
      }
      if (val.source === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source'],
          message: 'source is required for operation=edit.',
        });
      }
    }
    if (val.operation === 'write' && (val.cells === undefined || val.cells.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cells'],
        message: 'cells is required for operation=write.',
      });
    }
  });

export type NotebookEditInput = z.infer<typeof NotebookEditInputSchema>;

interface NotebookJson {
  cells?: Array<{
    cell_type: string;
    source: string | string[];
    metadata?: Record<string, unknown>;
    outputs?: unknown[];
    execution_count?: number | null;
  }>;
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

export class NotebookEditTool implements BuiltinTool<NotebookEditInput> {
  readonly name = NOTEBOOK_EDIT_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(NotebookEditInputSchema);

  constructor(
    private readonly kaos: Kaos,
    private readonly workspace: WorkspaceConfig,
  ) {}

  resolveExecution(args: NotebookEditInput): ToolExecution {
    const path = resolvePathAccessPath(args.path, {
      kaos: this.kaos,
      workspace: this.workspace,
      operation: args.operation === 'read' ? 'read' : 'write',
    });
    return {
      accesses:
        args.operation === 'read' ? ToolAccesses.readFile(path) : ToolAccesses.writeFile(path),
      description: `${args.operation === 'read' ? 'Reading' : args.operation === 'edit' ? 'Editing' : 'Writing'} notebook ${args.path}`,
      display: {
        kind: 'file_io',
        operation: args.operation === 'read' ? 'read' : 'write',
        path,
      },
      approvalRule: literalRulePattern(this.name, path),
      matchesRule: (ruleArgs) =>
        matchesPathRuleSubject(ruleArgs, path, {
          cwd: this.workspace.workspaceDir,
          pathClass: this.kaos.pathClass(),
          homeDir: this.kaos.gethome(),
        }),
      execute: () => this.execution(args, path),
    };
  }

  private async execution(
    args: NotebookEditInput,
    safePath: string,
  ): Promise<ExecutableToolResult> {
    try {
      switch (args.operation) {
        case 'read':
          return await this.readNotebook(safePath);
        case 'edit':
          return await this.editCell(safePath, args.cell_index!, args.source!);
        case 'write':
          return await this.writeNotebook(safePath, args.cells!);
      }
    } catch (error) {
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readNotebook(safePath: string): Promise<ExecutableToolResult> {
    const text = await this.kaos.readText(safePath);
    const notebook = this.parseNotebook(text, safePath);
    const cells = notebook.cells ?? [];
    if (cells.length === 0) {
      return { output: 'Notebook contains no cells.' };
    }
    const lines = cells.map((cell, index) => {
      const source = normalizeCellSource(cell.source);
      const preview = source.length > 200 ? `${source.slice(0, 200)}…` : source;
      return `[${index}] ${cell.cell_type}\n${preview}`;
    });
    return {
      output: `Notebook has ${cells.length} cell${cells.length === 1 ? '' : 's'}:\n\n${lines.join('\n\n')}`,
    };
  }

  private async editCell(
    safePath: string,
    cellIndex: number,
    source: string,
  ): Promise<ExecutableToolResult> {
    const text = await this.kaos.readText(safePath);
    const notebook = this.parseNotebook(text, safePath);
    const cells = notebook.cells ?? [];
    if (cellIndex >= cells.length) {
      return {
        isError: true,
        output: `cell_index ${cellIndex} is out of range. Notebook has ${cells.length} cell${cells.length === 1 ? '' : 's'}.`,
      };
    }
    cells[cellIndex]!.source = source;
    await this.kaos.writeText(safePath, JSON.stringify(notebook, null, 2));
    return { output: `Updated cell ${cellIndex} in ${safePath}.` };
  }

  private async writeNotebook(
    safePath: string,
    cells: Array<{ cell_type: 'code' | 'markdown'; source: string }>,
  ): Promise<ExecutableToolResult> {
    const notebook: NotebookJson = {
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
      cells: cells.map((cell) => ({
        cell_type: cell.cell_type,
        source: cell.source,
        metadata: {},
        outputs: cell.cell_type === 'code' ? [] : undefined,
        execution_count: cell.cell_type === 'code' ? null : undefined,
      })),
    };
    await this.kaos.writeText(safePath, JSON.stringify(notebook, null, 2));
    return { output: `Wrote notebook with ${cells.length} cell${cells.length === 1 ? '' : 's'} to ${safePath}.` };
  }

  private parseNotebook(text: string, displayPath: string): NotebookJson {
    try {
      return JSON.parse(text) as NotebookJson;
    } catch {
      throw new Error(`"${displayPath}" is not valid JSON.`);
    }
  }
}

function normalizeCellSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

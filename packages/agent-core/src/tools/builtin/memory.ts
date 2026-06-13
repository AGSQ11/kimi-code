/**
 * MemoryTool — long-term memory storage and retrieval.
 *
 * See memory.md for the tool description shown to the model.
 */

import { z } from 'zod';

import type { MemoryStore } from '#/memory/store';
import { toInputJsonSchema } from '#/tools/support/input-schema';
import type { BuiltinTool } from '#/agent/tool';
import type { ToolExecution } from '#/loop/types';
import DESCRIPTION from './memory.md?raw';

export const MEMORY_TOOL_NAME = 'Memory' as const;

export interface MemoryToolInput {
  operation: 'remember' | 'recall' | 'update' | 'forget';
  content?: string;
  query?: string;
  id?: string;
  category?: string;
  tags?: string[];
  project?: string;
  limit?: number;
}

const MemoryToolInputSchema: z.ZodType<MemoryToolInput> = z.object({
  operation: z
    .enum(['remember', 'recall', 'update', 'forget'])
    .describe('The memory operation to perform.'),
  content: z
    .string()
    .optional()
    .describe('Text to store or the new text when updating. Required for remember and update.'),
  query: z
    .string()
    .optional()
    .describe('Natural-language query for recall, update, or forget.'),
  id: z.string().optional().describe('Exact memory id for update or forget.'),
  category: z
    .string()
    .optional()
    .describe("Category such as 'user-preference', 'project-fact', 'decision', or 'learning'."),
  tags: z
    .array(z.string())
    .optional()
    .describe('Optional tags to improve searchability.'),
  project: z
    .string()
    .optional()
    .describe('Project scope for the memory. Defaults to the current project root for project facts.'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of memories to return. Default 5.'),
});

export class MemoryTool implements BuiltinTool<MemoryToolInput> {
  readonly name = MEMORY_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(MemoryToolInputSchema);

  constructor(
    private readonly store: MemoryStore,
    private readonly getProjectRoot: () => string | undefined,
  ) {}

  resolveExecution(input: MemoryToolInput): ToolExecution {
    const description = renderDescription(input);
    return {
      description,
      approvalRule: this.name,
      execute: async () => {
        try {
          const output = await this.execute(input);
          return { isError: false, output };
        } catch (error) {
          return { isError: true, output: errorMessage(error) };
        }
      },
    };
  }

  private async execute(input: MemoryToolInput): Promise<string> {
    switch (input.operation) {
      case 'remember':
        return this.executeRemember(input);
      case 'recall':
        return this.executeRecall(input);
      case 'update':
        return this.executeUpdate(input);
      case 'forget':
        return this.executeForget(input);
      default: {
        const _exhaustive: never = input.operation;
        throw new Error(`Unknown memory operation: ${String(_exhaustive)}`);
      }
    }
  }

  private async executeRemember(input: MemoryToolInput): Promise<string> {
    const content = input.content;
    if (content === undefined || content.length === 0) {
      throw new Error('remember requires a non-empty content field.');
    }
    const project = resolveProject(input.category, input.project, this.getProjectRoot);
    const memory = await this.store.remember({
      content,
      category: input.category,
      tags: input.tags,
      project,
    });
    return `Remembered (${memory.id}).`;
  }

  private async executeRecall(input: MemoryToolInput): Promise<string> {
    const query = input.query;
    if (query === undefined || query.length === 0) {
      throw new Error('recall requires a non-empty query field.');
    }
    const project = input.project ?? this.getProjectRoot();
    const memories = await this.store.recall({
      query,
      category: input.category,
      project,
      includeGlobal: true,
      limit: input.limit,
    });
    if (memories.length === 0) {
      return 'No relevant memories found.';
    }
    return renderMemoryList(memories);
  }

  private async executeUpdate(input: MemoryToolInput): Promise<string> {
    if (input.id === undefined && (input.query === undefined || input.query.length === 0)) {
      throw new Error('update requires either an id or a query field.');
    }
    const memory = await this.store.update({
      id: input.id,
      query: input.query,
      content: input.content,
      category: input.category,
      tags: input.tags,
    });
    if (memory === undefined) {
      return 'No matching memory found to update.';
    }
    return `Updated memory ${memory.id}.`;
  }

  private async executeForget(input: MemoryToolInput): Promise<string> {
    if (input.id === undefined && (input.query === undefined || input.query.length === 0)) {
      throw new Error('forget requires either an id or a query field.');
    }
    const count = await this.store.forget({
      id: input.id,
      query: input.query,
      category: input.category,
      project: input.project ?? this.getProjectRoot(),
    });
    return count === 0 ? 'No matching memories found.' : `Forgot ${count} memory${count === 1 ? '' : 'ies'}.`;
  }
}

function resolveProject(
  category: string | undefined,
  explicitProject: string | undefined,
  getProjectRoot: () => string | undefined,
): string | undefined {
  if (explicitProject !== undefined) {
    return explicitProject;
  }
  const projectRoot = getProjectRoot();
  if (projectRoot === undefined) {
    return undefined;
  }
  // Treat project-fact and decision as project-scoped by default.
  if (category === 'project-fact' || category === 'decision') {
    return projectRoot;
  }
  return undefined;
}

function renderDescription(input: MemoryToolInput): string {
  switch (input.operation) {
    case 'remember':
      return 'Remembering a fact';
    case 'recall':
      return 'Recalling memories';
    case 'update':
      return 'Updating a memory';
    case 'forget':
      return 'Forgetting memories';
  }
}

function renderMemoryList(memories: import('#/memory/types').Memory[]): string {
  const lines = memories.map((memory, index) => {
    const category = memory.category ?? 'uncategorized';
    const project = memory.project !== null ? ` [${memory.project}]` : '';
    const tags = memory.tags !== null && memory.tags.length > 0 ? ` #${memory.tags.join(' #')}` : '';
    return `${index + 1}. [${category}]${project}${tags} ${memory.id}\n   ${memory.content}`;
  });
  return `Relevant memories:\n${lines.join('\n\n')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

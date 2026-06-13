/**
 * ThinkTool — explicit reasoning / chain-of-thought helper.
 *
 * Lets any capable LLM stop and reason before acting. The thought is stored
 * in the agent-level tool store so it survives compaction and can be reviewed
 * on wire replay.
 */

import { z } from 'zod';

import type { BuiltinTool } from '#/agent/tool';
import type { ToolExecution } from '#/loop/types';
import { toInputJsonSchema } from '#/tools/support/input-schema';
import type { ToolStore } from '#/tools/store';
import DESCRIPTION from './think.md?raw';

export const THINK_TOOL_NAME = 'Think' as const;
export const THINK_STORE_KEY = 'thoughts';

export interface Thought {
  readonly content: string;
  readonly category?: string;
  readonly tags?: string[];
}

declare module '#/tools/store' {
  interface ToolStoreData {
    thoughts: readonly unknown[];
  }
}

export interface ThinkInput {
  thought: string;
  category?: string;
  tags?: string[];
}

const ThinkInputSchema: z.ZodType<ThinkInput> = z.object({
  thought: z.string().min(1).describe('A concise reasoning step or chain-of-thought.'),
  category: z
    .string()
    .optional()
    .describe("Optional category such as 'plan', 'constraint', 'decision', or 'reflection'."),
  tags: z.array(z.string()).optional().describe('Optional tags for later retrieval.'),
});

export class ThinkTool implements BuiltinTool<ThinkInput> {
  readonly name = THINK_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ThinkInputSchema);

  constructor(private readonly store: ToolStore) {}

  resolveExecution(args: ThinkInput): ToolExecution {
    const preview =
      args.thought.length > 60 ? `${args.thought.slice(0, 60)}…` : args.thought;
    return {
      description: `Thinking: ${preview}`,
      approvalRule: this.name,
      execute: async () => {
        const previous = (this.store.get(THINK_STORE_KEY) ?? []) as Thought[];
        const entry: Thought = {
          content: args.thought,
          category: args.category,
          tags: args.tags,
        };
        this.store.set(THINK_STORE_KEY, [...previous, entry] as readonly unknown[]);
        const tagSuffix =
          entry.tags !== undefined && entry.tags.length > 0
            ? ` [${entry.tags.join(', ')}]`
            : '';
        const categorySuffix = entry.category !== undefined ? ` (${entry.category})` : '';
        return {
          isError: false,
          output: `Thought recorded${categorySuffix}${tagSuffix}.\n\n${entry.content}\n\nNow proceed with the appropriate tools.`,
        };
      },
    };
  }
}

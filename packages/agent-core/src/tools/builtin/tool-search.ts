/**
 * ToolSearch — discover available skills and MCP tools.
 *
 * Read-only catalog of capabilities the model may not see in its active tool
 * list. Helps any smart LLM decide whether to invoke a skill or an MCP tool.
 */

import { z } from 'zod';

import type { Tool } from '@moonshot-ai/kosong';

import type { Agent } from '#/agent';
import type { BuiltinTool } from '#/agent/tool';
import type { ToolExecution } from '#/loop/types';
import type { SkillDefinition } from '#/skill';
import { toInputJsonSchema } from '#/tools/support/input-schema';
import DESCRIPTION from './tool-search.md?raw';

export const TOOL_SEARCH_TOOL_NAME = 'ToolSearch' as const;

export interface ToolSearchInput {
  query?: string;
  type?: 'all' | 'skill' | 'mcp';
}

const ToolSearchInputSchema: z.ZodType<ToolSearchInput> = z.object({
  query: z
    .string()
    .optional()
    .describe('Optional filter matched against names and descriptions.'),
  type: z
    .enum(['all', 'skill', 'mcp'])
    .default('all')
    .optional()
    .describe('What to list: skills, MCP tools, or both.'),
});

export class ToolSearchTool implements BuiltinTool<ToolSearchInput> {
  readonly name = TOOL_SEARCH_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ToolSearchInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: ToolSearchInput): ToolExecution {
    return {
      description: args.query !== undefined ? `Searching tools for "${args.query}"` : 'Listing available tools',
      approvalRule: this.name,
      execute: async () => {
        try {
          const output = this.execute(args);
          return { isError: false, output };
        } catch (error) {
          return {
            isError: true,
            output: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };
  }

  private execute(args: ToolSearchInput): string {
    const query = (args.query ?? '').toLowerCase();
    const type = args.type ?? 'all';
    const sections: string[] = [];

    if (type === 'all' || type === 'skill') {
      const skills = this.listSkills(query);
      sections.push(skills.length === 0 ? '## Skills\nNo matching skills available.' : `## Skills\n${skills.join('\n')}`);
    }

    if (type === 'all' || type === 'mcp') {
      const mcp = this.listMcp(query);
      sections.push(mcp.length === 0 ? '## MCP tools\nNo connected MCP servers or matching tools.' : `## MCP tools\n${mcp.join('\n')}`);
    }

    if (type === 'all') {
      sections.push(
        '## How to use\n- Invoke a skill with the `Skill` tool.\n- Invoke an MCP tool using its qualified name, e.g. `mcp__server__toolName`.\n- Enable or disable MCP tools by adjusting the active tool list or `mcp.json`.',
      );
    }

    return sections.join('\n\n');
  }

  private listSkills(query: string): string[] {
    const registry = this.agent.skills?.registry;
    if (registry === undefined) return [];

    const skills = registry.listInvocableSkills().filter((skill: SkillDefinition) =>
      query.length === 0 ||
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      (typeof skill.metadata.whenToUse === 'string' && skill.metadata.whenToUse.toLowerCase().includes(query)),
    );

    return skills.map((skill: SkillDefinition) => {
      const when =
        typeof skill.metadata.whenToUse === 'string' && skill.metadata.whenToUse.length > 0
          ? `\n  When to use: ${skill.metadata.whenToUse}`
          : '';
      return `- ${skill.name}: ${skill.description}${when}`;
    });
  }

  private listMcp(query: string): string[] {
    const mcp = this.agent.mcp;
    if (mcp === undefined) return [];

    const lines: string[] = [];
    for (const entry of mcp.list()) {
      if (entry.status !== 'connected') {
        if (query.length === 0 || entry.name.toLowerCase().includes(query)) {
          lines.push(`- Server "${entry.name}" (${entry.status})`);
        }
        continue;
      }

      const resolved = mcp.resolved(entry.name);
      if (resolved === undefined) continue;

      const enabledSet = resolved.enabledNames;
      const tools = resolved.tools.filter((tool: Tool) => {
        const text = `${tool.name} ${tool.description ?? ''}`.toLowerCase();
        return query.length === 0 || text.includes(query);
      });

      if (tools.length === 0) continue;

      lines.push(`- Server "${entry.name}" (${tools.length} tool${tools.length === 1 ? '' : 's'}):`);
      for (const tool of tools) {
        const enabled = enabledSet === undefined || enabledSet.has(tool.name) ? 'enabled' : 'disabled';
        const qualified = `mcp__${entry.name}__${tool.name}`;
        lines.push(`  - ${qualified} [${enabled}]: ${tool.description ?? ''}`);
      }
    }
    return lines;
  }
}

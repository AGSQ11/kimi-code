import { MEMORY_TOOL_NAME } from '#/tools/builtin/memory';

import { DynamicInjector } from './injector';

const MEMORY_INJECTION_VARIANT = 'memory_context';
const MEMORY_AUTO_INJECT_LIMIT = 5;

export class MemoryInjector extends DynamicInjector {
  protected override readonly injectionVariant = MEMORY_INJECTION_VARIANT;

  protected override async getInjection(): Promise<string | undefined> {
    if (!this.isMemoryActive()) {
      return undefined;
    }

    try {
      const projectRoot = this.agent.memoryStore.getProjectRoot();
      const memories = await this.agent.memoryStore.recall({
        query: '.',
        project: projectRoot,
        includeGlobal: true,
        limit: MEMORY_AUTO_INJECT_LIMIT,
      });

      if (memories.length === 0) {
        return undefined;
      }

      return renderMemoryContext(memories);
    } catch {
      // If the memory store is temporarily unavailable, degrade gracefully
      // rather than blocking the turn.
      return undefined;
    }
  }

  private isMemoryActive(): boolean {
    return this.agent.tools.data().some((tool) => tool.name === MEMORY_TOOL_NAME && tool.active);
  }
}

function renderMemoryContext(memories: import('#/memory/types').Memory[]): string {
  const lines = memories.map((memory) => {
    const category = memory.category ?? 'memory';
    return `- [${category}] ${memory.content}`;
  });
  return `Context from past sessions:\n${lines.join('\n')}\n\nUse the Memory tool to recall more details or update these notes.`;
}

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
      const query = this.currentUserQuery();
      const memories = await this.agent.memoryStore.recall({
        query,
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

  private currentUserQuery(): string {
    // Walk backwards through context history to find the most recent user
    // prompt. This makes injected memories relevant to the current task
    // instead of only the most recently updated memories.
    for (let i = this.agent.context.history.length - 1; i >= 0; i--) {
      const message = this.agent.context.history[i];
      if (message?.role !== 'user') continue;
      if (message.origin?.kind !== 'user') continue;
      const text = message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(' ')
        .trim();
      if (text.length > 0) return text;
    }
    return '.';
  }
}

function renderMemoryContext(memories: import('#/memory/types').Memory[]): string {
  const lines = memories.map((memory) => {
    const category = memory.category ?? 'memory';
    return `- [${category}] ${memory.content}`;
  });
  return `Context from past sessions:\n${lines.join('\n')}\n\nUse the Memory tool to recall more details or update these notes.`;
}

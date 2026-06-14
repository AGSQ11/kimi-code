import { describe, expect, it } from 'vitest';

import type { Agent } from '../../../src/agent';
import type { ContextMessage } from '../../../src/agent/context';
import { ThoughtInjector } from '../../../src/agent/injection/thoughts';
import { THINK_STORE_KEY, type Thought } from '../../../src/tools/builtin/think';
import type { ToolStore } from '../../../src/tools/store';

interface ThoughtAgentStub {
  readonly history: ContextMessage[];
  readonly store: ToolStore;
}

function thoughtAgent(stub: ThoughtAgentStub): Agent {
  return {
    type: 'main',
    context: {
      get history() {
        return stub.history;
      },
      appendSystemReminder: (content: string, origin: ContextMessage['origin']) => {
        stub.history.push({
          role: 'user',
          content: [{ type: 'text', text: `<system-reminder>\n${content}\n</system-reminder>` }],
          toolCalls: [],
          origin,
        });
      },
    },
    tools: {
      getToolStore: () => stub.store,
    },
  } as unknown as Agent;
}

function makeStore(initial: readonly Thought[] = []): ToolStore {
  const data = new Map<string, unknown>();
  if (initial.length > 0) {
    data.set(THINK_STORE_KEY, initial as readonly unknown[]);
  }
  return {
    get: (key) => data.get(key) as never,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('ThoughtInjector', () => {
  it('does not inject when there are no thoughts', async () => {
    const history: ContextMessage[] = [];
    const injector = new ThoughtInjector(thoughtAgent({ history, store: makeStore() }));

    await injector.inject();

    expect(history).toHaveLength(0);
  });

  it('injects active thoughts as a system reminder', async () => {
    const history: ContextMessage[] = [];
    const store = makeStore([
      { content: 'Use dependency injection for new modules.', category: 'decision', tags: ['architecture'] },
      { content: 'Keep changes minimal.', category: 'constraint' },
    ]);
    const injector = new ThoughtInjector(thoughtAgent({ history, store }));

    await injector.inject();

    expect(history).toHaveLength(1);
    const text = history[0]?.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    expect(text).toContain('Accumulated reasoning thoughts from this session:');
    expect(text).toContain('1. (decision) [architecture]\nUse dependency injection for new modules.');
    expect(text).toContain('2. (constraint)\nKeep changes minimal.');
    expect(history[0]?.origin).toEqual({ kind: 'injection', variant: 'thoughts' });
  });

  it('re-injects after compaction because the original tool results may have been cleared', async () => {
    const history: ContextMessage[] = [];
    const store = makeStore([{ content: 'Prefer composition over inheritance.', category: 'decision' }]);
    const injector = new ThoughtInjector(thoughtAgent({ history, store }));

    await injector.inject();
    expect(history).toHaveLength(1);

    injector.onContextCompacted(2);
    await injector.inject();

    expect(history).toHaveLength(2);
    const text = history[1]?.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    expect(text).toContain('Prefer composition over inheritance.');
  });

  it('only injects once per step when no compaction occurs', async () => {
    const history: ContextMessage[] = [];
    const store = makeStore([{ content: 'Single thought.' }]);
    const injector = new ThoughtInjector(thoughtAgent({ history, store }));

    await injector.inject();
    await injector.inject();

    expect(history).toHaveLength(1);
  });
});

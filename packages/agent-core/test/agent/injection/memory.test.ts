import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Agent } from '../../../src/agent';
import type { ContextMessage } from '../../../src/agent/context';
import { MemoryInjector } from '../../../src/agent/injection/memory';
import { MemoryStore } from '../../../src/memory/store';
import { testKaos } from '../../fixtures/test-kaos';

interface MemoryAgentStub {
  readonly history: ContextMessage[];
  readonly memoryActive: boolean;
  readonly memoryStore: MemoryStore;
}

function memoryAgent(stub: MemoryAgentStub): Agent {
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
      data: () => [
        {
          name: 'Memory',
          description: 'Memory',
          active: stub.memoryActive,
          source: 'builtin',
        },
      ],
    },
    memoryStore: stub.memoryStore,
  } as unknown as Agent;
}

describe('MemoryInjector', () => {
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kimi-memory-injector-'));
    mkdirSync(join(tempDir, '.git'));
    store = new MemoryStore({
      globalDbPath: join(tempDir, 'global-memory.db'),
      kaos: testKaos.withCwd(tempDir),
      cwd: tempDir,
    });
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not inject when the Memory tool is inactive', async () => {
    const history: ContextMessage[] = [];
    const agent = memoryAgent({ history, memoryActive: false, memoryStore: store });
    const injector = new MemoryInjector(agent);

    await injector.inject();

    expect(history).toHaveLength(0);
  });

  it('does not inject when there are no memories', async () => {
    const history: ContextMessage[] = [];
    const agent = memoryAgent({ history, memoryActive: true, memoryStore: store });
    const injector = new MemoryInjector(agent);

    await injector.inject();

    expect(history).toHaveLength(0);
  });

  it('injects relevant memories as a system reminder', async () => {
    await store.remember({ content: 'Use pnpm', category: 'user-preference' });
    const history: ContextMessage[] = [];
    const agent = memoryAgent({ history, memoryActive: true, memoryStore: store });
    const injector = new MemoryInjector(agent);

    await injector.inject();

    expect(history).toHaveLength(1);
    const text = history[0]?.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    expect(text).toContain('Context from past sessions');
    expect(text).toContain('[user-preference] Use pnpm');
    expect(history[0]?.origin).toEqual({ kind: 'injection', variant: 'memory_context' });
  });
});

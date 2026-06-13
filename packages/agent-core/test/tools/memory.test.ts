import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '#/memory/store';
import { MemoryTool } from '#/tools/builtin/memory';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

describe('MemoryTool', () => {
  let tempDir: string;
  let store: MemoryStore;
  let tool: MemoryTool;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kimi-memory-tool-'));
    mkdirSync(join(tempDir, '.git'));
    store = new MemoryStore({
      globalDbPath: join(tempDir, 'global-memory.db'),
      kaos: testKaos.withCwd(tempDir),
      cwd: tempDir,
    });
    tool = new MemoryTool(store, () => tempDir);
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function context(input: import('#/tools/builtin/memory').MemoryToolInput) {
    return { turnId: '0', toolCallId: 'call_1', args: input, signal };
  }

  it('remembers and recalls a memory', async () => {
    const rememberResult = await executeTool(
      tool,
      context({
        operation: 'remember',
        content: 'Use vitest for tests',
        category: 'project-fact',
      }),
    );
    expect(rememberResult.isError).toBe(false);
    expect(rememberResult.output).toMatch(/Remembered/);

    const recallResult = await executeTool(
      tool,
      context({
        operation: 'recall',
        query: 'test framework',
        category: 'project-fact',
      }),
    );
    expect(recallResult.isError).toBe(false);
    expect(recallResult.output).toContain('Use vitest for tests');
  });

  it('updates a memory by query', async () => {
    await executeTool(tool, context({ operation: 'remember', content: 'Old value' }));

    const updateResult = await executeTool(
      tool,
      context({ operation: 'update', query: 'Old value', content: 'New value' }),
    );
    expect(updateResult.isError).toBe(false);
    expect(updateResult.output).toMatch(/Updated memory/);

    const recallResult = await executeTool(
      tool,
      context({ operation: 'recall', query: 'New value' }),
    );
    expect(recallResult.output).toContain('New value');
  });

  it('forgets a memory by query', async () => {
    await executeTool(tool, context({ operation: 'remember', content: 'Remove me' }));

    const forgetResult = await executeTool(
      tool,
      context({ operation: 'forget', query: 'Remove me' }),
    );
    expect(forgetResult.isError).toBe(false);
    expect(forgetResult.output).toBe('Forgot 1 memory.');

    const recallResult = await executeTool(
      tool,
      context({ operation: 'recall', query: 'Remove me' }),
    );
    expect(recallResult.output).toBe('No relevant memories found.');
  });

  it('rejects remember without content', async () => {
    const result = await executeTool(tool, context({ operation: 'remember' }));
    expect(result.isError).toBe(true);
    expect(result.output).toContain('remember requires');
  });
});

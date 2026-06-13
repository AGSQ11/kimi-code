import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { THINK_STORE_KEY, type Thought } from '../../../src/tools/builtin/think';
import { testKaos } from '../../fixtures/test-kaos';
import { testAgent } from '../harness/agent';

describe('TurnFlow decision-thought promotion', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kimi-decision-thoughts-'));
    mkdirSync(join(tempDir, 'agents', 'main'), { recursive: true });
    mkdirSync(join(tempDir, '.git'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('promotes decision-category Think thoughts to long-term Memory', async () => {
    const ctx = testAgent({ homedir: tempDir, kimiHomeDir: tempDir, kaos: testKaos.withCwd(tempDir) });
    ctx.configure();
    ctx.agent.permission.setMode('yolo');

    ctx.agent.tools.getToolStore().set(THINK_STORE_KEY, [
      { content: 'Use dependency injection for new modules.', category: 'decision', tags: ['architecture'] },
      { content: 'Keep changes minimal.', category: 'constraint' },
    ] as readonly unknown[]);

    await (ctx.agent.turn as unknown as { promoteDecisionThoughts(): Promise<void> }).promoteDecisionThoughts();

    const memories = await ctx.agent.memoryStore.list();
    const decision = memories.find((m) => m.category === 'decision');
    expect(decision).toBeDefined();
    expect(decision?.content).toBe('Use dependency injection for new modules.');
    expect(decision?.tags).toContain('architecture');
    expect(decision?.source).toBe('auto-extract');

    const stored = ctx.agent.tools.getToolStore().get(THINK_STORE_KEY) as Thought[] | undefined;
    const promoted = stored?.find((t) => t.category === 'decision');
    expect(promoted?.promotedToMemory).toBe(true);

    // Non-decision thoughts should remain unpromoted and untouched.
    const constraint = stored?.find((t) => t.category === 'constraint');
    expect(constraint?.promotedToMemory).toBeUndefined();
  });

  it('does not duplicate already-promoted decision thoughts', async () => {
    const ctx = testAgent({ homedir: tempDir, kimiHomeDir: tempDir, kaos: testKaos.withCwd(tempDir) });
    ctx.configure();
    ctx.agent.permission.setMode('yolo');

    ctx.agent.tools.getToolStore().set(THINK_STORE_KEY, [
      { content: 'Use pnpm.', category: 'decision', promotedToMemory: true },
    ] as readonly unknown[]);

    await (ctx.agent.turn as unknown as { promoteDecisionThoughts(): Promise<void> }).promoteDecisionThoughts();

    const memories = await ctx.agent.memoryStore.list();
    expect(memories).toHaveLength(0);
  });
});

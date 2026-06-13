import { describe, expect, it, vi } from 'vitest';

import { runEvalSuite } from '#/cli/eval/runner';
import type { EvalSpec } from '#/cli/eval/types';

describe('runEvalSuite', () => {
  it('runs the matrix and captures assistant text', async () => {
    const session = createMockSession({
      events: [
        { type: 'turn.started', turnId: 1 },
        { type: 'assistant.delta', turnId: 1, delta: 'hello ' },
        { type: 'assistant.delta', turnId: 1, delta: 'world' },
        { type: 'turn.ended', turnId: 1, reason: 'completed' },
      ],
    });
    const harness = createMockHarness(session);

    const spec: EvalSpec = {
      version: '1.0',
      name: 'Simple',
      telemetry: false,
      timeout: 60,
      samples: 1,
      executeTools: false,
      prompts: [{ id: 'p1', text: 'say hi' }],
      models: ['m1'],
      variations: [{ id: 'v1' }],
    };

    const result = await runEvalSuite(
      {
        harness,
        now: () => 0,
        setTimeout: (cb, ms) => {
          setTimeout(cb, ms);
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: () => {},
      },
      spec,
    );

    expect(result.summary.totalRuns).toBe(1);
    expect(result.summary.completed).toBe(1);
    expect(result.runs[0]?.assistantText).toBe('hello world');
    expect(result.runs[0]?.status).toBe('completed');
    expect(session.setModel).toHaveBeenCalledWith('m1');
  });

  it('applies generation kwargs and system prompt variations', async () => {
    const session = createMockSession({
      events: [
        { type: 'turn.started', turnId: 1 },
        { type: 'assistant.delta', turnId: 1, delta: 'ok' },
        { type: 'turn.ended', turnId: 1, reason: 'completed' },
      ],
    });
    const harness = createMockHarness(session);

    const spec: EvalSpec = {
      version: '1.0',
      name: 'Variations',
      telemetry: false,
      timeout: 60,
      samples: 1,
      executeTools: false,
      prompts: [{ id: 'p1', text: 'go' }],
      models: ['m1'],
      variations: [
        {
          id: 'v1',
          generationKwargs: { temperature: 0.5 },
          systemPrompt: 'You are a robot.',
        },
      ],
    };

    await runEvalSuite(
      {
        harness,
        now: () => 0,
        setTimeout,
        clearTimeout,
      },
      spec,
    );

    expect(session.setGenerationKwargs).toHaveBeenCalledWith({ temperature: 0.5 });
    expect(session.setSystemPrompt).toHaveBeenCalledWith('You are a robot.');
  });

  it('estimates cost when rates are provided', async () => {
    const session = createMockSession({
      events: [
        { type: 'turn.started', turnId: 1 },
        { type: 'assistant.delta', turnId: 1, delta: 'ok' },
        {
          type: 'agent.status.updated',
          usage: {
            total: { inputOther: 1000, output: 500, inputCacheRead: 0 },
          },
        },
        { type: 'turn.ended', turnId: 1, reason: 'completed' },
      ],
    });
    const harness = createMockHarness(session);

    const spec: EvalSpec = {
      version: '1.0',
      name: 'Cost',
      telemetry: false,
      timeout: 60,
      samples: 1,
      executeTools: false,
      prompts: [{ id: 'p1', text: 'go' }],
      models: ['m1'],
      variations: [{ id: 'v1' }],
      cost: {
        m1: { inputPer1k: 0.002, outputPer1k: 0.008 },
      },
    };

    const result = await runEvalSuite(
      {
        harness,
        now: () => 0,
        setTimeout,
        clearTimeout,
      },
      spec,
    );

    expect(result.runs[0]?.estimatedCostUsd).toBeCloseTo(1000 / 1000 * 0.002 + 500 / 1000 * 0.008, 6);
  });

  it('times out a slow run', async () => {
    const session = createMockSession({ events: [] });
    const harness = createMockHarness(session);

    const spec: EvalSpec = {
      version: '1.0',
      name: 'Timeout',
      telemetry: false,
      timeout: 0,
      samples: 1,
      executeTools: false,
      prompts: [{ id: 'p1', text: 'go' }],
      models: ['m1'],
      variations: [{ id: 'v1' }],
    };

    let now = 0;
    const result = await runEvalSuite(
      {
        harness,
        now: () => now,
        setTimeout: (cb, ms) => {
          now += ms;
          cb();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: () => {},
      },
      spec,
    );

    expect(result.runs[0]?.status).toBe('timeout');
  });
});

function createMockSession(options: { events: any[] }) {
  const handlers = new Set<(event: any) => void>();
  return {
    id: 'ses-mock',
    setModel: vi.fn().mockResolvedValue(undefined),
    setGenerationKwargs: vi.fn().mockResolvedValue(undefined),
    setSystemPrompt: vi.fn().mockResolvedValue(undefined),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    onEvent: vi.fn((handler: (event: any) => void) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }),
    prompt: vi.fn(async () => {
      for (const event of options.events) {
        for (const handler of handlers) {
          handler({ agentId: 'main', ...event });
        }
      }
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockHarness(session: ReturnType<typeof createMockSession>) {
  return {
    createSession: vi.fn().mockResolvedValue(session),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as import('@moonshot-ai/kimi-code-sdk').KimiHarness;
}

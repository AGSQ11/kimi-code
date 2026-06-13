import { describe, expect, it } from 'vitest';

import { reportToJson, reportToMarkdown } from '#/cli/eval/reporter';
import type { EvalRunResult, EvalSpec, EvalSuiteResult } from '#/cli/eval/types';

function fakeSpec(): EvalSpec {
  return {
    version: '1.0',
    name: 'Test eval',
    description: 'A test suite',
    telemetry: false,
    timeout: 60,
    samples: 1,
    executeTools: false,
    prompts: [{ id: 'p1', text: 'hello' }],
    models: ['m1'],
    variations: [{ id: 'v1' }],
  };
}

function fakeRun(overrides?: Partial<EvalRunResult>): EvalRunResult {
  return {
    runId: 'r0',
    promptId: 'p1',
    model: 'm1',
    variationId: 'v1',
    sampleIndex: 0,
    sessionId: 'ses-1',
    status: 'completed',
    assistantText: 'world',
    thinkingText: '',
    toolCalls: [],
    timing: {
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      timeToFirstTokenMs: 200,
    },
    usage: {
      inputTokens: 10,
      outputTokens: 5,
    },
    estimatedCostUsd: 0.0001,
    ...overrides,
  };
}

function fakeResult(runs: EvalRunResult[]): EvalSuiteResult {
  return {
    summary: {
      totalRuns: runs.length,
      completed: runs.filter((r) => r.status === 'completed').length,
      failed: runs.filter((r) => r.status === 'error').length,
      timedOut: runs.filter((r) => r.status === 'timeout').length,
      totalDurationMs: 1000,
      totalEstimatedCostUsd: runs.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0),
      avgTimeToFirstTokenMs: 200,
    },
    spec: fakeSpec(),
    runs,
  };
}

describe('reportToJson', () => {
  it('includes summary and runs', () => {
    const result = fakeResult([fakeRun()]);
    const json = JSON.parse(reportToJson(result)) as EvalSuiteResult;

    expect(json.summary.totalRuns).toBe(1);
    expect(json.runs[0]?.assistantText).toBe('world');
  });
});

describe('reportToMarkdown', () => {
  it('includes summary table and run details', () => {
    const result = fakeResult([fakeRun(), fakeRun({ runId: 'r1', status: 'error', error: 'boom' })]);
    const md = reportToMarkdown(result);

    expect(md).toContain('# Test eval');
    expect(md).toContain('A test suite');
    expect(md).toContain('| Total runs | 2 |');
    expect(md).toContain('| Completed | 1 |');
    expect(md).toContain('| Failed | 1 |');
    expect(md).toContain('r0');
    expect(md).toContain('r1');
    expect(md).toContain('boom');
  });
});

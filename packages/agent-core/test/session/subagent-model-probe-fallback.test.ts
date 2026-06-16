import { describe, expect, it } from 'vitest';

import type { Agent } from '../../src/agent';
import { SessionSubagentHost } from '../../src/session/subagent-host';
import type { ModelProbeResult } from '../../src/session/model-probe';
import type { Session } from '../../src/session';

function makeProbeResult(status: ModelProbeResult['status'], alias: string): ModelProbeResult {
  return {
    alias,
    status,
    providerName: 'openai',
    model: 'gpt-4o-mini',
    probedAt: Date.now(),
  };
}

function makeHost(options: {
  parentModel?: string;
  subagentModels?: Record<string, string>;
  probeStatus?: Record<string, ModelProbeResult>;
}) {
  const session = {
    options: {
      config: {
        subagentModels: options.subagentModels,
      },
    },
    modelProbeStatus: options.probeStatus ?? {},
  } as unknown as Session;
  const host = new SessionSubagentHost(session, 'main');
  const parent = {
    config: {
      modelAlias: options.parentModel ?? 'parent-model',
    },
  } as unknown as Agent;
  return { host, parent };
}

describe('SessionSubagentHost model-probe fallback', () => {
  it('uses the desired model when no probe status is available', () => {
    const { host, parent } = makeHost({ parentModel: 'parent-model' });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('parent-model');
  });

  it('uses a configured per-profile model when it is healthy', () => {
    const { host, parent } = makeHost({
      subagentModels: { coder: 'deepseek' },
      probeStatus: {
        deepseek: makeProbeResult('ok', 'deepseek'),
      },
    });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('deepseek');
  });

  it('falls back to another healthy model when the desired model is unhealthy', () => {
    const { host, parent } = makeHost({
      parentModel: 'broken-model',
      probeStatus: {
        'broken-model': makeProbeResult('auth_error', 'broken-model'),
        'healthy-model': makeProbeResult('ok', 'healthy-model'),
      },
    });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('healthy-model');
  });

  it('falls back when a per-profile override is unhealthy', () => {
    const { host, parent } = makeHost({
      parentModel: 'parent-model',
      subagentModels: { coder: 'broken-model' },
      probeStatus: {
        'broken-model': makeProbeResult('rate_limit', 'broken-model'),
        'parent-model': makeProbeResult('ok', 'parent-model'),
      },
    });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('parent-model');
  });

  it('keeps the desired model when its probe status is unknown', () => {
    const { host, parent } = makeHost({
      parentModel: 'parent-model',
      probeStatus: {
        'parent-model': makeProbeResult('unknown', 'parent-model'),
        'other-model': makeProbeResult('ok', 'other-model'),
      },
    });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('parent-model');
  });

  it('keeps the desired model when no fallback is healthy', () => {
    const { host, parent } = makeHost({
      parentModel: 'broken-model',
      probeStatus: {
        'broken-model': makeProbeResult('auth_error', 'broken-model'),
        'also-broken': makeProbeResult('connection_error', 'also-broken'),
      },
    });
    expect((host as any).resolveSubagentModel(parent, 'coder')).toBe('broken-model');
  });

  it('ignores an explicit model override even if it looks unhealthy', () => {
    const { host, parent } = makeHost({
      probeStatus: {
        'override-model': makeProbeResult('auth_error', 'override-model'),
      },
    });
    // Explicit overrides are respected regardless of probe status so the
    // caller (e.g. /compare) can force a specific model.
    expect((host as any).resolveSubagentModel(parent, 'coder', 'override-model')).toBe('override-model');
  });
});

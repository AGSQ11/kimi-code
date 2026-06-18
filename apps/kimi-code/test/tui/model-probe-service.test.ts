import { describe, expect, it, vi } from 'vitest';

import type { ModelAlias, ModelProbeResult, Session } from '@moonshot-ai/kimi-code-sdk';

import { ModelProbeService, type ModelProbeHost } from '#/tui/services/model-probe';
import type { AppState } from '#/tui/types';

function makeResult(alias: string, status: ModelProbeResult['status'] = 'ok'): ModelProbeResult {
  return { alias, status, providerName: 'managed:kimi-code', model: 'kimi-k2', probedAt: Date.now() };
}

function makeAppState(models: Record<string, ModelAlias>): AppState {
  return {
    sessionId: 'ses-1',
    model: 'k2',
    workDir: '/tmp',
    permissionMode: 'manual',
    planMode: false,
    thinking: false,
    streamingPhase: 'idle',
    isReplaying: false,
    availableModels: models,
    availableProviders: {},
    generationKwargs: null,
    sessionTitle: null,
    goal: null,
    mcpServersSummary: null,
    modelProbeStatus: {},
  } as unknown as AppState;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    probeAllModels: vi.fn(async () => ({ k2: makeResult('k2') })),
    probeModel: vi.fn(async () => makeResult('k2')),
    setModelProbeStatus: vi.fn(async () => {}),
    ...overrides,
  } as unknown as Session;
}

const MODELS = { k2: { provider: 'managed:kimi-code', model: 'kimi-k2', maxContextSize: 100 } };

interface HostAccessors {
  readonly host: ModelProbeHost;
  readonly setAppState: ReturnType<typeof vi.fn>;
  readonly appState: AppState;
}

function makeHostWith(session: Session | undefined, models: Record<string, ModelAlias>): HostAccessors {
  const appState = makeAppState(models);
  const setAppState = vi.fn((patch: Partial<AppState>) => {
    Object.assign(appState, patch);
  });
  const host: ModelProbeHost = {
    get session(): Session | undefined {
      return session;
    },
    set session(value: Session | undefined) {
      session = value;
    },
    state: { appState },
    setAppState,
    showStatus: vi.fn(),
    showError: vi.fn(),
    showProbeReport: vi.fn(),
    track: vi.fn(),
  };
  return { host, setAppState, appState };
}

describe('ModelProbeService', () => {
  it('persists probe status without throwing when the session closes mid-probe', async () => {
    const { host, setAppState } = makeHostWith(undefined, MODELS);
    const setModelProbeStatus = vi.fn(async (): Promise<void> => {
      throw new Error('Session is closed');
    });
    const session = makeSession({
      probeAllModels: vi.fn(async () => {
        host.session = undefined;
        return { k2: makeResult('k2') };
      }),
      setModelProbeStatus,
    });
    host.session = session;

    const service = new ModelProbeService(host);

    // Must not reject and must not crash the process with an unhandled rejection.
    await expect(service.probeAll()).resolves.toBeUndefined();

    expect(setAppState).toHaveBeenCalled();
  });

  it('skips persistence when the active session changes during the probe', async () => {
    const { host } = makeHostWith(undefined, MODELS);
    const setModelProbeStatus = vi.fn(async (): Promise<void> => {});
    const original = makeSession({
      probeAllModels: vi.fn(async () => {
        host.session = makeSession();
        return { k2: makeResult('k2') };
      }),
      setModelProbeStatus,
    });
    host.session = original;

    const service = new ModelProbeService(host);
    await service.probeAll();

    // markPending (before the probe) runs against the still-active original session,
    // so it calls setModelProbeStatus exactly once with the pending placeholders.
    // The post-probe persistence must be skipped because the session changed.
    expect(setModelProbeStatus).toHaveBeenCalledTimes(1);
    expect(setModelProbeStatus).toHaveBeenNthCalledWith(1, {
      k2: expect.objectContaining({ alias: 'k2', status: 'unknown' }),
    });
  });

  it('swallows rejection from setModelProbeStatus during markPending', async () => {
    const session = makeSession({
      setModelProbeStatus: vi.fn(async (): Promise<void> => {
        throw new Error('Session is closed');
      }),
    });

    const { host } = makeHostWith(session, MODELS);

    const service = new ModelProbeService(host);
    // markPending runs synchronously inside probeAll and must not throw.
    await expect(service.probeAll()).resolves.toBeUndefined();
  });
});

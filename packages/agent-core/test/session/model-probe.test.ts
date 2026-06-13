import { describe, expect, it, vi } from 'vitest';

import {
  APIConnectionError,
  APIEmptyResponseError,
  APIStatusError,
  APITimeoutError,
  createAssistantMessage,
  createUserMessage,
} from '@moonshot-ai/kosong';

import { KimiError } from '../../src/errors';
import { ErrorCodes } from '../../src/errors/codes';
import { ProviderManager } from '../../src/session/provider-manager';
import { ModelProbeService, type GenerateFn } from '../../src/session/model-probe';

function fakeConfig() {
  return {
    providers: {
      openai: { type: 'openai' as const, apiKey: 'sk-fake' },
      kimi: { type: 'kimi' as const, apiKey: 'sk-fake' },
      broken: { type: 'openai' as const, apiKey: 'sk-fake' },
    },
    models: {
      gpt: { provider: 'openai', model: 'gpt-4o-mini', maxContextSize: 128_000 },
      kimi: { provider: 'kimi', model: 'moonshot-v1-auto', maxContextSize: 128_000 },
      'gpt-copy': { provider: 'openai', model: 'gpt-4o-mini', maxContextSize: 128_000 },
      missing: { provider: 'unknown', model: 'x', maxContextSize: 128_000 },
    },
  };
}

function makeService(generateFn: GenerateFn) {
  const providerManager = new ProviderManager({ config: fakeConfig() });
  return new ModelProbeService({ providerManager, generateFn, timeoutMs: 1000, concurrency: 2 });
}

describe('ModelProbeService', () => {
  it('reports ok for a successful generate call', async () => {
    const generateFn: GenerateFn = async () => ({
      message: createAssistantMessage([{ type: 'text', text: 'hi' }]),
      usage: null,
      finishReason: 'completed' as const,
      rawFinishReason: 'stop',
      id: null,
    });

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('ok');
    expect(result.alias).toBe('gpt');
    expect(result.providerName).toBe('openai');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('treats APIEmptyResponseError as reachable', async () => {
    const generateFn: GenerateFn = async () => {
      throw new APIEmptyResponseError('empty', { finishReason: 'completed', rawFinishReason: 'stop' });
    };

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('ok');
  });

  it('reports auth_error for 401 APIStatusError', async () => {
    const generateFn: GenerateFn = async () => {
      throw new APIStatusError(401, 'Unauthorized', 'req-1');
    };

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('auth_error');
    expect(result.statusCode).toBe(401);
  });

  it('reports rate_limit for 429 APIStatusError', async () => {
    const generateFn: GenerateFn = async () => {
      throw new APIStatusError(429, 'Too Many Requests', 'req-2');
    };

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('rate_limit');
  });

  it('reports connection_error for APIConnectionError', async () => {
    const generateFn: GenerateFn = async () => {
      throw new APIConnectionError('Network unreachable');
    };

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('connection_error');
  });

  it('reports timeout for APITimeoutError', async () => {
    const generateFn: GenerateFn = async () => {
      throw new APITimeoutError('Request timed out');
    };

    const service = makeService(generateFn);
    const result = await service.probeModel('gpt');

    expect(result.status).toBe('timeout');
  });

  it('reports config_error for a missing provider alias', async () => {
    const generateFn: GenerateFn = vi.fn();

    const service = makeService(generateFn);
    const result = await service.probeModel('missing');

    expect(result.status).toBe('config_error');
    expect(generateFn).not.toHaveBeenCalled();
  });

  it('reports config_error for a model not in config', async () => {
    const generateFn: GenerateFn = vi.fn();

    const service = makeService(generateFn);
    const result = await service.probeModel('not-in-config');

    expect(result.status).toBe('config_error');
    expect(generateFn).not.toHaveBeenCalled();
  });

  it('dedupes aliases that point to the same provider+model', async () => {
    const generateFn: GenerateFn = vi.fn(async () => ({
      message: createAssistantMessage([{ type: 'text', text: 'ok' }]),
      usage: null,
      finishReason: 'completed' as const,
      rawFinishReason: 'stop',
      id: null,
    }));

    const service = makeService(generateFn);
    const results = await service.probeAll(['gpt', 'gpt-copy', 'kimi']);

    expect(generateFn).toHaveBeenCalledTimes(2);
    expect(results['gpt']!.status).toBe('ok');
    expect(results['gpt-copy']!.status).toBe('ok');
    expect(results['kimi']!.status).toBe('ok');
  });

  it('respects abort signal', async () => {
    const generateFn: GenerateFn = async (_provider, _system, _tools, _history, _callbacks, options) => {
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise((_, reject) => {
        const listener = (): void => reject(new DOMException('Aborted', 'AbortError'));
        options?.signal?.addEventListener('abort', listener, { once: true });
      });
      return {
        message: createAssistantMessage([{ type: 'text', text: 'ok' }]),
        usage: null,
        finishReason: 'completed' as const,
        rawFinishReason: 'stop',
        id: null,
      };
    };

    const service = makeService(generateFn);
    const controller = new AbortController();
    const promise = service.probeModel('gpt', controller.signal);
    controller.abort();

    const result = await promise;
    expect(result.status).toBe('timeout');
  });

  it('passes OAuth auth through resolveAuth', async () => {
    const generateFn: GenerateFn = vi.fn(async () => ({
      message: createAssistantMessage([{ type: 'text', text: 'ok' }]),
      usage: null,
      finishReason: 'completed' as const,
      rawFinishReason: 'stop',
      id: null,
    }));

    const oauthToken = vi.fn().mockResolvedValue('oauth-token');
    const providerManager = new ProviderManager({
      config: {
        providers: {
          managed: {
            type: 'openai' as const,
            apiKey: '',
            oauth: { storage: 'file', key: 'managed', oauthHost: 'https://example.com' },
          },
        },
        models: {
          managed: { provider: 'managed', model: 'gpt-4o-mini', maxContextSize: 128_000 },
        },
      },
      resolveOAuthTokenProvider: () => ({ getAccessToken: oauthToken }),
    });

    const service = new ModelProbeService({
      providerManager,
      generateFn,
      timeoutMs: 1000,
      concurrency: 1,
    });

    const result = await service.probeModel('managed');

    expect(result.status).toBe('ok');
    expect(oauthToken).toHaveBeenCalled();
    expect(generateFn).toHaveBeenCalled();
    const mockFn = generateFn as unknown as { mock: { calls: { 5?: { auth?: { apiKey?: string } } }[] } };
    const passedAuth = mockFn.mock.calls[0]?.[5]?.auth;
    expect(passedAuth?.apiKey).toBe('oauth-token');
  });

  it('reports auth_error when OAuth login is required', async () => {
    const generateFn: GenerateFn = vi.fn();

    const providerManager = new ProviderManager({
      config: {
        providers: {
          managed: {
            type: 'openai' as const,
            apiKey: '',
            oauth: { storage: 'file', key: 'managed', oauthHost: 'https://example.com' },
          },
        },
        models: {
          managed: { provider: 'managed', model: 'gpt-4o-mini', maxContextSize: 128_000 },
        },
      },
      resolveOAuthTokenProvider: () => ({
        getAccessToken: async () => {
          throw new KimiError(ErrorCodes.AUTH_LOGIN_REQUIRED, 'Login required');
        },
      }),
    });

    const service = new ModelProbeService({
      providerManager,
      generateFn,
      timeoutMs: 1000,
      concurrency: 1,
    });

    const result = await service.probeModel('managed');

    expect(result.status).toBe('auth_error');
    expect(generateFn).not.toHaveBeenCalled();
  });
});

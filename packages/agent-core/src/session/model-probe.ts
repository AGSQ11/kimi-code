import {
  APIConnectionError,
  APIEmptyResponseError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
  createProvider,
  createUserMessage,
  generate as kosongGenerate,
  type ChatProvider,
  type GenerateCallbacks,
  type GenerateResult,
  type Message,
  type ProviderConfig as KosongProviderConfig,
  type Tool,
} from '@moonshot-ai/kosong';

import { ErrorCodes, isKimiError } from '../errors';
import type { ProviderManager } from './provider-manager';

export type ModelProbeStatus =
  | 'ok'
  | 'auth_error'
  | 'rate_limit'
  | 'timeout'
  | 'connection_error'
  | 'api_error'
  | 'config_error'
  | 'unknown';

export interface ModelProbeResult {
  readonly alias: string;
  readonly status: ModelProbeStatus;
  readonly providerName: string;
  readonly model: string;
  readonly error?: string;
  readonly statusCode?: number;
  readonly probedAt: number;
}

export type GenerateFn = (
  provider: ChatProvider,
  systemPrompt: string,
  tools: Tool[],
  history: Message[],
  callbacks?: GenerateCallbacks,
  options?: { signal?: AbortSignal; auth?: { apiKey?: string; headers?: Record<string, string> } },
) => Promise<GenerateResult>;

export interface ModelProbeServiceOptions {
  readonly providerManager: ProviderManager;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly generateFn?: GenerateFn;
}

interface ProbeGroup {
  readonly key: string;
  readonly providerName: string;
  readonly model: string;
  readonly aliases: string[];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 3;

export class ModelProbeService {
  private readonly providerManager: ProviderManager;
  private readonly timeoutMs: number;
  private readonly concurrency: number;
  private readonly generateFn: GenerateFn;

  constructor(options: ModelProbeServiceOptions) {
    this.providerManager = options.providerManager;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.generateFn = options.generateFn ?? kosongGenerate;
  }

  async probeModel(alias: string, signal?: AbortSignal): Promise<ModelProbeResult> {
    const result = await this.runProbe(alias, signal);
    return { ...result, alias };
  }

  async probeAll(aliases: readonly string[], signal?: AbortSignal): Promise<Record<string, ModelProbeResult>> {
    const groups = this.buildGroups(aliases);
    const groupResults = await mapWithConcurrency(groups, this.concurrency, async (group) => {
      const result = await this.runProbeForGroup(group, signal);
      return { group, result };
    });

    const results: Record<string, ModelProbeResult> = {};
    for (const { group, result } of groupResults) {
      for (const alias of group.aliases) {
        results[alias] = { ...result, alias };
      }
    }
    return results;
  }

  private buildGroups(aliases: readonly string[]): readonly ProbeGroup[] {
    const groupsByKey = new Map<string, ProbeGroup>();
    for (const alias of aliases) {
      let providerName: string;
      let model: string;
      try {
        const resolved = this.providerManager.resolveProviderConfig(alias);
        providerName = resolved.providerName;
        model = resolved.provider.model;
      } catch {
        // Config errors are still reported per alias; use a unique key so each
        // broken alias gets its own probe (and its own error message).
        const key = `__error__:${alias}`;
        groupsByKey.set(key, {
          key,
          providerName: '',
          model: '',
          aliases: [alias],
        });
        continue;
      }

      const key = `${providerName}::${model}`;
      const existing = groupsByKey.get(key);
      if (existing === undefined) {
        groupsByKey.set(key, {
          key,
          providerName,
          model,
          aliases: [alias],
        });
      } else {
        existing.aliases.push(alias);
      }
    }
    return [...groupsByKey.values()];
  }

  private async runProbeForGroup(group: ProbeGroup, signal?: AbortSignal): Promise<Omit<ModelProbeResult, 'alias'>> {
    // For aliases that failed config resolution, probe the first alias directly
    // so the config error surfaces on every alias in the group.
    const alias = group.aliases[0] ?? '';
    return this.runProbe(alias, signal, {
      providerName: group.providerName,
      model: group.model,
    });
  }

  private async runProbe(
    alias: string,
    signal?: AbortSignal,
    overrides?: { providerName?: string; model?: string },
  ): Promise<Omit<ModelProbeResult, 'alias'>> {
    const start = Date.now();
    let resolved: ReturnType<ProviderManager['resolveProviderConfig']>;
    try {
      resolved = this.providerManager.resolveProviderConfig(alias);
    } catch (error) {
      return this.resultFromError(error, overrides?.providerName ?? '', overrides?.model ?? '', start);
    }

    const providerName = overrides?.providerName ?? resolved.providerName;
    const model = overrides?.model ?? resolved.provider.model;

    const probeProvider = this.buildProbeProvider(resolved.provider);
    const authRequest = this.providerManager.resolveAuth(alias);

    try {
      const runGenerate = async (auth?: { apiKey?: string; headers?: Record<string, string> }): Promise<void> => {
        const perCallSignal = signal ?? this.createTimeoutSignal();
        await this.generateFn(probeProvider, '', [], [createUserMessage('hi')], undefined, {
          signal: perCallSignal,
          auth,
        });
      };

      if (authRequest !== undefined) {
        await authRequest(async (auth) => runGenerate(auth));
      } else {
        await runGenerate();
      }

      return {
        status: 'ok',
        providerName,
        model,
        probedAt: Date.now(),
      };
    } catch (error) {
      return this.resultFromError(error, providerName, model, start);
    }
  }

  private buildProbeProvider(providerConfig: KosongProviderConfig): ChatProvider {
    // Clone the config so we can mutate generationKwargs without affecting the
    // resolved provider used by the turn loop.
    const clone: KosongProviderConfig = { ...providerConfig };

    if (clone.type === 'kimi' && clone.generationKwargs !== undefined) {
      clone.generationKwargs = { ...clone.generationKwargs };
      // Do not pollute the session's prompt cache with a throwaway probe.
      delete clone.generationKwargs.prompt_cache_key;
    }

    const provider = createProvider(clone);
    return provider.withMaxCompletionTokens?.(1) ?? provider;
  }

  private createTimeoutSignal(): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    const signal = controller.signal;
    // Best-effort cleanup once the signal has fired; callers may also race it.
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
      },
      { once: true },
    );
    return signal;
  }

  private resultFromError(
    error: unknown,
    providerName: string,
    model: string,
    start: number,
  ): Omit<ModelProbeResult, 'alias'> {
    const probedAt = Date.now();
    const durationMs = probedAt - start;

    if (error instanceof APIEmptyResponseError) {
      // The API responded but produced no visible content (e.g. a 1-token cap
      // on a reasoning-only model). That still proves reachability.
      return { status: 'ok', providerName, model, probedAt };
    }

    if (error instanceof APIStatusError) {
      const statusCode = error.statusCode;
      if (statusCode === 401 || statusCode === 403) {
        return {
          status: 'auth_error',
          providerName,
          model,
          error: error.message,
          statusCode,
          probedAt,
        };
      }
      if (statusCode === 429) {
        return {
          status: 'rate_limit',
          providerName,
          model,
          error: error.message,
          statusCode,
          probedAt,
        };
      }
      return {
        status: 'api_error',
        providerName,
        model,
        error: error.message,
        statusCode,
        probedAt,
      };
    }

    if (error instanceof APITimeoutError) {
      return {
        status: 'timeout',
        providerName,
        model,
        error: `Probe timed out after ${this.timeoutMs}ms`,
        probedAt,
      };
    }

    if (error instanceof APIConnectionError) {
      return {
        status: 'connection_error',
        providerName,
        model,
        error: error.message,
        probedAt,
      };
    }

    if (isKimiError(error)) {
      if (error.code === ErrorCodes.AUTH_LOGIN_REQUIRED) {
        return {
          status: 'auth_error',
          providerName,
          model,
          error: error.message,
          probedAt,
        };
      }
      if (
        error.code === ErrorCodes.CONFIG_INVALID ||
        error.code === ErrorCodes.MODEL_NOT_CONFIGURED ||
        error.code === ErrorCodes.MODEL_CONFIG_INVALID
      ) {
        return {
          status: 'config_error',
          providerName,
          model,
          error: error.message,
          probedAt,
        };
      }
      return {
        status: 'api_error',
        providerName,
        model,
        error: error.message,
        probedAt,
      };
    }

    if (error instanceof ChatProviderError) {
      return {
        status: 'api_error',
        providerName,
        model,
        error: error.message,
        probedAt,
      };
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        status: 'timeout',
        providerName,
        model,
        error: `Probe aborted after ${durationMs}ms`,
        probedAt,
      };
    }

    return {
      status: 'unknown',
      providerName,
      model,
      error: error instanceof Error ? error.message : String(error),
      probedAt,
    };
  }
}

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  if (items.length === 0) return [];
  const results: U[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]!);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

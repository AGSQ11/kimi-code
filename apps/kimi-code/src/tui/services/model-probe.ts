import type { ModelProbeResult, Session } from '@moonshot-ai/kimi-code-sdk';

import type { AppState } from '../types';
import type { ColorToken } from '../theme';

const PROBE_ERROR_CODES: ReadonlySet<string> = new Set([
  'provider.api_error',
  'provider.rate_limit',
  'provider.auth_error',
  'provider.connection_error',
  'model.not_configured',
  'model.config_invalid',
  'config.invalid',
  'auth.login_required',
]);

export interface ModelProbeHost {
  session: Session | undefined;
  setAppState(patch: Partial<AppState>): void;
  showStatus(message: string, color?: ColorToken): void;
  showError(message: string): void;
  track(event: string, properties?: Record<string, unknown>): void;
}

export interface ProbeOptions {
  readonly alias?: string;
  readonly background?: boolean;
}

const REBOUNCE_MS = 2_000;

export class ModelProbeService {
  private abortController: AbortController | undefined;
  private reprobeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: ModelProbeHost) {}

  cancel(): void {
    this.clearReprobeTimer();
    this.abortCurrent();
  }

  scheduleReprobe(): void {
    this.clearReprobeTimer();
    this.reprobeTimer = setTimeout(() => {
      this.reprobeTimer = undefined;
      void this.probeAll({ background: true });
    }, REBOUNCE_MS);
  }

  async probeAll(options: ProbeOptions = {}): Promise<void> {
    const session = this.host.session;
    if (session === undefined) {
      if (!options.background) {
        this.host.showError('No active session.');
      }
      return;
    }

    if (this.host.session !== session) return;

    this.abortCurrent();
    const controller = new AbortController();
    this.abortController = controller;

    const aliases = options.alias !== undefined ? [options.alias] : Object.keys(this.currentModels);
    if (aliases.length === 0) {
      if (!options.background) {
        this.host.showStatus('No models configured to probe.', 'warning');
      }
      return;
    }

    this.markPending(aliases);

    const label = options.alias ?? `${String(aliases.length)} model${aliases.length === 1 ? '' : 's'}`;
    if (!options.background) {
      this.host.showStatus(`Probing ${label}...`, 'primary');
    }

    try {
      const results =
        options.alias !== undefined
          ? { [options.alias]: await session.probeModel(options.alias) }
          : await session.probeAllModels();

      if (controller.signal.aborted) return;

      this.host.setAppState({ modelProbeStatus: results });
      void session.setModelProbeStatus(results);
      this.reportSummary(results, options);
      this.host.track('model_probe_completed', {
        count: Object.keys(results).length,
        ok: Object.values(results).filter((r) => r.status === 'ok').length,
        error: Object.values(results).filter((r) => r.status !== 'ok').length,
        background: options.background ?? false,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      if (!options.background) {
        this.host.showError(`Model probe failed: ${message}`);
      }
    }
  }

  private get currentModels(): Record<string, unknown> {
    // The host's appState is the source of truth for the model list.
    return this.host.session === undefined ? {} : (this.host as unknown as { state: { appState: AppState } }).state.appState.availableModels;
  }

  private markPending(aliases: readonly string[]): void {
    const status: Record<string, ModelProbeResult> = {};
    for (const alias of aliases) {
      const existing = this.currentStatus[alias];
      status[alias] = {
        alias,
        status: 'unknown',
        providerName: existing?.providerName ?? '',
        model: existing?.model ?? '',
        probedAt: Date.now(),
      };
    }
    this.host.setAppState({
      modelProbeStatus: { ...this.currentStatus, ...status },
    });
    const session = this.host.session;
    if (session !== undefined) {
      void session.setModelProbeStatus(status);
    }
  }

  private get currentStatus(): Record<string, ModelProbeResult> {
    return (this.host as unknown as { state: { appState: AppState } }).state.appState.modelProbeStatus;
  }

  private reportSummary(results: Record<string, ModelProbeResult>, options: ProbeOptions): void {
    const values = Object.values(results);
    const okCount = values.filter((r) => r.status === 'ok').length;
    const errorCount = values.length - okCount;

    if (options.background) {
      if (errorCount > 0) {
        this.host.showStatus(`${String(errorCount)} model${errorCount === 1 ? '' : 's'} unreachable · send /probemodels for details`, 'warning');
      }
      return;
    }

    if (errorCount === 0) {
      this.host.showStatus(`All ${String(okCount)} model${okCount === 1 ? '' : 's'} reachable.`, 'success');
    } else if (okCount === 0) {
      this.host.showStatus(`All ${String(errorCount)} model${errorCount === 1 ? '' : 's'} unreachable.`, 'error');
    } else {
      this.host.showStatus(`${String(okCount)} reachable · ${String(errorCount)} unreachable`, 'warning');
    }
  }

  private abortCurrent(): void {
    if (this.abortController !== undefined) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  private clearReprobeTimer(): void {
    if (this.reprobeTimer !== undefined) {
      clearTimeout(this.reprobeTimer);
      this.reprobeTimer = undefined;
    }
  }
}

export function isProviderErrorCode(code: string): boolean {
  return PROBE_ERROR_CODES.has(code);
}

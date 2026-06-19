import type { SubagentModelEntry } from '../config/schema';
import type { ModelProbeResult } from './model-probe';

export type ProbeStatusSource =
  | Readonly<Record<string, ModelProbeResult>>
  | (() => Readonly<Record<string, ModelProbeResult>>);

export interface SubagentModelResolverOptions {
  readonly subagentModels?: Readonly<Record<string, SubagentModelEntry>>;
  readonly probeStatus?: ProbeStatusSource;
}

/**
 * Resolves a concrete model alias for a subagent profile using the user's
 * `[subagent_models]` configuration and the latest probe status.
 *
 * Supports two strategies:
 * - `prefer_main`: always try the first configured model, falling back to the
 *   next healthy entry only when earlier ones are known to be unhealthy.
 * - `balanced`: round-robin across configured models, skipping unhealthy ones.
 */
export class SubagentModelResolver {
  private readonly config: Readonly<Record<string, SubagentModelEntry>>;
  private readonly probeStatus: ProbeStatusSource;
  private readonly balancedIndices = new Map<string, number>();

  constructor(options: SubagentModelResolverOptions = {}) {
    this.config = options.subagentModels ?? {};
    this.probeStatus = options.probeStatus ?? {};
  }

  private getProbeStatus(): Readonly<Record<string, ModelProbeResult>> {
    return typeof this.probeStatus === 'function' ? this.probeStatus() : this.probeStatus;
  }

  /**
   * Return the model alias that should be used for `profileName`.
   *
   * @param profileName - The subagent profile (e.g. `coder`, `explore`).
   * @param parentModel - The parent agent's model alias, used when no config
   *   entry exists for the profile.
   * @param override - An explicit per-spawn model override; this bypasses the
   *   config entirely and is returned as-is so the caller can decide whether to
   *   apply probe-based fallback.
   */
  resolve(profileName: string, parentModel?: string, override?: string): string | undefined {
    if (override !== undefined && override.length > 0) {
      return override;
    }

    const entry = this.config[profileName];
    if (entry === undefined) {
      return parentModel;
    }

    if (typeof entry === 'string') {
      return entry;
    }

    const models = entry.models;
    if (models.length === 0) {
      return parentModel;
    }

    if (entry.strategy === 'balanced') {
      return this.resolveBalanced(profileName, models);
    }

    return this.resolvePreferMain(models);
  }

  private resolvePreferMain(models: readonly string[]): string {
    for (const model of models) {
      if (this.isHealthy(model)) {
        return model;
      }
    }
    // All configured models are known-unhealthy. Return the primary model and
    // let the host decide whether to fall back to any globally-healthy alias.
    // `models` is guaranteed non-empty by the schema, so the first entry exists.
    return models[0]!;
  }

  private resolveBalanced(profileName: string, models: readonly string[]): string {
    const start = (this.balancedIndices.get(profileName) ?? -1) + 1;
    const healthy: number[] = [];
    for (let i = 0; i < models.length; i++) {
      const idx = (start + i) % models.length;
      const model = models[idx];
      if (model !== undefined && this.isHealthy(model)) {
        healthy.push(idx);
      }
    }

    // If every model is unhealthy, fall back to the first configured model so
    // the error path remains deterministic.
    const chosen = healthy.length > 0 ? healthy[0]! : 0;
    this.balancedIndices.set(profileName, chosen);
    return models[chosen]!;
  }

  private isHealthy(alias: string): boolean {
    const status = this.getProbeStatus()[alias]?.status;
    return status === undefined || status === 'ok' || status === 'unknown';
  }
}

import { describe, expect, it } from 'vitest';

import { SubagentModelResolver } from '../../src/session/subagent-model-resolver';
import type { ModelProbeResult } from '../../src/session/model-probe';
import type { SubagentModels } from '../../src/config/schema';

function result(alias: string, status: ModelProbeResult['status']): ModelProbeResult {
  return {
    alias,
    status,
    providerName: 'test',
    model: alias,
    probedAt: 1,
  };
}

describe('SubagentModelResolver', () => {
  it('falls back to the parent model when no config entry exists', () => {
    const resolver = new SubagentModelResolver({ subagentModels: {} });
    expect(resolver.resolve('coder', 'parent-model')).toBe('parent-model');
  });

  it('uses a plain string config entry', () => {
    const resolver = new SubagentModelResolver({
      subagentModels: { coder: 'gpt-5.2' },
    });
    expect(resolver.resolve('coder', 'parent-model')).toBe('gpt-5.2');
  });

  it('honors an explicit override', () => {
    const resolver = new SubagentModelResolver({
      subagentModels: { coder: 'gpt-5.2' },
    });
    expect(resolver.resolve('coder', 'parent-model', 'override-model')).toBe('override-model');
  });

  describe('prefer_main strategy', () => {
    it('returns the first configured model when all are healthy', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'prefer_main', models: ['gpt-5.2', 'glm-4'] },
        },
      });
      expect(resolver.resolve('coder', 'parent-model')).toBe('gpt-5.2');
    });

    it('skips known-unhealthy models and returns the first healthy one', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'prefer_main', models: ['gpt-5.2', 'glm-4', 'kimi-lite'] },
        },
        probeStatus: {
          'gpt-5.2': result('gpt-5.2', 'auth_error'),
          'glm-4': result('glm-4', 'ok'),
          'kimi-lite': result('kimi-lite', 'ok'),
        },
      });
      expect(resolver.resolve('coder', 'parent-model')).toBe('glm-4');
    });

    it('returns the primary model when every entry is unhealthy', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'prefer_main', models: ['gpt-5.2', 'glm-4'] },
        },
        probeStatus: {
          'gpt-5.2': result('gpt-5.2', 'rate_limit'),
          'glm-4': result('glm-4', 'timeout'),
        },
      });
      expect(resolver.resolve('coder', 'parent-model')).toBe('gpt-5.2');
    });

    it('treats unknown probe status as healthy', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'prefer_main', models: ['gpt-5.2'] },
        },
        probeStatus: {
          'gpt-5.2': result('gpt-5.2', 'unknown'),
        },
      });
      expect(resolver.resolve('coder', 'parent-model')).toBe('gpt-5.2');
    });
  });

  describe('balanced strategy', () => {
    it('round-robins across healthy models', () => {
      const subagentModels: SubagentModels = {
        coder: { strategy: 'balanced', models: ['a', 'b', 'c'] },
      };
      const resolver = new SubagentModelResolver({ subagentModels });
      expect(resolver.resolve('coder', 'parent')).toBe('a');
      expect(resolver.resolve('coder', 'parent')).toBe('b');
      expect(resolver.resolve('coder', 'parent')).toBe('c');
      expect(resolver.resolve('coder', 'parent')).toBe('a');
    });

    it('skips unhealthy models when at least one is healthy', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'balanced', models: ['a', 'b', 'c'] },
        },
        probeStatus: {
          a: result('a', 'ok'),
          b: result('b', 'auth_error'),
          c: result('c', 'ok'),
        },
      });
      expect(resolver.resolve('coder', 'parent')).toBe('a');
      expect(resolver.resolve('coder', 'parent')).toBe('c');
      expect(resolver.resolve('coder', 'parent')).toBe('a');
    });

    it('falls back to the first model when all are unhealthy', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'balanced', models: ['a', 'b', 'c'] },
        },
        probeStatus: {
          a: result('a', 'rate_limit'),
          b: result('b', 'connection_error'),
          c: result('c', 'api_error'),
        },
      });
      expect(resolver.resolve('coder', 'parent')).toBe('a');
      expect(resolver.resolve('coder', 'parent')).toBe('a');
    });

    it('keeps independent indices per profile', () => {
      const resolver = new SubagentModelResolver({
        subagentModels: {
          coder: { strategy: 'balanced', models: ['c1', 'c2'] },
          explore: { strategy: 'balanced', models: ['e1', 'e2'] },
        },
      });
      expect(resolver.resolve('coder', 'parent')).toBe('c1');
      expect(resolver.resolve('explore', 'parent')).toBe('e1');
      expect(resolver.resolve('coder', 'parent')).toBe('c2');
      expect(resolver.resolve('explore', 'parent')).toBe('e2');
    });
  });

  it('reads probe status from a getter so updates are visible', () => {
    const probeStatus: Record<string, ModelProbeResult> = {};
    const resolver = new SubagentModelResolver({
      subagentModels: {
        coder: { strategy: 'prefer_main', models: ['gpt-5.2', 'glm-4'] },
      },
      probeStatus: () => probeStatus,
    });
    expect(resolver.resolve('coder', 'parent')).toBe('gpt-5.2');

    probeStatus['gpt-5.2'] = result('gpt-5.2', 'auth_error');
    expect(resolver.resolve('coder', 'parent')).toBe('glm-4');
  });
});

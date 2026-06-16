import { describe, expect, it } from 'vitest';

import { buildProbeReportLines } from '#/tui/components/messages/probemodels-panel';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('probe report lines', () => {
  it('renders a table with available and failed models', () => {
    const lines = buildProbeReportLines({
      results: {
        k2: {
          alias: 'k2',
          status: 'ok',
          providerName: 'managed:kimi-code',
          model: 'kimi-k2-0714',
          probedAt: Date.now(),
        },
        claude: {
          alias: 'claude',
          status: 'ok',
          providerName: 'anthropic',
          model: 'claude-3-7-sonnet-20250219',
          probedAt: Date.now(),
        },
        gpt4: {
          alias: 'gpt4',
          status: 'auth_error',
          providerName: 'openai',
          model: 'gpt-4o-2024-08-06',
          error: 'Invalid API key',
          probedAt: Date.now(),
        },
      },
      availableModels: {
        k2: {
          provider: 'managed:kimi-code',
          model: 'kimi-k2-0714',
          maxContextSize: 256_000,
          capabilities: ['tool_use', 'image_in'],
        },
        claude: {
          provider: 'anthropic',
          model: 'claude-3-7-sonnet-20250219',
          maxContextSize: 200_000,
          capabilities: ['thinking', 'tool_use', 'image_in'],
        },
        gpt4: {
          provider: 'openai',
          model: 'gpt-4o-2024-08-06',
          maxContextSize: 128_000,
          capabilities: ['tool_use', 'image_in', 'video_in'],
        },
      },
    }).map(strip);

    const output = lines.join('\n');
    expect(output).toContain('Model probe (3 models)');
    expect(output).toContain('Alias');
    expect(output).toContain('Status');
    expect(output).toContain('Provider');
    expect(output).toContain('Model');
    expect(output).toContain('Notes');
    expect(output).toContain('k2');
    expect(output).toContain('ok');
    expect(output).toContain('anthropic');
    expect(output).toContain('claude-3-7-sonnet-20250219');
    expect(output).toContain('tools');
    expect(output).toContain('vision');
    expect(output).toContain('256.0k ctx');
    expect(output).toContain('gpt-4o-2024-08-06');
    expect(output).toContain('Invalid API key');
    expect(output).toContain('2 reachable');
    expect(output).toContain('1 unreachable');
  });

  it('sorts reachable models before failed ones', () => {
    const lines = buildProbeReportLines({
      results: {
        bad: {
          alias: 'bad',
          status: 'connection_error',
          providerName: 'openai',
          model: 'gpt-4',
          probedAt: Date.now(),
        },
        good: {
          alias: 'good',
          status: 'ok',
          providerName: 'kimi',
          model: 'kimi-k2',
          probedAt: Date.now(),
        },
        unknown: {
          alias: 'unknown',
          status: 'unknown',
          providerName: 'kimi',
          model: 'kimi-unknown',
          probedAt: Date.now(),
        },
      },
      availableModels: {
        bad: { provider: 'openai', model: 'gpt-4', maxContextSize: 8192 },
        good: { provider: 'kimi', model: 'kimi-k2', maxContextSize: 256_000 },
        unknown: { provider: 'kimi', model: 'kimi-unknown', maxContextSize: 128_000 },
      },
    }).map(strip);

    const output = lines.join('\n');
    const okIndex = output.indexOf('good');
    const unknownIndex = output.indexOf('unknown');
    const errorIndex = output.indexOf('bad');
    expect(okIndex).toBeLessThan(unknownIndex);
    expect(unknownIndex).toBeLessThan(errorIndex);
  });

  it('renders an empty state when no models are configured', () => {
    const lines = buildProbeReportLines({
      results: {},
      availableModels: {},
    }).map(strip);

    const output = lines.join('\n');
    expect(output).toContain('Model probe');
    expect(output).toContain('No models configured to probe');
  });
});

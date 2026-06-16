/**
 * Probe report line builder for `/probemodels`.
 *
 * Renders a compact table of configured models with their probe status,
 * provider, model id, and capabilities (or error reason when unavailable).
 */

import type { ModelAlias, ModelProbeResult } from '@moonshot-ai/kimi-code-sdk';

import { currentTheme } from '#/tui/theme';
import { formatTokenCount } from '#/utils/usage/usage-format';

export interface ProbeReportOptions {
  readonly results: Record<string, ModelProbeResult>;
  readonly availableModels: Record<string, ModelAlias>;
}

interface TableRow {
  readonly alias: string;
  readonly status: ModelProbeResult['status'];
  readonly provider: string;
  readonly model: string;
  readonly notes: string;
}

function capabilityLabel(cap: string): string {
  switch (cap) {
    case 'tool_use':
      return 'tools';
    case 'image_in':
      return 'vision';
    case 'video_in':
      return 'video';
    case 'always_thinking':
      return 'always-thinking';
    default:
      return cap;
  }
}

function formatCharacteristics(alias: ModelAlias | undefined): string {
  const parts: string[] = (alias?.capabilities ?? []).map(capabilityLabel);
  const context = alias?.maxContextSize;
  if (context !== undefined && context > 0) {
    parts.push(`${formatTokenCount(context)} ctx`);
  }
  return parts.join(' · ');
}

function statusRank(status: ModelProbeResult['status']): number {
  if (status === 'ok') return 0;
  if (status === 'unknown') return 1;
  return 2;
}

function buildRows(options: ProbeReportOptions): TableRow[] {
  const rows = Object.entries(options.results).map(([alias, result]) => {
    const aliasConfig = options.availableModels[alias];
    const notes =
      result.status === 'ok'
        ? formatCharacteristics(aliasConfig)
        : result.error ?? result.status;
    return {
      alias,
      status: result.status,
      provider: result.providerName || aliasConfig?.provider || '',
      model: result.model || aliasConfig?.model || aliasConfig?.displayName || '',
      notes,
    };
  });
  return rows.toSorted((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return a.alias.localeCompare(b.alias);
  });
}

export function buildProbeReportLines(options: ProbeReportOptions): string[] {
  const accent = (text: string) => currentTheme.boldFg('primary', text);
  const muted = (text: string) => currentTheme.fg('textDim', text);
  const value = (text: string) => currentTheme.fg('text', text);
  const errorStyle = (text: string) => currentTheme.fg('error', text);
  const successStyle = (text: string) => currentTheme.fg('success', text);
  const warningStyle = (text: string) => currentTheme.fg('warning', text);

  const rows = buildRows(options);
  if (rows.length === 0) {
    return [accent('Model probe'), muted('  No models configured to probe.')];
  }

  const aliasWidth = Math.max(5, ...rows.map((r) => r.alias.length));
  const statusWidth = Math.max(6, ...rows.map((r) => r.status.length));
  const providerWidth = Math.max(8, ...rows.map((r) => r.provider.length));

  const header =
    `  ${muted('Alias'.padEnd(aliasWidth))}  ` +
    `${muted('Status'.padEnd(statusWidth))}  ` +
    `${muted('Provider'.padEnd(providerWidth))}  ` +
    `${muted('Model')}  ` +
    muted('Notes');

  const lines: string[] = [
    accent(`Model probe (${String(rows.length)} model${rows.length === 1 ? '' : 's'})`),
    header,
  ];

  for (const row of rows) {
    const statusText =
      row.status === 'ok'
        ? successStyle(row.status.padEnd(statusWidth))
        : row.status === 'unknown'
          ? warningStyle(row.status.padEnd(statusWidth))
          : errorStyle(row.status.padEnd(statusWidth));

    const modelDisplay = row.model;
    const notesDisplay = row.notes;

    const line =
      `  ${value(row.alias.padEnd(aliasWidth))}  ` +
      `${statusText}  ` +
      `${value(row.provider.padEnd(providerWidth))}  ` +
      `${value(modelDisplay)}  ` +
      (row.status === 'ok' ? value(notesDisplay) : row.status === 'unknown' ? warningStyle(notesDisplay) : errorStyle(notesDisplay));

    lines.push(line);
  }

  const okCount = rows.filter((r) => r.status === 'ok').length;
  const errorCount = rows.length - okCount;
  lines.push('');
  if (errorCount === 0) {
    lines.push(`  ${successStyle('All models reachable')}`);
  } else if (okCount === 0) {
    lines.push(`  ${errorStyle('All models unreachable')}`);
  } else {
    lines.push(
      `  ${successStyle(`${String(okCount)} reachable`)}  ${muted('·')}  ${errorStyle(`${String(errorCount)} unreachable`)}`,
    );
  }

  return lines;
}

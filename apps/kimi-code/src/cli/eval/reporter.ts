import type { EvalSuiteResult } from './types';

export function reportToJson(result: EvalSuiteResult): string {
  return JSON.stringify(result, null, 2);
}

export function reportToMarkdown(result: EvalSuiteResult): string {
  const lines: string[] = [`# ${result.spec.name}`];
  if (result.spec.description !== undefined) {
    lines.push('');
    lines.push(result.spec.description);
  }

  const summary = result.summary;
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total runs | ${summary.totalRuns} |`);
  lines.push(`| Completed | ${summary.completed} |`);
  lines.push(`| Failed | ${summary.failed} |`);
  lines.push(`| Timed out | ${summary.timedOut} |`);
  lines.push(`| Total duration | ${formatDuration(summary.totalDurationMs)} |`);
  if (summary.totalEstimatedCostUsd !== undefined) {
    lines.push(`| Total estimated cost | $${summary.totalEstimatedCostUsd.toFixed(4)} |`);
  }
  if (summary.avgTimeToFirstTokenMs !== undefined) {
    lines.push(`| Avg. time to first token | ${summary.avgTimeToFirstTokenMs.toFixed(0)} ms |`);
  }

  lines.push('');
  lines.push('## Runs');
  lines.push('');
  lines.push(`| Prompt | Model | Variation | Sample | Status | Tokens | Cost | Duration | TTFT |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const run of result.runs) {
    const tokens = run.usage !== undefined ? `${run.usage.inputTokens}/${run.usage.outputTokens}` : '-';
    const cost = run.estimatedCostUsd !== undefined ? `$${run.estimatedCostUsd.toFixed(4)}` : '-';
    const duration = run.timing.endedAt !== undefined ? formatDuration(run.timing.durationMs) : '-';
    const ttft = run.timing.timeToFirstTokenMs !== undefined ? `${run.timing.timeToFirstTokenMs.toFixed(0)} ms` : '-';
    lines.push(
      `| ${run.promptId} | ${run.model} | ${run.variationId} | ${run.sampleIndex + 1} | ${run.status} | ${tokens} | ${cost} | ${duration} | ${ttft} |`,
    );
  }

  lines.push('');
  lines.push('## Details');
  for (const run of result.runs) {
    lines.push('');
    lines.push(`### ${run.runId}: ${run.promptId} / ${run.model} / ${run.variationId} / sample ${run.sampleIndex + 1}`);
    lines.push('');
    lines.push(`- **Status**: ${run.status}`);
    lines.push(`- **Session**: ${run.sessionId}`);
    if (run.error !== undefined) {
      lines.push(`- **Error**: ${run.error}`);
    }
    if (run.usage !== undefined) {
      lines.push(`- **Tokens**: ${run.usage.inputTokens} in / ${run.usage.outputTokens} out`);
    }
    if (run.estimatedCostUsd !== undefined) {
      lines.push(`- **Estimated cost**: $${run.estimatedCostUsd.toFixed(4)}`);
    }
    if (run.metrics !== undefined && Object.keys(run.metrics).length > 0) {
      lines.push(`- **Metrics**: ${formatMetrics(run.metrics)}`);
    }
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Assistant response</summary>');
    lines.push('');
    lines.push('```text');
    lines.push(run.assistantText || '(empty)');
    lines.push('```');
    lines.push('</details>');

    if (run.toolCalls.length > 0) {
      lines.push('');
      lines.push('<details>');
      lines.push(`<summary>Tool calls (${run.toolCalls.length})</summary>`);
      lines.push('');
      for (const toolCall of run.toolCalls) {
        lines.push(`**${toolCall.name}**`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(toolCall.args, null, 2));
        lines.push('```');
        if (toolCall.result !== undefined) {
          lines.push('Result:');
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(toolCall.result, null, 2));
          lines.push('```');
        }
        if (toolCall.error !== undefined) {
          lines.push(`Error: ${toolCall.error}`);
        }
      }
      lines.push('</details>');
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatMetrics(metrics: Record<string, number | boolean>): string {
  return Object.entries(metrics)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

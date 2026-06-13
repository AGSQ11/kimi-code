import type { Agent } from '../..';

export type CritiqueCheckpointType = 'plan' | 'batch_edit' | 'goal_completion';

const CHECKPOINT_LABELS: Record<CritiqueCheckpointType, string> = {
  plan: 'plan approval',
  batch_edit: 'multi-file edit approval',
  goal_completion: 'goal completion',
};

/**
 * Returns true when the `auto-critique-checkpoints` experimental flag is enabled.
 */
export function isAutoCritiqueEnabled(agent: Agent): boolean {
  return agent.experimentalFlags?.enabled('auto-critique-checkpoints') ?? false;
}

interface RunCheckpointCritiqueOptions {
  readonly agent: Agent;
  readonly checkpoint: CritiqueCheckpointType;
  readonly context: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Run a focused critic subagent for a high-risk checkpoint.
 *
 * Guards the call behind the experimental flag and subagent host availability.
 * Swallows errors and returns a safe fallback message so a failed critique never
 * blocks the user from approving the underlying action.
 */
export async function runCheckpointCritique(
  options: RunCheckpointCritiqueOptions,
): Promise<string> {
  const { agent, checkpoint, context, signal } = options;

  if (!isAutoCritiqueEnabled(agent)) {
    return '';
  }

  if (agent.subagentHost === undefined) {
    return 'Critic subagent is not available in this context.';
  }

  if (signal?.aborted === true) {
    return 'Auto-critique skipped (cancelled).';
  }

  const prompt = buildCritiquePrompt(checkpoint, context);

  const startedAt = Date.now();
  try {
    const critique = await agent.subagentHost.runCritique(prompt, agent.config.modelAlias ?? '');
    agent.telemetry.track('auto_critique_completed', {
      checkpoint,
      duration_ms: Date.now() - startedAt,
      critique_length: critique.length,
    });
    return critique;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agent.telemetry.track('auto_critique_failed', {
      checkpoint,
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    return `Auto-critique failed: ${message}`;
  }
}

function buildCritiquePrompt(checkpoint: CritiqueCheckpointType, context: string): string {
  const label = CHECKPOINT_LABELS[checkpoint];
  return [
    `You are reviewing a proposed action at a ${label} checkpoint.`,
    'Identify flaws, hallucinations, missing edge cases, security issues, and alternative approaches.',
    'Be thorough and constructive, but concise enough to read in an approval dialog.',
    '',
    'Context:',
    context,
  ].join('\n');
}

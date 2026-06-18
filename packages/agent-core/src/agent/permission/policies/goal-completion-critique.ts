import type { Agent } from '../..';
import type { ToolInputDisplay } from '../../../tools/display';
import { runCheckpointCritique } from '../../critique/checkpoint';
import type {
  ApprovalResponse,
  PermissionPolicy,
  PermissionPolicyContext,
  PermissionPolicyResolution,
  PermissionPolicyResult,
} from '../types';

/**
 * Permission policy that asks the user to confirm goal completion and runs an
 * auto-critique of the goal result when the experimental
 * `auto-critique-checkpoints` flag is enabled.
 *
 * This policy intentionally runs before the default-approve rule so that
 * UpdateGoal('complete') is surfaced for review in manual mode.
 */
export class GoalCompletionCritiquePermissionPolicy implements PermissionPolicy {
  readonly name = 'goal-completion-critique';

  constructor(private readonly agent: Agent) {}

  async evaluate(context: PermissionPolicyContext): Promise<PermissionPolicyResult | undefined> {
    if (context.toolCall.name !== 'UpdateGoal') return;

    const args = context.args as { status?: string } | undefined;
    if (args?.status !== 'complete') return;

    const goal = this.agent.goal.getActiveGoal();
    if (goal === null) return;

    const critique = await runCheckpointCritique({
      agent: this.agent,
      checkpoint: 'goal_completion',
      context: buildGoalCompletionCritiqueContext(goal.objective, goal.completionCriterion),
      signal: context.signal,
    });

    if (critique.length > 0) {
      context.execution.display = buildGoalCompletionDisplay(goal.objective, critique);
    }

    const hasCritique = critique.length > 0;
    this.agent.telemetry.track('goal_completion_critique_attached', {
      ...(hasCritique ? { has_critique: true } : undefined),
    });

    return {
      kind: 'ask',
      reason: {
        ...(hasCritique ? { has_critique: true } : undefined),
      },
      resolveApproval: (result) => this.resolveGoalCompletionApproval(result),
    };
  }

  private resolveGoalCompletionApproval(
    result: ApprovalResponse,
  ): PermissionPolicyResolution | undefined {
    if (result.decision !== 'approved') {
      this.agent.telemetry.track('goal_completion_review', {
        outcome: result.decision,
      });
      return {
        kind: 'result' as const,
        syntheticResult: {
          isError: true,
          output:
            result.decision === 'cancelled'
              ? 'Goal completion review cancelled.'
              : 'Goal completion rejected by user.',
        },
      };
    }

    const skippedCritique = result.selectedLabel === 'Approve without critique';
    this.agent.telemetry.track('goal_completion_review', {
      outcome: skippedCritique ? 'approved_without_critique' : 'approved',
    });

    // Returning undefined lets the original UpdateGoal('complete') tool execute.
    return undefined;
  }
}

function buildGoalCompletionDisplay(objective: string, critique: string): ToolInputDisplay {
  return {
    kind: 'generic',
    summary: `Complete goal: ${objective}`,
    detail: { critique },
  };
}

function buildGoalCompletionCritiqueContext(
  objective: string,
  completionCriterion: string | undefined,
): string {
  const parts: string[] = [];
  parts.push(`Goal objective: ${objective}`);
  if (completionCriterion !== undefined && completionCriterion.length > 0) {
    parts.push(`Completion criterion: ${completionCriterion}`);
  }
  return parts.join('\n');
}

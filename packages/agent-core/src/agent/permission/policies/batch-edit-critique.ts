import type { Agent } from '../..';
import type { ToolCall } from '../../../loop/types';
import { runCheckpointCritique } from '../../critique/checkpoint';
import type {
  PermissionPolicy,
  PermissionPolicyContext,
  PermissionPolicyResult,
} from '../types';

const FILE_EDIT_TOOLS = new Set(['Write', 'Edit']);

interface FileIoDisplay {
  readonly kind: 'file_io';
  readonly operation: 'read' | 'write' | 'edit' | 'glob' | 'grep';
  readonly path: string;
  readonly detail?: string | undefined;
  readonly content?: string | undefined;
  readonly before?: string | undefined;
  readonly after?: string | undefined;
  critique?: string | undefined;
}

/**
 * Permission policy that runs an auto-critique before asking approval for file
 * edits. When the experimental `auto-critique-checkpoints` flag is enabled, the
 * critic reviews the pending diff/content and the policy attaches the critique
 * to the display so the TUI can render it inline.
 */
export class BatchEditCritiquePermissionPolicy implements PermissionPolicy {
  readonly name = 'batch-edit-critique';

  constructor(private readonly agent: Agent) {}

  async evaluate(context: PermissionPolicyContext): Promise<PermissionPolicyResult | undefined> {
    if (!FILE_EDIT_TOOLS.has(context.toolCall.name)) return;

    const display = context.execution.display;
    if (display?.kind !== 'file_io') return;

    const fileDisplay: FileIoDisplay = display as FileIoDisplay;
    if (fileDisplay.operation !== 'write' && fileDisplay.operation !== 'edit') return;

    const batchFileEdits = collectBatchFileEdits(context.toolCalls);
    const isMultiFileBatch = batchFileEdits.length >= 2;

    const critique = await runCheckpointCritique({
      agent: this.agent,
      checkpoint: 'batch_edit',
      context: buildBatchEditCritiqueContext(fileDisplay, batchFileEdits, isMultiFileBatch),
      signal: context.signal,
    });

    if (critique.length > 0) {
      fileDisplay.critique = critique;
    }

    const hasCritique = critique.length > 0;
    this.agent.telemetry.track('batch_edit_critique_attached', {
      tool_name: context.toolCall.name,
      path: fileDisplay.path,
      is_multi_file: isMultiFileBatch,
      ...(hasCritique ? { has_critique: true } : undefined),
    });

    // Deliberately fall through: this policy only enriches the display; the
    // downstream ask policy (FallbackAsk or user-configured rule) still owns
    // the approval request.
    return undefined;
  }
}

function collectBatchFileEdits(toolCalls: readonly ToolCall[]): Array<{ name: string; path: unknown }> {
  return toolCalls
    .filter((tc) => FILE_EDIT_TOOLS.has(tc.name))
    .map((tc) => ({
      name: tc.name,
      path: (tc.arguments as unknown as Record<string, unknown> | undefined)?.['path'],
    }));
}

function buildBatchEditCritiqueContext(
  display: FileIoDisplay,
  batchEdits: Array<{ name: string; path: unknown }>,
  isMultiFileBatch: boolean,
): string {
  const parts: string[] = [];

  parts.push(`File: ${display.path}`);
  parts.push(`Operation: ${display.operation}`);

  if (isMultiFileBatch) {
    parts.push(
      `This edit is part of a multi-file batch containing ${String(batchEdits.length)} file edits.`,
    );
    parts.push('Batch files:');
    for (const edit of batchEdits) {
      parts.push(`  - ${edit.name}: ${String(edit.path)}`);
    }
  }

  if (display.operation === 'write' && display.content !== undefined) {
    parts.push('New file content:', display.content);
  } else if (display.operation === 'edit' && display.before !== undefined && display.after !== undefined) {
    parts.push('Original text:', display.before);
    parts.push('Replacement text:', display.after);
  }

  return parts.join('\n');
}

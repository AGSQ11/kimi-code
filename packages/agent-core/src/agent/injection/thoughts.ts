import { DynamicInjector } from './injector';
import { THINK_STORE_KEY, type Thought } from '#/tools/builtin/think';

/**
 * Re-injects active Think-tool thoughts as a system reminder so they survive
 * micro-compaction (which clears old tool-result content) and remain visible
 * to the model during the session.
 */
export class ThoughtInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'thoughts';

  override onContextCompacted(_compactedCount: number): void {
    // Force re-injection after compaction because the original tool results
    // may have been truncated.
    this.injectedAt = null;
  }

  protected override getInjection(): string | undefined {
    if (this.injectedAt !== null) return undefined;

    const thoughts = (this.agent.tools.getToolStore().get(THINK_STORE_KEY) ?? []) as Thought[];
    if (thoughts.length === 0) return undefined;

    const lines = thoughts.map((thought, index) => {
      const category = thought.category !== undefined ? ` (${thought.category})` : '';
      const tags = thought.tags !== undefined && thought.tags.length > 0 ? ` [${thought.tags.join(', ')}]` : '';
      return `${index + 1}.${category}${tags}\n${thought.content}`;
    });

    return [
      'Accumulated reasoning thoughts from this session:',
      '',
      ...lines,
      '',
      'These thoughts may contain design decisions, constraints, or reflections that should inform your next steps.',
    ].join('\n');
  }
}

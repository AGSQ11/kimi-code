import { isKimiError } from '@moonshot-ai/kimi-code-sdk';

import { CompareResultsPanelComponent } from '../components/panels/compare-results';
import { CompareSelectorComponent } from '../components/dialogs/compare-selector';
import { LLM_NOT_SET_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleCompareCommand(host: SlashCommandHost, args: string): Promise<void> {
  const session = host.session;
  if (host.state.appState.model.trim().length === 0 || session === undefined) {
    host.showError(LLM_NOT_SET_MESSAGE);
    return;
  }

  const prompt = resolvePrompt(host, args);
  if (prompt === undefined) {
    host.showError('No prompt to compare. Type one after /compare or send a user message first.');
    return;
  }

  const models = host.state.appState.availableModels;
  if (Object.keys(models).length < 2) {
    host.showError('At least two configured models are required to run a comparison.');
    return;
  }

  host.mountEditorReplacement(
    new CompareSelectorComponent({
      models,
      onSelect: async (selection) => {
        host.restoreEditor();
        await runComparison(host, prompt, selection.modelAliases);
      },
      onCancel: () => {
        host.restoreEditor();
      },
    }),
  );
}

function resolvePrompt(host: SlashCommandHost, args: string): string | undefined {
  const trimmed = args.trim();
  if (trimmed.length > 0) return trimmed;

  for (let i = host.state.transcriptEntries.length - 1; i >= 0; i--) {
    const entry = host.state.transcriptEntries[i];
    if (entry.kind === 'user' && entry.content.trim().length > 0) {
      return entry.content.trim();
    }
  }

  return undefined;
}

async function runComparison(
  host: SlashCommandHost,
  prompt: string,
  modelAliases: readonly string[],
): Promise<void> {
  const session = host.session;
  if (session === undefined) return;

  host.showStatus(`Comparing ${String(modelAliases.length)} models...`, 'primary');
  host.track('input_command', { command: 'compare', model_count: modelAliases.length });

  try {
    const results = await session.compareModels(prompt, modelAliases);

    host.showStatus('Comparison complete.', 'success');
    host.mountEditorReplacement(
      new CompareResultsPanelComponent({
        prompt,
        results,
        onPromote: (index) => {
          const entry = results[index];
          if (entry?.result === undefined) return;
          host.restoreEditor();
          host.sendNormalUserInput(entry.result);
        },
        onSynthesize: () => {
          host.restoreEditor();
          const synthesisPrompt = buildSynthesisPrompt(prompt, results);
          host.sendNormalUserInput(synthesisPrompt);
        },
        onClose: () => {
          host.restoreEditor();
        },
      }),
    );
  } catch (error) {
    if (isKimiError(error) && error.code === 'provider.rate_limit') {
      host.showError(
        'Comparison failed: one or more models hit a rate limit. Run /compare again and choose different models.',
      );
      return;
    }
    host.showError(`Comparison failed: ${formatErrorMessage(error)}`);
  }
}

function buildSynthesisPrompt(
  prompt: string,
  results: readonly { modelAlias: string; result?: string; error?: string }[],
): string {
  const parts: string[] = [
    'I ran the following prompt against several models. Please synthesize the best parts of their responses into a single, coherent answer.',
    '',
    `Original prompt: ${prompt}`,
    '',
    'Model responses:',
  ];

  for (const entry of results) {
    parts.push(`\n## ${entry.modelAlias}`);
    if (entry.error !== undefined) {
      parts.push(`(error: ${entry.error})`);
    } else {
      parts.push(entry.result ?? '(no response)');
    }
  }

  parts.push('\nPlease provide a synthesized answer.');
  return parts.join('\n');
}

import { describe, expect, it, vi } from 'vitest';

import { handleCompareCommand } from '#/tui/commands/compare';
import type { SlashCommandHost } from '#/tui/commands/dispatch';
import { CompareSelectorComponent } from '#/tui/components/dialogs/compare-selector';
import { CompareResultsPanelComponent } from '#/tui/components/panels/compare-results';
import { currentTheme } from '#/tui/theme';

function makeHost(overrides: { hasSession?: boolean; availableModels?: Record<string, unknown> } = {}) {
  const session = {
    compareModels: vi.fn(async () => [
      { modelAlias: 'model-a', result: 'Response A' },
      { modelAlias: 'model-b', result: 'Response B' },
    ]),
  };
  const hasSession = overrides.hasSession ?? true;
  const host = {
    state: {
      appState: {
        model: 'model-a',
        availableModels: overrides.availableModels ?? {
          'model-a': { displayName: 'Model A', provider: 'provider-a', model: 'model-a' },
          'model-b': { displayName: 'Model B', provider: 'provider-b', model: 'model-b' },
        },
      },
      transcriptEntries: [],
      theme: currentTheme,
    },
    session: hasSession ? session : undefined,
    requireSession: () => session,
    setAppState: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
    mountEditorReplacement: vi.fn(),
    restoreEditor: vi.fn(),
    sendNormalUserInput: vi.fn(),
  } as unknown as SlashCommandHost;
  return { host, session };
}

describe('handleCompareCommand', () => {
  it('shows an error when no model is configured', async () => {
    const { host, session } = makeHost({ hasSession: true });
    host.state.appState.model = '';

    await handleCompareCommand(host, 'hello');

    expect(host.showError).toHaveBeenCalled();
    expect(session.compareModels).not.toHaveBeenCalled();
  });

  it('shows an error when there is no active session', async () => {
    const { host, session } = makeHost({ hasSession: false });

    await handleCompareCommand(host, 'hello');

    expect(host.showError).toHaveBeenCalled();
    expect(session.compareModels).not.toHaveBeenCalled();
  });

  it('shows an error when fewer than two models are available', async () => {
    const { host, session } = makeHost({ availableModels: { 'model-a': {} } });

    await handleCompareCommand(host, 'hello');

    expect(host.showError).toHaveBeenCalledWith(
      'At least two configured models are required to run a comparison.',
    );
    expect(session.compareModels).not.toHaveBeenCalled();
  });

  it('shows an error when there is no prompt and no prior user message', async () => {
    const { host, session } = makeHost();

    await handleCompareCommand(host, '');

    expect(host.showError).toHaveBeenCalledWith(
      'No prompt to compare. Type one after /compare or send a user message first.',
    );
    expect(session.compareModels).not.toHaveBeenCalled();
  });

  it('opens the model selector and runs comparison with the provided prompt', async () => {
    const { host, session } = makeHost();

    await handleCompareCommand(host, 'explain recursion');

    expect(host.mountEditorReplacement).toHaveBeenCalledTimes(1);
    const selector = host.mountEditorReplacement.mock.calls[0]![0] as CompareSelectorComponent;
    expect(selector).toBeInstanceOf(CompareSelectorComponent);

    selector['opts'].onSelect({ modelAliases: ['model-a', 'model-b'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.compareModels).toHaveBeenCalledWith('explain recursion', ['model-a', 'model-b']);
    expect(host.mountEditorReplacement).toHaveBeenCalledTimes(2);
    const resultsPanel = host.mountEditorReplacement.mock.calls[1]![0] as CompareResultsPanelComponent;
    expect(resultsPanel).toBeInstanceOf(CompareResultsPanelComponent);
  });

  it('falls back to the last user transcript entry when no args are provided', async () => {
    const { host, session } = makeHost();
    host.state.transcriptEntries = [
      { kind: 'assistant', content: 'assistant text' },
      { kind: 'user', content: '  prior prompt  ' },
    ] as typeof host.state.transcriptEntries;

    await handleCompareCommand(host, '');

    const selector = host.mountEditorReplacement.mock.calls[0]![0] as CompareSelectorComponent;
    selector['opts'].onSelect({ modelAliases: ['model-a', 'model-b'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.compareModels).toHaveBeenCalledWith('prior prompt', ['model-a', 'model-b']);
  });

  it('promotes a response to the main context', async () => {
    const { host, session } = makeHost();

    await handleCompareCommand(host, 'prompt');
    const selector = host.mountEditorReplacement.mock.calls[0]![0] as CompareSelectorComponent;
    selector['opts'].onSelect({ modelAliases: ['model-a', 'model-b'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resultsPanel = host.mountEditorReplacement.mock.calls[1]![0] as CompareResultsPanelComponent;
    resultsPanel['opts'].onPromote(0);

    expect(host.restoreEditor).toHaveBeenCalled();
    expect(host.sendNormalUserInput).toHaveBeenCalledWith('Response A');
  });

  it('asks the main agent to synthesize responses', async () => {
    const { host, session } = makeHost();

    await handleCompareCommand(host, 'prompt');
    const selector = host.mountEditorReplacement.mock.calls[0]![0] as CompareSelectorComponent;
    selector['opts'].onSelect({ modelAliases: ['model-a', 'model-b'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resultsPanel = host.mountEditorReplacement.mock.calls[1]![0] as CompareResultsPanelComponent;
    resultsPanel['opts'].onSynthesize();

    expect(host.restoreEditor).toHaveBeenCalled();
    expect(host.sendNormalUserInput).toHaveBeenCalledWith(
      expect.stringContaining('Model responses'),
    );
  });

  it('shows an error when comparison fails', async () => {
    const { host, session } = makeHost();
    session.compareModels.mockRejectedValueOnce(new Error('model unavailable'));

    await handleCompareCommand(host, 'prompt');
    const selector = host.mountEditorReplacement.mock.calls[0]![0] as CompareSelectorComponent;
    selector['opts'].onSelect({ modelAliases: ['model-a', 'model-b'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('Comparison failed'));
  });
});

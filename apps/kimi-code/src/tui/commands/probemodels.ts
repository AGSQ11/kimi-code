import type { SlashCommandHost } from './dispatch';

export async function handleProbeModelsCommand(host: SlashCommandHost, args: string): Promise<void> {
  if (host.state.appState.streamingPhase !== 'idle') {
    host.showError('Cannot probe models while streaming — press Esc or Ctrl-C first.');
    return;
  }

  const alias = args.trim();
  await host.modelProbeService.probeAll({ alias: alias.length > 0 ? alias : undefined });
}

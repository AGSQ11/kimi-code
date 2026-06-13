import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleReloadSyspromptCommand(host: SlashCommandHost, _args: string): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('No active session.');
    return;
  }

  try {
    await session.reloadSystemPrompt();
    host.showStatus('System prompt reloaded from .kimi-code/sysprompt.md.', 'success');
  } catch (error) {
    host.showError(`Failed to reload system prompt: ${formatErrorMessage(error)}`);
  }
}

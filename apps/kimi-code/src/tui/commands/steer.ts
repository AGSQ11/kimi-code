import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleSteerCommand(host: SlashCommandHost, args: string): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError(NO_ACTIVE_SESSION_MESSAGE);
    return;
  }

  const trimmed = args.trim();
  if (trimmed.length === 0) {
    const active = host.streamingUI.getActiveSubagentIds();
    if (active.length === 0) {
      host.showStatus('No running subagents to steer.');
      return;
    }
    host.showStatus(`Running subagents: ${active.join(', ')}`);
    return;
  }

  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) {
    host.showError('Usage: /steer <agent-id> <instructions>');
    return;
  }

  const agentId = trimmed.slice(0, firstSpace).trim();
  const prompt = trimmed.slice(firstSpace + 1).trim();
  if (prompt.length === 0) {
    host.showError('Usage: /steer <agent-id> <instructions>');
    return;
  }

  try {
    await session.steerAgent(agentId, prompt);
    host.showStatus(`Steered ${agentId}.`);
  } catch (error) {
    host.showError(`Failed to steer ${agentId}: ${formatErrorMessage(error)}`);
  }
}

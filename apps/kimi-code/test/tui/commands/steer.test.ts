import { describe, expect, it, vi } from 'vitest';

import { handleSteerCommand } from '#/tui/commands/steer';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

function makeHost(overrides: { hasSession?: boolean; activeSubagents?: string[] } = {}) {
  const session = {
    steerAgent: vi.fn().mockResolvedValue(undefined),
  };
  const hasSession = overrides.hasSession ?? true;
  const host = {
    session: hasSession ? session : undefined,
    streamingUI: {
      getActiveSubagentIds: vi.fn(() => overrides.activeSubagents ?? []),
    },
    showError: vi.fn(),
    showStatus: vi.fn(),
  } as unknown as SlashCommandHost;
  return { host, session };
}

describe('handleSteerCommand', () => {
  it('steers a running subagent when given an id and prompt', async () => {
    const { host, session } = makeHost();

    await handleSteerCommand(host, 'agent-123 focus on auth');

    expect(session.steerAgent).toHaveBeenCalledWith('agent-123', 'focus on auth');
    expect(host.showStatus).toHaveBeenCalledWith('Steered agent-123.');
  });

  it('shows active subagents when called without arguments', async () => {
    const { host, session } = makeHost({ activeSubagents: ['agent-1', 'agent-2'] });

    await handleSteerCommand(host, '');

    expect(session.steerAgent).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith('Running subagents: agent-1, agent-2');
  });

  it('reports no running subagents when called without arguments', async () => {
    const { host, session } = makeHost();

    await handleSteerCommand(host, '');

    expect(session.steerAgent).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith('No running subagents to steer.');
  });

  it('shows usage error when only an agent id is provided', async () => {
    const { host, session } = makeHost();

    await handleSteerCommand(host, 'agent-123');

    expect(session.steerAgent).not.toHaveBeenCalled();
    expect(host.showError).toHaveBeenCalledWith('Usage: /steer <agent-id> <instructions>');
  });

  it('shows an error when there is no active session', async () => {
    const { host, session } = makeHost({ hasSession: false });

    await handleSteerCommand(host, 'agent-123 focus on auth');

    expect(session.steerAgent).not.toHaveBeenCalled();
    expect(host.showError).toHaveBeenCalled();
  });

  it('shows an error when steering fails', async () => {
    const { host, session } = makeHost();
    session.steerAgent.mockRejectedValue(new Error('agent not found'));

    await handleSteerCommand(host, 'agent-123 focus on auth');

    expect(host.showError).toHaveBeenCalledWith('Failed to steer agent-123: agent not found');
  });
});

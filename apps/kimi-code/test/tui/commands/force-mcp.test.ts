import { describe, expect, it, vi } from 'vitest';

import { handleForceMcpCommand } from '#/tui/commands/force-mcp';
import type { SlashCommandHost } from '#/tui/commands/dispatch';
import { currentTheme } from '#/tui/theme';

function makeHost(
  overrides: {
    hasSession?: boolean;
    forceMcpEnabled?: boolean;
    previousActiveTools?: readonly string[];
  } = {},
) {
  const session = {
    getTools: vi.fn(async () => [
      { name: 'Read', active: true, source: 'builtin' },
      { name: 'Edit', active: true, source: 'builtin' },
      { name: 'mcp__github__search', active: false, source: 'mcp' },
    ]),
    setActiveTools: vi.fn(async () => {}),
    setForceMcp: vi.fn(async () => {}),
  };
  const hasSession = overrides.hasSession ?? true;
  const host = {
    state: {
      appState: {
        forceMcp:
          overrides.forceMcpEnabled !== undefined
            ? {
                enabled: overrides.forceMcpEnabled,
                previousActiveTools: overrides.previousActiveTools ?? [],
              }
            : undefined,
      },
      theme: currentTheme,
    },
    session: hasSession ? session : undefined,
    requireSession: () => session,
    setAppState: vi.fn((patch: Record<string, unknown>) => Object.assign(host.state.appState, patch)),
    showError: vi.fn(),
    showNotice: vi.fn(),
  } as unknown as SlashCommandHost;
  return { host, session };
}

describe('handleForceMcpCommand', () => {
  it('shows an error when there is no active session', async () => {
    const { host, session } = makeHost({ hasSession: false });

    await handleForceMcpCommand(host, '');

    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('session'));
    expect(session.getTools).not.toHaveBeenCalled();
  });

  it('turns force MCP on and expands active tools', async () => {
    const { host, session } = makeHost({ forceMcpEnabled: false });

    await handleForceMcpCommand(host, 'on');

    expect(session.setActiveTools).toHaveBeenCalledWith(['Read', 'Edit', 'mcp__*']);
    expect(session.setForceMcp).toHaveBeenCalledWith(true);
    expect(host.setAppState).toHaveBeenCalledWith({
      forceMcp: { enabled: true, previousActiveTools: ['Read', 'Edit'] },
    });
    expect(host.showNotice).toHaveBeenCalledWith('Force MCP: ON', expect.any(String));
  });

  it('toggles force MCP off and restores the previous active tools', async () => {
    const { host, session } = makeHost({
      forceMcpEnabled: true,
      previousActiveTools: ['Read', 'Edit'],
    });

    await handleForceMcpCommand(host, 'off');

    expect(session.setActiveTools).toHaveBeenCalledWith(['Read', 'Edit']);
    expect(session.setForceMcp).toHaveBeenCalledWith(false);
    expect(host.setAppState).toHaveBeenCalledWith({ forceMcp: undefined });
    expect(host.showNotice).toHaveBeenCalledWith('Force MCP: OFF');
  });

  it('toggles on when called without args while off', async () => {
    const { host, session } = makeHost({ forceMcpEnabled: false });

    await handleForceMcpCommand(host, '');

    expect(session.setActiveTools).toHaveBeenCalled();
    expect(session.setForceMcp).toHaveBeenCalledWith(true);
    expect(host.showNotice).toHaveBeenCalledWith('Force MCP: ON', expect.any(String));
  });

  it('toggles off when called without args while on', async () => {
    const { host, session } = makeHost({
      forceMcpEnabled: true,
      previousActiveTools: ['Read'],
    });

    await handleForceMcpCommand(host, '');

    expect(session.setActiveTools).toHaveBeenCalledWith(['Read']);
    expect(session.setForceMcp).toHaveBeenCalledWith(false);
    expect(host.showNotice).toHaveBeenCalledWith('Force MCP: OFF');
  });

  it('does nothing when already in the requested state', async () => {
    const { host, session } = makeHost({ forceMcpEnabled: true, previousActiveTools: ['Read'] });

    await handleForceMcpCommand(host, 'on');

    expect(session.setActiveTools).not.toHaveBeenCalled();
    expect(session.setForceMcp).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith('Force MCP is already ON');
  });

  it('shows an error for unknown subcommands', async () => {
    const { host, session } = makeHost();

    await handleForceMcpCommand(host, 'maybe');

    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('Unknown forcemcp subcommand'));
    expect(session.setActiveTools).not.toHaveBeenCalled();
  });

  it('shows an error if toggling fails', async () => {
    const { host, session } = makeHost({ forceMcpEnabled: false });
    session.setActiveTools.mockRejectedValueOnce(new Error('network'));

    await handleForceMcpCommand(host, 'on');

    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('Failed to toggle force MCP'));
  });
});

import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleForceMcpCommand(host: SlashCommandHost, args: string): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError(NO_ACTIVE_SESSION_MESSAGE);
    return;
  }

  const subcmd = args.trim().toLowerCase();
  const current = host.state.appState.forceMcp?.enabled ?? false;

  let enabled: boolean;
  if (subcmd === 'on') enabled = true;
  else if (subcmd === 'off') enabled = false;
  else if (subcmd.length === 0) enabled = !current;
  else {
    host.showError(`Unknown forcemcp subcommand: ${subcmd}`);
    return;
  }

  if (enabled === current) {
    host.showNotice(`Force MCP is already ${enabled ? 'ON' : 'OFF'}`);
    return;
  }

  try {
    if (enabled) {
      const tools = await session.getTools();
      const activeNames = tools.filter((tool) => tool.active).map((tool) => tool.name);
      const newNames = Array.from(new Set([...activeNames, 'mcp__*']));

      await session.setActiveTools(newNames);
      await session.setForceMcp(true);
      host.setAppState({ forceMcp: { enabled: true, previousActiveTools: activeNames } });

      const connectedCount = tools.filter(
        (tool) => tool.source === 'mcp' && tool.active,
      ).length;
      host.showNotice(
        'Force MCP: ON',
        `All connected MCP tools are now active (${connectedCount} currently visible).`,
      );
      return;
    }

    const previousActiveTools = host.state.appState.forceMcp?.previousActiveTools ?? [];
    await session.setActiveTools(previousActiveTools);
    await session.setForceMcp(false);
    host.setAppState({ forceMcp: undefined });
    host.showNotice('Force MCP: OFF');
  } catch (error) {
    const msg = formatErrorMessage(error);
    host.showError(`Failed to toggle force MCP: ${msg}`);
  }
}

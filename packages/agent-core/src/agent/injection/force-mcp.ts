import { DynamicInjector } from './injector';

/**
 * Injects a compact reminder when force-MCP mode is enabled so the model knows
 * which MCP servers are available and that it should only use them when they
 * add useful context.
 */
export class ForceMcpInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'force_mcp';
  private lastEnabled: boolean | undefined;

  override getInjection(): string | undefined {
    const enabled = this.agent.forceMcpEnabled;

    if (enabled && (this.lastEnabled !== true || this.injectedAt === null)) {
      this.lastEnabled = true;
      return this.buildReminder();
    }

    if (!enabled && this.lastEnabled === true) {
      this.lastEnabled = false;
      return 'Force MCP mode is now off. Only the originally active tools are available.';
    }

    this.lastEnabled = enabled;
    return undefined;
  }

  private buildReminder(): string {
    const servers = this.agent.mcp?.list() ?? [];
    const connected = servers.filter((server) => server.status === 'connected');

    if (connected.length === 0) {
      return 'Force MCP mode is on, but no MCP servers are currently connected.';
    }

    const list = connected
      .map((server) => `${server.name} (${server.toolCount} tool${server.toolCount === 1 ? '' : 's'})`)
      .join(', ');

    return [
      'Force MCP mode is on. The following connected MCP servers may add context to your task:',
      list,
      'Only call their tools when they are genuinely useful.',
    ].join('\n');
  }
}

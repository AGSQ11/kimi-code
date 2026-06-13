import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '../../../src/agent';
import type { ContextMessage } from '../../../src/agent/context';
import { ForceMcpInjector } from '../../../src/agent/injection/force-mcp';
import type { McpServerEntry } from '../../../src/mcp/connection-manager';

interface ForceMcpAgentStub {
  readonly history: ContextMessage[];
  forceMcpEnabled: boolean;
  readonly servers: readonly McpServerEntry[];
}

function forceMcpAgent(stub: ForceMcpAgentStub): Agent {
  return {
    type: 'main',
    context: {
      get history() {
        return stub.history;
      },
      appendSystemReminder: (content: string, origin: ContextMessage['origin']) => {
        stub.history.push({
          role: 'user',
          content: [{ type: 'text', text: `<system-reminder>\n${content}\n</system-reminder>` }],
          toolCalls: [],
          origin,
        });
      },
    },
    mcp: {
      list: () => stub.servers,
    },
    forceMcpEnabled: stub.forceMcpEnabled,
  } as unknown as Agent;
}

describe('ForceMcpInjector', () => {
  it('does not inject when force MCP mode is off', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({ history, forceMcpEnabled: false, servers: [] });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();

    expect(history).toHaveLength(0);
  });

  it('injects a catalog of connected MCP servers when enabled', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({
      history,
      forceMcpEnabled: true,
      servers: [
        { name: 'github', status: 'connected', transport: 'stdio', toolCount: 5 },
        { name: 'postgres', status: 'connected', transport: 'stdio', toolCount: 3 },
      ],
    });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();

    expect(history).toHaveLength(1);
    const text = history[0]?.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    expect(text).toContain('Force MCP mode is on');
    expect(text).toContain('github (5 tools)');
    expect(text).toContain('postgres (3 tools)');
    expect(history[0]?.origin).toEqual({ kind: 'injection', variant: 'force_mcp' });
  });

  it('only lists connected servers', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({
      history,
      forceMcpEnabled: true,
      servers: [
        { name: 'github', status: 'connected', transport: 'stdio', toolCount: 5 },
        { name: 'broken', status: 'failed', transport: 'stdio', toolCount: 0, error: 'oops' },
      ],
    });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();

    const text = history[0]?.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    expect(text).toContain('github (5 tools)');
    expect(text).not.toContain('broken');
  });

  it('warns when no servers are connected', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({
      history,
      forceMcpEnabled: true,
      servers: [{ name: 'pending-one', status: 'pending', transport: 'stdio', toolCount: 0 }],
    });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();

    const text = history[0]?.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    expect(text).toContain('no MCP servers are currently connected');
  });

  it('does not re-inject while the flag stays on', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({
      history,
      forceMcpEnabled: true,
      servers: [{ name: 'github', status: 'connected', transport: 'stdio', toolCount: 5 }],
    });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();
    await injector.inject();
    await injector.inject();

    expect(history).toHaveLength(1);
  });

  it('injects an off reminder when the flag is disabled', async () => {
    const history: ContextMessage[] = [];
    const agent = forceMcpAgent({
      history,
      forceMcpEnabled: true,
      servers: [{ name: 'github', status: 'connected', transport: 'stdio', toolCount: 5 }],
    });
    const injector = new ForceMcpInjector(agent);

    await injector.inject();
    agent.forceMcpEnabled = false;
    await injector.inject();

    expect(history).toHaveLength(2);
    const offText = history[1]?.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    expect(offText).toContain('Force MCP mode is now off');
  });
});

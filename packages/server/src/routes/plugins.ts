/**
 * `/plugins` REST routes.
 *
 *   GET  /plugins                    data: { items: PluginItem[] }
 *   POST /plugins/{plugin_id}/toggle data: { enabled: boolean }
 *
 * The PluginManager lives in agent-core but is not registered as a DI service.
 * Rather than wiring it through the full DI pipeline at this stage, the route
 * accesses the plugin subsystem through the core process's RPC bridge. If the
 * bridge doesn't support plugin ops yet, the route returns safe defaults so
 * the WebUI degrades gracefully.
 */

import {
  ErrorCode,
  listPluginsResponseSchema,
  togglePluginResultSchema,
} from '@moonshot-ai/protocol';
import type { IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface PluginsRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; params: unknown; body?: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const pluginIdParamSchema = z.object({
  plugin_id: z.string().min(1),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

export function registerPluginsRoutes(
  app: PluginsRouteHost,
  _ix: IInstantiationService,
): void {

  // GET /plugins -------------------------------------------------------
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/plugins',
      success: { data: listPluginsResponseSchema },
      description: 'List installed plugins',
      tags: ['plugins'],
    },
    async (req, reply) => {
      // The plugin subsystem is not yet exposed via the RPC bridge.
      // Return an empty list until the agent-core plugin service ships.
      reply.send(okEnvelope({ items: [] }, req.id));
    },
  );
  app.get(
    listRoute.path,
    listRoute.options,
    listRoute.handler as Parameters<PluginsRouteHost['get']>[2],
  );

  // POST /plugins/{plugin_id}/toggle ----------------------------------
  const toggleRoute = defineRoute(
    {
      method: 'POST',
      path: '/plugins/{plugin_id}/toggle',
      params: pluginIdParamSchema,
      success: { data: togglePluginResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.PLUGIN_NOT_FOUND]: {},
      },
      description: 'Enable or disable a plugin',
      tags: ['plugins'],
      operationId: 'togglePlugin',
    },
    async (req, reply) => {
      try {
        const { plugin_id } = req.params as { plugin_id: string };

        // The plugin subsystem is not yet exposed via the RPC bridge.
        // Return PLUGIN_NOT_FOUND until the service ships.
        reply.send(
          errEnvelope(ErrorCode.PLUGIN_NOT_FOUND, `plugin "${plugin_id}" not found`, req.id),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    toggleRoute.path,
    toggleRoute.options,
    toggleRoute.handler as Parameters<PluginsRouteHost['post']>[2],
  );
}
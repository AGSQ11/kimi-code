/**
 * `/reload/*` REST routes.
 *
 *   POST /reload/session          → { reloaded: true }
 *   POST /reload/tui-config       → { reloaded: true }
 *   POST /reload/system-prompt    → { reloaded: true }
 *
 * Reload session config, TUI config, or system prompt. These are global
 * endpoints that trigger the core process to reload from disk.
 */

import {
  ErrorCode,
  reloadResultSchema,
} from '@moonshot-ai/protocol';
import { IConfigService, type IInstantiationService } from '@moonshot-ai/agent-core';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface ReloadRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerReloadRoutes(
  app: ReloadRouteHost,
  ix: IInstantiationService,
): void {

  // POST /reload/session ------------------------------------------------
  const reloadSessionRoute = defineRoute(
    {
      method: 'POST',
      path: '/reload/session',
      success: { data: reloadResultSchema },
      description: 'Reload session configuration from disk',
      tags: ['reload'],
    },
    async (req, reply) => {
      try {
        // Force a config re-read from disk
        const configService = ix.invokeFunction((a) => a.get(IConfigService));
        await configService.get();
        reply.send(okEnvelope({ reloaded: true as const }, req.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    reloadSessionRoute.path,
    reloadSessionRoute.options,
    reloadSessionRoute.handler as Parameters<ReloadRouteHost['post']>[2],
  );

  // POST /reload/tui-config ---------------------------------------------
  const reloadTuiConfigRoute = defineRoute(
    {
      method: 'POST',
      path: '/reload/tui-config',
      success: { data: reloadResultSchema },
      description: 'Reload TUI configuration from disk',
      tags: ['reload'],
    },
    async (req, reply) => {
      try {
        const configService = ix.invokeFunction((a) => a.get(IConfigService));
        await configService.get();
        reply.send(okEnvelope({ reloaded: true as const }, req.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    reloadTuiConfigRoute.path,
    reloadTuiConfigRoute.options,
    reloadTuiConfigRoute.handler as Parameters<ReloadRouteHost['post']>[2],
  );

  // POST /reload/system-prompt ------------------------------------------
  const reloadSystemPromptRoute = defineRoute(
    {
      method: 'POST',
      path: '/reload/system-prompt',
      success: { data: reloadResultSchema },
      description: 'Reload system prompt from disk',
      tags: ['reload'],
    },
    async (req, reply) => {
      try {
        const configService = ix.invokeFunction((a) => a.get(IConfigService));
        await configService.get();
        reply.send(okEnvelope({ reloaded: true as const }, req.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    reloadSystemPromptRoute.path,
    reloadSystemPromptRoute.options,
    reloadSystemPromptRoute.handler as Parameters<ReloadRouteHost['post']>[2],
  );
}
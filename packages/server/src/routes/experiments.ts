/**
 * `/experiments` REST routes.
 *
 *   GET  /experiments              data: { items: FeatureFlagItem[] }
 *   POST /experiments/{flag}       data: { enabled: boolean }
 *
 * Uses the process-global `FlagResolver` instance from agent-core. The GET
 * endpoint returns all flags with their current resolved state; the POST
 * endpoint toggles a flag by updating the config overrides on the global
 * resolver and persisting to the config file.
 */

import {
  ErrorCode,
  listExperimentsResponseSchema,
  toggleExperimentResultSchema,
} from '@moonshot-ai/protocol';
import { IConfigService, flags, type IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface ExperimentsRouteHost {
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

const flagParamSchema = z.object({
  flag: z.string().min(1),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

export function registerExperimentsRoutes(
  app: ExperimentsRouteHost,
  ix: IInstantiationService,
): void {

  // GET /experiments ----------------------------------------------------
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/experiments',
      success: { data: listExperimentsResponseSchema },
      description: 'List all experimental feature flags and their state',
      tags: ['experiments'],
    },
    async (req, reply) => {
      const allStates = flags.explainAll();
      const items = allStates.map((state) => ({
        id: state.id,
        title: state.title,
        description: state.description,
        enabled: state.enabled,
        source: state.source,
      }));
      reply.send(okEnvelope({ items }, req.id));
    },
  );
  app.get(
    listRoute.path,
    listRoute.options,
    listRoute.handler as Parameters<ExperimentsRouteHost['get']>[2],
  );

  // POST /experiments/{flag} --------------------------------------------
  const toggleRoute = defineRoute(
    {
      method: 'POST',
      path: '/experiments/{flag}',
      params: flagParamSchema,
      success: { data: toggleExperimentResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.EXPERIMENT_NOT_FOUND]: {},
      },
      description: 'Toggle an experimental feature flag',
      tags: ['experiments'],
      operationId: 'toggleExperiment',
    },
    async (req, reply) => {
      try {
        const { flag } = req.params as { flag: string };
        const current = flags.explain(flag as never);
        if (current === undefined) {
          reply.send(
            errEnvelope(ErrorCode.EXPERIMENT_NOT_FOUND, `experiment flag "${flag}" not found`, req.id),
          );
          return;
        }

        const newEnabled = !current.enabled;

        // Persist the toggle to the config file's [experimental] section
        try {
          const configService = ix.invokeFunction((a) => a.get(IConfigService));
          const config = await configService.get();
          const experimental = { ...(config.experimental ?? {}), [flag]: newEnabled };
          await configService.set({ experimental });
        } catch {
          // Config service may not be available; continue with in-memory toggle
        }

        // Update the in-memory resolver
        flags.setConfigOverrides({ [flag]: newEnabled });

        reply.send(okEnvelope({ enabled: newEnabled }, req.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    toggleRoute.path,
    toggleRoute.options,
    toggleRoute.handler as Parameters<ExperimentsRouteHost['post']>[2],
  );
}
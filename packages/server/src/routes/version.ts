/**
 * `GET /version` route handler.
 *
 * Returns the daemon's `version` and optional `git_hash`. This is a simple
 * server-info endpoint that does not touch DI services.
 */

import { versionResponseSchema } from '@moonshot-ai/protocol';
import { z } from 'zod';

import { okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { getServerVersion } from '../version';

interface RouteHost {
  get(
    path: string,
    options: { schema?: Record<string, unknown> },
    handler: (
      req: { id: string },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerVersionRoute(app: RouteHost): void {
  const route = defineRoute(
    {
      method: 'GET',
      path: '/version',
      success: { data: versionResponseSchema },
      description: 'Get the daemon version and git hash',
      tags: ['version'],
    },
    async (req, reply) => {
      const version = getServerVersion();
      // git_hash is optional - could be populated from build-time injection
      reply.send(okEnvelope({ version, git_hash: undefined }, req.id));
    },
  );
  app.get(route.path, route.options, route.handler as Parameters<RouteHost['get']>[2]);
}
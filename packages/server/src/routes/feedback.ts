/**
 * `/feedback` REST route.
 *
 *   POST /feedback  data: { submitted: true }
 *
 * Accepts user feedback (text + optional email). Currently stores to a local
 * log; a future iteration can POST to a remote feedback service.
 */

import {
  ErrorCode,
  submitFeedbackRequestSchema,
  submitFeedbackResultSchema,
} from '@moonshot-ai/protocol';
import { ILogService, type IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface FeedbackRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerFeedbackRoute(
  app: FeedbackRouteHost,
  ix: IInstantiationService,
): void {
  const route = defineRoute(
    {
      method: 'POST',
      path: '/feedback',
      body: submitFeedbackRequestSchema,
      success: { data: submitFeedbackResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
      },
      description: 'Submit user feedback',
      tags: ['feedback'],
    },
    async (req, reply) => {
      try {
        const body = req.body as { text: string; email?: string };

        // Log the feedback for now. A future service can POST to a backend.
        const log = ix.invokeFunction((a) => a.get(ILogService));
        log.info({ text: body.text.slice(0, 200), email: body.email ?? null }, '[feedback]');

        reply.send(okEnvelope({ submitted: true as const }, req.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    route.path,
    route.options,
    route.handler as Parameters<FeedbackRouteHost['post']>[2],
  );
}

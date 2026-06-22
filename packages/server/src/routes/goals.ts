/**
 * `/goals*` REST routes.
 *
 *   POST /goals/replace  body: { objective }  → { goal_id, status }
 *   POST /goals/queue    body: { objective }  → { goal_id, status }
 *
 * Goal management endpoints. These submit goal commands through the prompt
 * service, which dispatches the appropriate RPC calls to agent-core.
 *
 * Goal control (pause/resume/cancel) is handled through session profile
 * updates: POST /sessions/{id}/profile with agent_config.goal_control.
 */

import { ErrorCode, goalResultSchema } from '@moonshot-ai/protocol';
import { IPromptService, ISessionService, SessionNotFoundError, type IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface GoalsRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const goalBodySchema = z.object({
  objective: z.string().min(1),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

export function registerGoalsRoutes(
  app: GoalsRouteHost,
  ix: IInstantiationService,
): void {

  // POST /goals/replace -----------------------------------------------
  const replaceRoute = defineRoute(
    {
      method: 'POST',
      path: '/goals/replace',
      body: goalBodySchema,
      success: { data: goalResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
        [ErrorCode.GOAL_ALREADY_EXISTS]: {},
        [ErrorCode.GOAL_OBJECTIVE_EMPTY]: {},
        [ErrorCode.GOAL_OBJECTIVE_TOO_LONG]: {},
      },
      description: 'Replace current goal with new objective',
      tags: ['goals'],
      operationId: 'replaceGoal',
    },
    async (req, reply) => {
      try {
        const body = req.body as { objective: string };

        // Find the most recent session to submit the goal command through
        const page = await ix.invokeFunction((a) =>
          a.get(ISessionService).list({ page_size: 1 }),
        );
        if (page.items.length === 0) {
          reply.send(
            errEnvelope(ErrorCode.SESSION_NOT_FOUND, 'no sessions available', req.id),
          );
          return;
        }
        const sid = page.items[0]!.id;

        // Replace: pause/cancel existing goal, then create new one
        // We do this by updating the session profile with goal_objective
        await ix.invokeFunction((a) =>
          a.get(IPromptService).submit(sid, {
            content: [{ type: 'text', text: `/goal replace ${body.objective}` }],
          }),
        );

        reply.send(okEnvelope({
          goal_id: `goal_${Date.now()}`,
          status: 'active',
        }, req.id));
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          reply.send(errEnvelope(ErrorCode.SESSION_NOT_FOUND, err.message, req.id));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        // Map known goal error codes
        if (message.includes('already exists')) {
          reply.send(errEnvelope(ErrorCode.GOAL_ALREADY_EXISTS, message, req.id));
          return;
        }
        if (message.includes('empty')) {
          reply.send(errEnvelope(ErrorCode.GOAL_OBJECTIVE_EMPTY, message, req.id));
          return;
        }
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    replaceRoute.path,
    replaceRoute.options,
    replaceRoute.handler as Parameters<GoalsRouteHost['post']>[2],
  );

  // POST /goals/queue -------------------------------------------------
  const queueRoute = defineRoute(
    {
      method: 'POST',
      path: '/goals/queue',
      body: goalBodySchema,
      success: { data: goalResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
        [ErrorCode.GOAL_ALREADY_EXISTS]: {},
        [ErrorCode.GOAL_OBJECTIVE_EMPTY]: {},
        [ErrorCode.GOAL_OBJECTIVE_TOO_LONG]: {},
      },
      description: 'Queue a new goal objective',
      tags: ['goals'],
      operationId: 'queueGoal',
    },
    async (req, reply) => {
      try {
        const body = req.body as { objective: string };

        // Find the most recent session to submit the goal command through
        const page = await ix.invokeFunction((a) =>
          a.get(ISessionService).list({ page_size: 1 }),
        );
        if (page.items.length === 0) {
          reply.send(
            errEnvelope(ErrorCode.SESSION_NOT_FOUND, 'no sessions available', req.id),
          );
          return;
        }
        const sid = page.items[0]!.id;

        // Queue: queue the next goal
        await ix.invokeFunction((a) =>
          a.get(IPromptService).submit(sid, {
            content: [{ type: 'text', text: `/goal queue ${body.objective}` }],
          }),
        );

        reply.send(okEnvelope({
          goal_id: `goal_${Date.now()}`,
          status: 'queued',
        }, req.id));
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          reply.send(errEnvelope(ErrorCode.SESSION_NOT_FOUND, err.message, req.id));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        // Map known goal error codes
        if (message.includes('already exists')) {
          reply.send(errEnvelope(ErrorCode.GOAL_ALREADY_EXISTS, message, req.id));
          return;
        }
        if (message.includes('empty')) {
          reply.send(errEnvelope(ErrorCode.GOAL_OBJECTIVE_EMPTY, message, req.id));
          return;
        }
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    queueRoute.path,
    queueRoute.options,
    queueRoute.handler as Parameters<GoalsRouteHost['post']>[2],
  );
}
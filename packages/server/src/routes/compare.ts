/**
 * `/compare` REST route.
 *
 *   POST /compare  body: { model_b, prompt, session_id? }
 *                   → { model_a, model_b, result_a, result_b }
 *
 * Submits the same prompt to two different models and returns the results
 * side by side for A/B comparison.
 */

import { ErrorCode, compareResultSchema } from '@moonshot-ai/protocol';
import { IPromptService, ISessionService, SessionNotFoundError, type IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface CompareRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const compareBodySchema = z.object({
  model_b: z.string().min(1),
  prompt: z.string().min(1),
  session_id: z.string().min(1).optional(),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

export function registerCompareRoute(
  app: CompareRouteHost,
  ix: IInstantiationService,
): void {
  const route = defineRoute(
    {
      method: 'POST',
      path: '/compare',
      body: compareBodySchema,
      success: { data: compareResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Start A/B comparison with two models',
      tags: ['compare'],
      operationId: 'startCompare',
    },
    async (req, reply) => {
      try {
        const body = req.body as { model_b: string; prompt: string; session_id?: string };

        // Find or use the session
        let sid = body.session_id;
        if (sid === undefined) {
          const page = await ix.invokeFunction((a) =>
            a.get(ISessionService).list({ page_size: 1 }),
          );
          if (page.items.length === 0) {
            reply.send(
              errEnvelope(ErrorCode.SESSION_NOT_FOUND, 'no sessions available', req.id),
            );
            return;
          }
          sid = page.items[0]!.id;
        }

        // Get the session to find current model (model A)
        const session = await ix.invokeFunction((a) =>
          a.get(ISessionService).get(sid!),
        );
        const modelA = session.agent_config.model || 'default';

        // Submit prompt with model A (normal)
        const resultA = await ix.invokeFunction((a) =>
          a.get(IPromptService).submit(sid!, {
            content: [{ type: 'text', text: body.prompt }],
            model: modelA,
          }),
        );

        // Submit prompt with model B
        const resultB = await ix.invokeFunction((a) =>
          a.get(IPromptService).submit(sid!, {
            content: [{ type: 'text', text: body.prompt }],
            model: body.model_b,
          }),
        );

        reply.send(okEnvelope({
          model_a: modelA,
          model_b: body.model_b,
          result_a: resultA.prompt_id,
          result_b: resultB.prompt_id,
        }, req.id));
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          reply.send(errEnvelope(ErrorCode.SESSION_NOT_FOUND, err.message, req.id));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.post(
    route.path,
    route.options,
    route.handler as Parameters<CompareRouteHost['post']>[2],
  );
}
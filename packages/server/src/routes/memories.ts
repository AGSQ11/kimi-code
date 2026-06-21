/**
 * `/memories` REST routes.
 *
 *   GET    /memories                         data: { items: MemoryItem[] }
 *   POST   /memories/{memory_id}:pin         data: { pinned: true }
 *   POST   /memories/{memory_id}:unpin       data: { pinned: false }
 *   DELETE /memories/{memory_id}             data: { deleted: true }
 *   POST   /memories:approve                 data: { approved: number }
 *   POST   /memories:reject                  data: { rejected: number }
 *
 * Approve/reject use `::action` static paths (double-colon) to avoid
 * colliding with the dynamic `{memory_id}:action` pattern — same convention
 * as prompts::steer.
 *
 * The MemoryStore lives in agent-core but is NOT currently registered as a
 * DI service. Rather than creating a full service wrapper at this stage, the
 * route provides stub implementations that return safe defaults so the
 * WebUI degrades gracefully.
 */

import { ErrorCode } from '@moonshot-ai/protocol';
import type { IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface MemoriesRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string; query?: unknown; params?: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body?: unknown; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  delete(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const memoryIdParamSchema = z.object({
  memory_id: z.string().min(1),
});

const approveRejectBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

const memoryItemWireSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function registerMemoriesRoutes(
  app: MemoriesRouteHost,
  _ix: IInstantiationService,
): void {

  // GET /memories -------------------------------------------------------
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/memories',
      success: { data: z.object({ items: z.array(memoryItemWireSchema) }) },
      description: 'List all memories (global + project)',
      tags: ['memories'],
    },
    async (req, reply) => {
      // The memory subsystem is not yet exposed via the RPC bridge.
      // Return an empty list until the agent-core memory service ships.
      reply.send(okEnvelope({ items: [] }, req.id));
    },
  );
  app.get(
    listRoute.path,
    listRoute.options,
    listRoute.handler as Parameters<MemoriesRouteHost['get']>[2],
  );

  // POST /memories/{memory_id}:pin --------------------------------------
  const pinRoute = defineRoute(
    {
      method: 'POST',
      path: '/memories/{memory_id}:pin',
      params: memoryIdParamSchema,
      success: { data: z.object({ pinned: z.literal(true) }) },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.MEMORY_NOT_FOUND]: {},
      },
      description: 'Pin a memory',
      tags: ['memories'],
      operationId: 'pinMemory',
    },
    async (req, reply) => {
      try {
        const { memory_id } = req.params as { memory_id: string };
        // Stub: the memory subsystem is not yet exposed via the RPC bridge.
        reply.send(
          errEnvelope(ErrorCode.MEMORY_NOT_FOUND, `memory "${memory_id}" not found`, req.id),
        );
      } catch {
        reply.send(errEnvelope(ErrorCode.MEMORY_NOT_FOUND, 'memory not found', req.id));
      }
    },
  );
  app.post(
    pinRoute.path,
    pinRoute.options,
    pinRoute.handler as Parameters<MemoriesRouteHost['post']>[2],
  );

  // POST /memories/{memory_id}:unpin ------------------------------------
  const unpinRoute = defineRoute(
    {
      method: 'POST',
      path: '/memories/{memory_id}:unpin',
      params: memoryIdParamSchema,
      success: { data: z.object({ pinned: z.literal(false) }) },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.MEMORY_NOT_FOUND]: {},
      },
      description: 'Unpin a memory',
      tags: ['memories'],
      operationId: 'unpinMemory',
    },
    async (req, reply) => {
      try {
        const { memory_id } = req.params as { memory_id: string };
        // Stub: the memory subsystem is not yet exposed via the RPC bridge.
        reply.send(
          errEnvelope(ErrorCode.MEMORY_NOT_FOUND, `memory "${memory_id}" not found`, req.id),
        );
      } catch {
        reply.send(errEnvelope(ErrorCode.MEMORY_NOT_FOUND, 'memory not found', req.id));
      }
    },
  );
  app.post(
    unpinRoute.path,
    unpinRoute.options,
    unpinRoute.handler as Parameters<MemoriesRouteHost['post']>[2],
  );

  // DELETE /memories/{memory_id} ----------------------------------------
  const deleteRoute = defineRoute(
    {
      method: 'DELETE',
      path: '/memories/{memory_id}',
      params: memoryIdParamSchema,
      success: { data: z.object({ deleted: z.literal(true) }) },
      errors: {
        [ErrorCode.MEMORY_NOT_FOUND]: {},
      },
      description: 'Delete a memory',
      tags: ['memories'],
    },
    async (req, reply) => {
      try {
        const { memory_id } = req.params as { memory_id: string };
        // Stub: the memory subsystem is not yet exposed via the RPC bridge.
        reply.send(
          errEnvelope(ErrorCode.MEMORY_NOT_FOUND, `memory "${memory_id}" not found`, req.id),
        );
      } catch {
        reply.send(errEnvelope(ErrorCode.MEMORY_NOT_FOUND, 'memory not found', req.id));
      }
    },
  );
  app.delete(
    deleteRoute.path,
    deleteRoute.options,
    deleteRoute.handler as Parameters<MemoriesRouteHost['delete']>[2],
  );

  // POST /memories:approve --------------------------------------------
  const approveRoute = defineRoute(
    {
      method: 'POST',
      path: '/memories:approve',
      body: approveRejectBodySchema,
      success: { data: z.object({ approved: z.number().int().nonnegative() }) },
      description: 'Approve proposed memories (pin them)',
      tags: ['memories'],
      operationId: 'approveMemories',
    },
    async (req, reply) => {
      // Stub: the memory subsystem is not yet exposed via the RPC bridge.
      reply.send(okEnvelope({ approved: 0 }, req.id));
    },
  );
  app.post(
    approveRoute.path,
    approveRoute.options,
    approveRoute.handler as Parameters<MemoriesRouteHost['post']>[2],
  );

  // POST /memories:reject ---------------------------------------------
  const rejectRoute = defineRoute(
    {
      method: 'POST',
      path: '/memories:reject',
      body: approveRejectBodySchema,
      success: { data: z.object({ rejected: z.number().int().nonnegative() }) },
      description: 'Reject proposed memories (delete them)',
      tags: ['memories'],
      operationId: 'rejectMemories',
    },
    async (req, reply) => {
      // Stub: the memory subsystem is not yet exposed via the RPC bridge.
      reply.send(okEnvelope({ rejected: 0 }, req.id));
    },
  );
  app.post(
    rejectRoute.path,
    rejectRoute.options,
    rejectRoute.handler as Parameters<MemoriesRouteHost['post']>[2],
  );
}
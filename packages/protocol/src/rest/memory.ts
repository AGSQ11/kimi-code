/**
 * Memory REST schemas.
 *
 *   GET    /memories                    → { items: Memory[] }
 *   POST   /memories/:id/pin            → { pinned: true }
 *   POST   /memories/:id/unpin          → { pinned: false }
 *   DELETE /memories/:id                → { deleted: true }
 *   POST   /memories/approve            → { approved: count }
 *   POST   /memories/reject             → { rejected: count }
 */
import { z } from 'zod';

export const memoryItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const listMemoriesResponseSchema = z.object({
  items: z.array(memoryItemSchema),
});

export const memoryIdParamSchema = z.object({
  memory_id: z.string().min(1),
});

export const pinMemoryResultSchema = z.object({
  pinned: z.boolean(),
});

export const deleteMemoryResultSchema = z.object({
  deleted: z.literal(true),
});

export const approveMemoriesRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const approveMemoriesResultSchema = z.object({
  approved: z.number().int().nonnegative(),
});

export const rejectMemoriesRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const rejectMemoriesResultSchema = z.object({
  rejected: z.number().int().nonnegative(),
});

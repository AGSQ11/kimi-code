/**
 * Goals REST schemas.
 *
 *   POST /goals:replace  body: { objective }  → { goal_id, status }
 *   POST /goals:queue    body: { objective }  → { goal_id, status }
 *
 * Goal management endpoints: replace or queue a goal objective.
 */
import { z } from 'zod';

export const goalRequestSchema = z.object({
  objective: z.string().min(1),
});

export type GoalRequest = z.infer<typeof goalRequestSchema>;

export const goalResultSchema = z.object({
  goal_id: z.string(),
  status: z.string(),
});

export type GoalResult = z.infer<typeof goalResultSchema>;

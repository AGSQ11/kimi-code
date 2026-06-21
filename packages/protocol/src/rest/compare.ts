/**
 * Compare REST schemas.
 *
 *   POST /compare  body: { model_b, prompt, session_id? }
 *                   → { model_a, model_b, result_a, result_b }
 *
 * A/B comparison: submit the same prompt to two different models.
 */
import { z } from 'zod';

export const compareRequestSchema = z.object({
  model_b: z.string().min(1),
  prompt: z.string().min(1),
  session_id: z.string().min(1).optional(),
});

export type CompareRequest = z.infer<typeof compareRequestSchema>;

export const compareResultSchema = z.object({
  model_a: z.string(),
  model_b: z.string(),
  result_a: z.string(),
  result_b: z.string(),
});

export type CompareResult = z.infer<typeof compareResultSchema>;

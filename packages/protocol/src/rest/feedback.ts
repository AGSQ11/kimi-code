/**
 * Feedback REST schema.
 *
 *   POST /feedback  → { submitted: true }
 */
import { z } from 'zod';

export const submitFeedbackRequestSchema = z.object({
  text: z.string().min(1),
  email: z.string().email().optional(),
});

export const submitFeedbackResultSchema = z.object({
  submitted: z.literal(true),
});

/**
 * Experiments / feature-flag REST schemas.
 *
 *   GET  /experiments              → { items: FeatureFlag[] }
 *   POST /experiments/:flag        → { enabled: boolean }
 */
import { z } from 'zod';

export const featureFlagItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  source: z.string(),
});

export type FeatureFlagItem = z.infer<typeof featureFlagItemSchema>;

export const listExperimentsResponseSchema = z.object({
  items: z.array(featureFlagItemSchema),
});

export const flagParamSchema = z.object({
  flag: z.string().min(1),
});

export const toggleExperimentResultSchema = z.object({
  enabled: z.boolean(),
});

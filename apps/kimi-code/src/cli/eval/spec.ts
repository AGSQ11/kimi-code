import { readFile } from 'node:fs/promises';
import { load as loadYaml } from 'js-yaml';
import { basename, extname, isAbsolute, resolve } from 'pathe';
import { z } from 'zod';

import type { EvalInlineOptions, EvalPrompt, EvalSpec, EvalVariation } from './types';

const generationKwargsSchema = z.record(z.string(), z.number());

const evalPromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).optional(),
  file: z.string().min(1).optional(),
});

const evalVariationSchema = z.object({
  id: z.string().min(1),
  generationKwargs: generationKwargsSchema.optional(),
  systemPrompt: z.string().optional(),
});

const evalCostRatesSchema = z.object({
  inputPer1k: z.number().nonnegative(),
  outputPer1k: z.number().nonnegative(),
  cachedInputPer1k: z.number().nonnegative().optional(),
});

const evalMetricSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['substring', 'length']),
  value: z.string().optional(),
  aggregate: z.enum(['mean', 'sum', 'min', 'max']).optional(),
});

const evalSpecSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  name: z.string().min(1),
  description: z.string().optional(),
  telemetry: z.boolean().default(false),
  suiteTimeout: z.number().positive().optional(),
  timeout: z.number().positive().default(120),
  samples: z.number().int().nonnegative().default(1),
  executeTools: z.boolean().default(false),
  prompts: z.array(evalPromptSchema).min(1),
  models: z.array(z.string().min(1)).min(1),
  variations: z.array(evalVariationSchema).min(1),
  cost: z.record(z.string().min(1), evalCostRatesSchema).optional(),
  evaluation: z
    .object({
      metrics: z.array(evalMetricSchema).optional(),
    })
    .optional(),
});

export type RawEvalSpec = z.input<typeof evalSpecSchema>;

export function parseEvalSpec(raw: unknown): EvalSpec {
  const parsed = evalSpecSchema.parse(raw);
  return parsed as EvalSpec;
}

export async function loadEvalSpec(
  specPath: string | undefined,
  inline: EvalInlineOptions,
  cwd: string,
): Promise<EvalSpec> {
  let base: RawEvalSpec;
  if (specPath !== undefined) {
    const absolutePath = isAbsolute(specPath) ? specPath : resolve(cwd, specPath);
    const content = await readFile(absolutePath, 'utf-8');
    const parsed = parseSpecContent(content, absolutePath);
    base = parsed as RawEvalSpec;
  } else {
    base = buildInlineSpec(inline, cwd);
  }

  const merged: RawEvalSpec = {
    ...base,
    ...(inline.samples !== undefined ? { samples: inline.samples } : {}),
    ...(inline.timeout !== undefined ? { timeout: inline.timeout } : {}),
    ...(inline.suiteTimeout !== undefined ? { suiteTimeout: inline.suiteTimeout } : {}),
  };

  return parseEvalSpec(merged);
}

function parseSpecContent(content: string, path: string): unknown {
  const ext = extname(path).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return loadYaml(content);
  }
  if (ext === '.json') {
    return JSON.parse(content) as unknown;
  }
  // Best-effort: try JSON first, then YAML.
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return loadYaml(content);
  }
}

function buildInlineSpec(inline: EvalInlineOptions, cwd: string): RawEvalSpec {
  if (inline.prompts === undefined || inline.prompts.length === 0) {
    throw new Error('Either provide a spec file or at least one --prompts value.');
  }
  if (inline.models === undefined || inline.models.length === 0) {
    throw new Error('Either provide a spec file or at least one --models value.');
  }

  const prompts: EvalPrompt[] = inline.prompts.map((path) => ({
    id: basename(path, extname(path)),
    file: isAbsolute(path) ? path : resolve(cwd, path),
  }));

  const variations: EvalVariation[] = [{ id: 'default' }];

  return {
    name: 'Inline eval',
    prompts,
    models: inline.models,
    variations,
  };
}

export function buildRunMatrix(spec: EvalSpec): Array<{
  runId: string;
  promptId: string;
  model: string;
  variationId: string;
  sampleIndex: number;
}> {
  const runs: ReturnType<typeof buildRunMatrix> = [];
  for (const prompt of spec.prompts) {
    for (const model of spec.models) {
      for (const variation of spec.variations) {
        for (let sampleIndex = 0; sampleIndex < spec.samples; sampleIndex++) {
          runs.push({
            runId: `r${runs.length}`,
            promptId: prompt.id,
            model,
            variationId: variation.id,
            sampleIndex,
          });
        }
      }
    }
  }
  return runs;
}

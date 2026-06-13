import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRunMatrix, loadEvalSpec, parseEvalSpec } from '#/cli/eval/spec';
import type { EvalSpec } from '#/cli/eval/types';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-eval-'));
  tempDirs.push(dir);
  return dir;
}

describe('parseEvalSpec', () => {
  it('accepts a minimal valid spec', () => {
    const spec = parseEvalSpec({
      name: 'Test',
      prompts: [{ id: 'p1', text: 'hello' }],
      models: ['m1'],
      variations: [{ id: 'v1' }],
    });

    expect(spec.name).toBe('Test');
    expect(spec.timeout).toBe(120);
    expect(spec.samples).toBe(1);
    expect(spec.executeTools).toBe(false);
    expect(spec.telemetry).toBe(false);
  });

  it('rejects a spec without prompts', () => {
    expect(() =>
      parseEvalSpec({
        name: 'Test',
        prompts: [],
        models: ['m1'],
        variations: [{ id: 'v1' }],
      }),
    ).toThrow();
  });

  it('rejects negative timeout', () => {
    expect(() =>
      parseEvalSpec({
        name: 'Test',
        prompts: [{ id: 'p1', text: 'hello' }],
        models: ['m1'],
        variations: [{ id: 'v1' }],
        timeout: -1,
      }),
    ).toThrow();
  });
});

describe('loadEvalSpec', () => {
  it('loads a JSON spec file', async () => {
    const dir = await tempDir();
    const path = join(dir, 'spec.json');
    await writeFile(
      path,
      JSON.stringify({
        name: 'JSON spec',
        prompts: [{ id: 'p1', text: 'hello' }],
        models: ['m1'],
        variations: [{ id: 'v1' }],
      }),
      'utf-8',
    );

    const spec = await loadEvalSpec(path, {}, dir);
    expect(spec.name).toBe('JSON spec');
  });

  it('loads a YAML spec file', async () => {
    const dir = await tempDir();
    const path = join(dir, 'spec.yaml');
    await writeFile(
      path,
      `name: YAML spec
prompts:
  - id: p1
    text: hello
models:
  - m1
variations:
  - id: v1
`,
      'utf-8',
    );

    const spec = await loadEvalSpec(path, {}, dir);
    expect(spec.name).toBe('YAML spec');
  });

  it('merges inline options', async () => {
    const dir = await tempDir();
    const path = join(dir, 'spec.json');
    await writeFile(
      path,
      JSON.stringify({
        name: 'JSON spec',
        prompts: [{ id: 'p1', text: 'hello' }],
        models: ['m1'],
        variations: [{ id: 'v1' }],
        samples: 1,
      }),
      'utf-8',
    );

    const spec = await loadEvalSpec(path, { samples: 5, timeout: 30 }, dir);
    expect(spec.samples).toBe(5);
    expect(spec.timeout).toBe(30);
  });

  it('builds an inline spec from prompts and models', async () => {
    const dir = await tempDir();
    const promptPath = join(dir, 'prompt.md');
    await writeFile(promptPath, 'inline prompt', 'utf-8');

    const spec = await loadEvalSpec(undefined, { prompts: [promptPath], models: ['m1'] }, dir);
    expect(spec.name).toBe('Inline eval');
    expect(spec.prompts).toHaveLength(1);
    expect(spec.prompts[0]?.id).toBe('prompt');
    expect(spec.models).toEqual(['m1']);
  });
});

describe('buildRunMatrix', () => {
  it('expands prompts × models × variations × samples', () => {
    const spec: EvalSpec = {
      version: '1.0',
      name: 'Matrix',
      telemetry: false,
      timeout: 60,
      samples: 2,
      executeTools: false,
      prompts: [{ id: 'p1' }, { id: 'p2' }],
      models: ['m1', 'm2'],
      variations: [{ id: 'v1' }, { id: 'v2' }],
    };

    const matrix = buildRunMatrix(spec);

    expect(matrix).toHaveLength(2 * 2 * 2 * 2);
    expect(matrix.map((r) => r.runId)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15']);
    const first = matrix[0];
    expect(first).toMatchObject({ promptId: 'p1', model: 'm1', variationId: 'v1', sampleIndex: 0 });
  });
});

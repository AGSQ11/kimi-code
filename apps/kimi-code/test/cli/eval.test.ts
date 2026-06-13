import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, expect, it, vi } from 'vitest';

import { createProgram } from '#/cli/commands';
import { handleEval, registerEvalCommand, type EvalDeps } from '#/cli/sub/eval';

describe('registerEvalCommand', () => {
  it('registers the eval subcommand', () => {
    const program = createProgram('0.0.0', () => {}, () => {});

    const evalCmd = program.commands.find((cmd) => cmd.name() === 'eval');
    expect(evalCmd).toBeDefined();
  });
});

describe('handleEval', () => {
  it('writes a JSON report to the output path', async () => {
    const promptPath = join(tmpdir(), 'kc-eval-prompt.md');
    await writeFile(promptPath, 'Say hello.');

    const written: Array<{ path: string; content: string }> = [];
    const deps = createFakeDeps({
      writeFile: async (path, content) => {
        written.push({ path, content });
      },
    });

    await handleEval(
      deps,
      undefined,
      {
        prompts: [promptPath],
        models: ['m1'],
        output: 'report.json',
      },
    );

    expect(written).toHaveLength(1);
    expect(written[0]?.path).toMatch(/report\.json$/);
    const parsed = JSON.parse(written[0]?.content ?? '{}');
    expect(parsed.summary.totalRuns).toBe(1);
    expect(parsed.spec.name).toBe('Inline eval');
  });

  it('refuses executeTools without --yes', async () => {
    const customExit = ((code: number) => {
      throw new Error(`exit ${code}`);
    }) as EvalDeps['exit'];
    const deps = createFakeDeps({ exit: customExit });

    await expect(
      handleEval(deps, 'spec.yaml', { yes: false }),
    ).rejects.toThrow('exit 1');
  });
});

function createFakeDeps(overrides: Partial<EvalDeps> = {}): EvalDeps {
  let eventHandler: ((event: Record<string, unknown>) => void) | undefined;
  const session = {
    id: 'ses-eval',
    setModel: vi.fn().mockResolvedValue(undefined),
    setGenerationKwargs: vi.fn().mockResolvedValue(undefined),
    setSystemPrompt: vi.fn().mockResolvedValue(undefined),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    onEvent: vi.fn((handler: (event: Record<string, unknown>) => void) => {
      eventHandler = handler;
      return () => {};
    }),
    prompt: vi.fn().mockImplementation(async () => {
      eventHandler?.({ type: 'turn.ended', reason: 'completed' });
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    createHarness: vi.fn(
      () =>
        ({
          createSession: vi.fn().mockResolvedValue(session),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as EvalDeps['createHarness'] extends () => infer R ? R : never,
    ),
    initializeTelemetry: vi.fn().mockResolvedValue(undefined),
    shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    detectInstallSource: vi.fn().mockResolvedValue('test'),
    version: '0.0.0-test',
    cwd: () => tmpdir(),
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
    exit: vi.fn((code: number) => {
      throw new Error(`exit ${code}`);
    }) as EvalDeps['exit'],
    ...overrides,
  };
}

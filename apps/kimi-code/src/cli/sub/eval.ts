import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'pathe';
import type { Command } from 'commander';

import {
  setTelemetryContext,
  shutdownTelemetry,
  track,
  withTelemetryContext,
} from '@moonshot-ai/kimi-telemetry';
import {
  createKimiHarness,
  type KimiHarness,
  type TelemetryClient,
} from '@moonshot-ai/kimi-code-sdk';

import { CLI_SHUTDOWN_TIMEOUT_MS, CLI_UI_MODE } from '#/constant/app';
import { createCliTelemetryBootstrap, initializeCliTelemetry } from '#/cli/telemetry';
import { detectInstallSource } from '#/cli/update/source';
import { createKimiCodeHostIdentity } from '#/cli/version';
import { loadEvalSpec } from '#/cli/eval/spec';
import { reportToJson, reportToMarkdown } from '#/cli/eval/reporter';
import { runEvalSuite } from '#/cli/eval/runner';
import type { EvalInlineOptions, EvalSpec, EvalSuiteResult } from '#/cli/eval/types';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface EvalDeps {
  readonly createHarness: () => KimiHarness;
  readonly initializeTelemetry: (harness: KimiHarness) => Promise<void>;
  readonly shutdownTelemetry: () => Promise<void>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly detectInstallSource: () => Promise<string>;
  readonly version: string;
  readonly cwd: () => string;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
}

export interface EvalCommandOptions {
  readonly prompts?: string[];
  readonly models?: string[];
  readonly output?: string;
  readonly samples?: number;
  readonly timeout?: number;
  readonly suiteTimeout?: number;
  readonly yes?: boolean;
}

export async function handleEval(
  deps: EvalDeps,
  specPath: string | undefined,
  options: EvalCommandOptions,
): Promise<void> {
  const inlineOptions: EvalInlineOptions = {
    prompts: options.prompts,
    models: options.models,
    output: options.output,
    samples: options.samples,
    timeout: options.timeout,
    suiteTimeout: options.suiteTimeout,
  };

  let spec: EvalSpec;
  try {
    spec = await loadEvalSpec(specPath, inlineOptions, deps.cwd());
  } catch (error) {
    deps.stderr.write(`Failed to load eval spec: ${errorMessage(error)}\n`);
    deps.exit(1);
  }

  if (spec.executeTools && options.yes !== true) {
    deps.stderr.write(
      'Warning: this eval has executeTools: true. Tools will be auto-approved. ' +
        'Pass --yes to confirm, or set executeTools: false to only capture tool-call plans.\n',
    );
    deps.exit(1);
  }

  const harness = deps.createHarness();
  try {
    if (spec.telemetry) {
      await deps.initializeTelemetry(harness);
    }

    const result = await runEvalSuite(
      {
        harness,
        now: () => Date.now(),
        setTimeout,
        clearTimeout,
        stdout: deps.stdout,
      },
      spec,
    );

    const output = formatOutput(result, options.output);
    if (options.output !== undefined) {
      const outputPath = isAbsolute(options.output) ? options.output : resolve(deps.cwd(), options.output);
      await deps.writeFile(outputPath, output);
      deps.stdout.write(`Report written to ${outputPath}\n`);
    } else {
      deps.stdout.write(output);
      deps.stdout.write('\n');
    }

    const failures = result.summary.failed + result.summary.timedOut;
    if (failures > 0) {
      deps.exit(1);
    }
  } catch (error) {
    deps.stderr.write(`Eval failed: ${errorMessage(error)}\n`);
    deps.exit(1);
  } finally {
    await harness.close().catch(() => {});
    if (spec.telemetry) {
      await deps.shutdownTelemetry();
    }
  }
}

function formatOutput(result: EvalSuiteResult, outputPath: string | undefined): string {
  const format = inferOutputFormat(outputPath);
  if (format === 'md') {
    return reportToMarkdown(result);
  }
  return reportToJson(result);
}

function inferOutputFormat(outputPath: string | undefined): 'json' | 'md' {
  if (outputPath === undefined) return 'json';
  const ext = outputPath.toLowerCase();
  if (ext.endsWith('.md') || ext.endsWith('.markdown')) return 'md';
  return 'json';
}

export function registerEvalCommand(parent: Command, deps?: Partial<EvalDeps>): void {
  parent
    .command('eval')
    .description('Run a prompt/model/variation benchmark and emit a comparison report.')
    .argument('[spec]', 'Path to a YAML/JSON eval spec file.')
    .option(
      '-p, --prompts <paths...>',
      'Inline prompt file paths. Requires --models when no spec file is given.',
    )
    .option(
      '-m, --models <models...>',
      'Inline model aliases. Requires --prompts when no spec file is given.',
    )
    .option('-o, --output <path>', 'Output report path (.json or .md). Defaults to stdout JSON.')
    .option('--samples <n>', 'Override number of samples per combination.', parsePositiveInt)
    .option('--timeout <seconds>', 'Override per-run timeout.', parsePositiveInt)
    .option('--suite-timeout <seconds>', 'Override suite timeout.', parsePositiveInt)
    .option('-y, --yes', 'Confirm executeTools: true.')
    .action(async (specPath: string | undefined, options: EvalCommandOptions) => {
      await handleEval(createDefaultEvalDeps(deps), specPath, options);
    });
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got '${value}'.`);
  }
  return parsed;
}

function createDefaultEvalDeps(overrides: Partial<EvalDeps> = {}): EvalDeps {
  let harness: KimiHarness | undefined;
  let telemetryBootstrap: ReturnType<typeof createCliTelemetryBootstrap> | undefined;
  let telemetryInitialized = false;
  const identity = createKimiCodeHostIdentity();
  const telemetryClient: TelemetryClient = {
    track,
    withContext: withTelemetryContext,
    setContext: setTelemetryContext,
  };
  const getTelemetryBootstrap = (): ReturnType<typeof createCliTelemetryBootstrap> => {
    telemetryBootstrap ??= createCliTelemetryBootstrap();
    return telemetryBootstrap;
  };
  return {
    createHarness:
      overrides.createHarness ??
      (() => {
        const currentTelemetryBootstrap = getTelemetryBootstrap();
        harness ??= createKimiHarness({
          homeDir: currentTelemetryBootstrap.homeDir,
          identity,
          uiMode: CLI_UI_MODE,
          telemetry: telemetryClient,
        });
        return harness;
      }),
    initializeTelemetry:
      overrides.initializeTelemetry ??
      (async (currentHarness) => {
        if (telemetryInitialized) return;
        const currentTelemetryBootstrap = getTelemetryBootstrap();
        await currentHarness.ensureConfigFile();
        const config = await currentHarness.getConfig();
        initializeCliTelemetry({
          harness: currentHarness,
          bootstrap: currentTelemetryBootstrap,
          config,
          version: identity.version,
          uiMode: CLI_UI_MODE,
        });
        telemetryInitialized = true;
      }),
    shutdownTelemetry:
      overrides.shutdownTelemetry ??
      (async () => {
        if (!telemetryInitialized) return;
        await shutdownTelemetry({ timeoutMs: CLI_SHUTDOWN_TIMEOUT_MS });
      }),
    writeFile: overrides.writeFile ?? ((path, content) => writeFile(path, content, 'utf-8')),
    detectInstallSource: overrides.detectInstallSource ?? detectInstallSource,
    version: overrides.version ?? identity.version,
    cwd: overrides.cwd ?? (() => process.cwd()),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    exit: overrides.exit ?? ((code: number) => process.exit(code)),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface EvalPrompt {
  id: string;
  text?: string;
  file?: string;
}

export interface EvalVariation {
  id: string;
  generationKwargs?: Record<string, number>;
  systemPrompt?: string;
}

export interface EvalCostRates {
  inputPer1k: number;
  outputPer1k: number;
  cachedInputPer1k?: number;
}

export interface EvalMetric {
  name: string;
  type: 'substring' | 'length';
  value?: string;
  aggregate?: 'mean' | 'sum' | 'min' | 'max';
}

export interface EvalEvaluationConfig {
  metrics?: EvalMetric[];
}

export interface EvalSpec {
  version: '1.0';
  name: string;
  description?: string;
  telemetry: boolean;
  suiteTimeout?: number;
  timeout: number;
  samples: number;
  executeTools: boolean;
  prompts: EvalPrompt[];
  models: string[];
  variations: EvalVariation[];
  cost?: Record<string, EvalCostRates>;
  evaluation?: EvalEvaluationConfig;
}

export interface EvalRunSpec {
  runId: string;
  promptId: string;
  model: string;
  variationId: string;
  sampleIndex: number;
}

export interface EvalToolCall {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
}

export interface EvalRunResult {
  runId: string;
  promptId: string;
  model: string;
  variationId: string;
  sampleIndex: number;
  sessionId: string;
  status: 'completed' | 'error' | 'timeout';
  error?: string;
  assistantText: string;
  thinkingText: string;
  toolCalls: EvalToolCall[];
  timing: {
    startedAt: string;
    firstTokenAt?: string;
    endedAt?: string;
    durationMs: number;
    timeToFirstTokenMs?: number;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  };
  estimatedCostUsd?: number;
  metrics?: Record<string, number | boolean>;
}

export interface EvalSuiteResult {
  summary: {
    totalRuns: number;
    completed: number;
    failed: number;
    timedOut: number;
    totalDurationMs: number;
    totalEstimatedCostUsd?: number;
    avgTimeToFirstTokenMs?: number;
  };
  spec: EvalSpec;
  runs: EvalRunResult[];
}

export interface EvalInlineOptions {
  prompts?: string[];
  models?: string[];
  output?: string;
  samples?: number;
  timeout?: number;
  suiteTimeout?: number;
}

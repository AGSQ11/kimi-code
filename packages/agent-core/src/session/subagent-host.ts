import {
  APIProviderRateLimitError,
  isProviderRateLimitError,
  type TokenUsage,
} from '@moonshot-ai/kosong';

import type { Agent } from '../agent';
import type { PromptOrigin } from '../agent/context';
import {
  ErrorCodes,
  fromKimiErrorPayload,
  isKimiError,
  type KimiErrorCode,
  type KimiErrorPayload,
} from '../errors';
import { DenyAllPermissionPolicy } from '../agent/permission/policies/deny-all';
import { InMemoryAgentRecordPersistence } from '../agent/records';
import { isAbortError } from '../loop/errors';
import {
  DEFAULT_AGENT_PROFILES,
  prepareSystemPromptContext,
  type ResolvedAgentProfile,
} from '../profile';
import {
  linkAbortSignal,
  userCancellationReason,
} from '../utils/abort';
import { collectGitContext } from './git-context';
import type { Session } from './index';
import { SubagentModelResolver } from './subagent-model-resolver';
import type { ModelProbeResult } from './model-probe';
import type { ModelProvider } from './provider-manager';
import {
  SubagentBatch,
  resolveSwarmMaxConcurrency,
  type SubagentResult,
  type SubagentSuspendedEvent,
  type QueuedSubagentTask,
} from './subagent-batch';
import SUMMARY_CONTINUATION_PROMPT from './summary-continuation.md?raw';

export const DEFAULT_SUBAGENT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_SUBAGENT_TIMEOUT_DESCRIPTION = '30 minutes';

export type {
  SubagentResult as QueuedSubagentRunResult,
  QueuedSubagentTask,
  ResumeQueuedSubagentTask,
  SpawnQueuedSubagentTask,
} from './subagent-batch';

export interface ModelComparisonResult {
  readonly modelAlias: string;
  readonly result?: string;
  readonly error?: string;
}

/**
 * A subagent summary shorter than this many characters triggers one
 * follow-up turn that asks the subagent to expand it, so the parent
 * agent receives a technically complete handoff.
 */
const SUMMARY_MIN_LENGTH = 200;
const SUMMARY_CONTINUATION_ATTEMPTS = 1;
const HOOK_TEXT_PREVIEW_LENGTH = 500;
const SUBAGENT_MAX_TOKENS_ERROR =
  'Subagent turn failed before completing its final summary: reason=max_tokens';
const TOOL_CALL_DISABLED_MESSAGE =
  'Tool calls are disabled for side questions. Answer with text only.';
const SUBAGENT_PROMPT_ORIGIN: PromptOrigin = { kind: 'system_trigger', name: 'subagent' };
const SUBAGENT_REPROBE_ERROR_CODES: ReadonlySet<KimiErrorCode> = new Set([
  ErrorCodes.PROVIDER_RATE_LIMIT,
  ErrorCodes.PROVIDER_API_ERROR,
  ErrorCodes.PROVIDER_CONNECTION_ERROR,
  ErrorCodes.PROVIDER_AUTH_ERROR,
]);
const SIDE_QUESTION_SYSTEM_REMINDER = `
This is a side-channel conversation with the user. You should answer user questions directly based on what you already know.

IMPORTANT:
- You are a separate, lightweight instance.
- The main agent continues independently; do not reference being interrupted.
- Do not call any tools. All tool calls are disabled and will be rejected.
  Even though tool definitions are visible in this request, they exist only
  for technical reasons (prompt cache). You must not use them.
- Respond only with text based on what you already know from the conversation
  and this side-channel conversation.
- Follow-up turns may happen in this side-channel conversation.
- If you do not know the answer, say so directly.
`;

export interface RunSubagentOptions {
  readonly parentToolCallId: string;
  readonly parentToolCallUuid?: string;
  readonly prompt: string;
  readonly description: string;
  readonly swarmIndex?: number;
  readonly runInBackground: boolean;
  readonly signal: AbortSignal;
  readonly onReady?: () => void;
  readonly suppressRateLimitFailureEvent?: boolean;
}

export interface SpawnSubagentOptions extends RunSubagentOptions {
  readonly profileName: string;
  readonly model?: string;
  readonly swarmItem?: string;
}

type SubagentCompletion = {
  readonly result: string;
  readonly usage?: TokenUsage;
};

export type SubagentHandle = {
  readonly agentId: string;
  readonly profileName: string;
  readonly modelAlias?: string;
  readonly resumed: boolean;
  readonly completion: Promise<SubagentCompletion>;
};

export class SessionSubagentHost {
  private readonly activeChildren = new Map<
    string,
    {
      readonly controller: AbortController;
      runInBackground: boolean;
    }
  >();

  private readonly modelResolver: SubagentModelResolver;
  private probeRequested = false;

  constructor(
    private readonly session: Session,
    private readonly ownerAgentId: string,
  ) {
    this.modelResolver = new SubagentModelResolver({
      subagentModels: session.options?.config?.subagentModels,
      probeStatus: () => session.modelProbeStatus ?? {},
    });
  }

  async spawn(options: SpawnSubagentOptions): Promise<SubagentHandle> {
    options.signal.throwIfAborted();
    await this.ensureProbed();

    const parent = await this.session.ensureAgentResumed(this.ownerAgentId);
    const profile = this.resolveProfile(parent, options.profileName);
    const { id, agent } = await this.session.createAgent(
      { type: 'sub', generate: parent.rawGenerate },
      { parentAgentId: this.ownerAgentId, swarmItem: options.swarmItem },
    );
    const effectiveModel = this.resolveSubagentModel(parent, profile.name, options.model);
    const completion = this.runWithActiveChild(id, options, async (runOptions) => {
      this.emitSubagentSpawned(parent, id, profile.name, runOptions, effectiveModel);
      try {
        await this.configureChild(parent, agent, profile, effectiveModel);
        return await this.runPromptTurn(parent, id, agent, profile.name, runOptions);
      } catch (error) {
        this.emitSubagentFailed(parent, id, runOptions, error);
        throw error;
      }
    });
    return {
      agentId: id,
      profileName: profile.name,
      modelAlias: effectiveModel,
      resumed: false,
      completion,
    };
  }

  async resume(agentId: string, options: RunSubagentOptions): Promise<SubagentHandle> {
    options.signal.throwIfAborted();
    await this.ensureProbed();
    const { parent, child, profileName } = await this.ensureIdleSubagent(agentId);
    const effectiveModel = this.resolveSubagentModel(parent, profileName);
    const completion = this.runWithActiveChild(agentId, options, async (runOptions) => {
      this.emitSubagentSpawned(parent, agentId, profileName, runOptions, effectiveModel);
      try {
        if (effectiveModel !== undefined) {
          child.config.update({ modelAlias: effectiveModel });
        }
        return await this.runPromptTurn(parent, agentId, child, profileName, runOptions);
      } catch (error) {
        this.emitSubagentFailed(parent, agentId, runOptions, error);
        throw error;
      }
    });
    return { agentId, profileName, modelAlias: effectiveModel, resumed: true, completion };
  }

  async retry(agentId: string, options: RunSubagentOptions): Promise<SubagentHandle> {
    options.signal.throwIfAborted();
    const { parent, child, profileName } = await this.ensureIdleSubagent(agentId);
    const completion = this.runWithActiveChild(agentId, options, async (runOptions) => {
      try {
        runOptions.signal.throwIfAborted();
        // Preserve the child's current model — it was already resolved during the
        // initial spawn (via [subagent_models] config or per-invocation override).
        // Resetting to parent.config.modelAlias would lose a role-based model.
        this.emitSubagentStarted(parent, agentId);
        const turnId = child.turn.retry('agent-host');
        if (turnId === null) {
          throw new Error(`Agent instance "${agentId}" could not start a retry turn`);
        }
        this.observeFirstRequest(child, runOptions);
        return await this.waitForChildCompletion(parent, agentId, child, profileName, runOptions);
      } catch (error) {
        this.emitSubagentFailed(parent, agentId, runOptions, error);
        throw error;
      }
    });
    return { agentId, profileName, resumed: true, completion };
  }

  private async ensureIdleSubagent(
    agentId: string,
  ): Promise<{ readonly parent: Agent; readonly child: Agent; readonly profileName: string }> {
    const parent = await this.session.ensureAgentResumed(this.ownerAgentId);
    const metadata = this.session.metadata.agents[agentId];
    if (metadata?.type !== 'sub') {
      throw new Error(`Agent instance "${agentId}" is not a subagent`);
    }
    if (metadata.parentAgentId !== this.ownerAgentId) {
      throw new Error(`Agent instance "${agentId}" does not belong to this parent agent`);
    }
    const child = await this.session.ensureAgentResumed(agentId);
    if (this.activeChildren.has(agentId) || child.turn.hasActiveTurn) {
      throw new Error(`Agent instance "${agentId}" is already running and cannot run concurrently`);
    }

    const profileName = child.config.profileName ?? 'subagent';
    return { parent, child, profileName };
  }

  async runQueued<T>(tasks: readonly QueuedSubagentTask<T>[]): Promise<Array<SubagentResult<T>>> {
    const maxConcurrency = resolveSwarmMaxConcurrency();
    return new SubagentBatch(this, tasks, { maxConcurrency }).run();
  }

  suspended(event: SubagentSuspendedEvent): void {
    const parent = this.session.getReadyAgent?.(this.ownerAgentId);
    parent?.emitEvent({
      type: 'subagent.suspended',
      subagentId: event.agentId,
      reason: event.reason,
    });
  }

  async startBtw(): Promise<string> {
    const parent = await this.session.ensureAgentResumed(this.ownerAgentId);
    const { id, agent: child } = await this.session.createAgent(
      {
        type: 'sub',
        generate: parent.rawGenerate,
        persistence: new InMemoryAgentRecordPersistence(),
      },
      { parentAgentId: this.ownerAgentId, persistMetadata: false },
    );

    child.config.update({
      modelAlias: parent.config.modelAlias,
      thinkingLevel: parent.config.thinkingLevel,
      systemPrompt: parent.config.systemPrompt,
      generationKwargs: parent.config.generationKwargs,
    });
    child.tools.copyLoopToolsFrom(parent.tools);
    child.context.useProjectedHistoryFrom(parent.context);
    child.context.appendSystemReminder(SIDE_QUESTION_SYSTEM_REMINDER.trim(), {
      kind: 'system_trigger',
      name: 'btw',
    });
    child.permission.policies.unshift(new DenyAllPermissionPolicy(TOOL_CALL_DISABLED_MESSAGE));
    return id;
  }

  /**
   * Run a critic subagent that analyzes the main agent's work.
   * Creates a subagent with the 'critic' profile, feeds it the conversation
   * context, and returns the structured critique.
   */
  async runCritique(context: string, modelAlias: string): Promise<string> {
    const parent = await this.session.ensureAgentResumed(this.ownerAgentId);
    const profile = this.resolveProfile(parent, 'critic');
    const { agent: child } = await this.session.createAgent(
      {
        type: 'sub',
        generate: parent.rawGenerate,
        persistence: new InMemoryAgentRecordPersistence(),
      },
      { parentAgentId: this.ownerAgentId, profile, persistMetadata: false },
    );

    await this.configureChild(parent, child, profile, modelAlias);
    await this.injectMemoryContext(child, context);

    const signal = new AbortController().signal;
    const prompt = `You are a critic. Analyze the following conversation context for flaws, hallucinations, missing edge cases, security issues, and alternative approaches. Be thorough and constructive.\n\n${context}`;

    const turnId = child.turn.prompt(
      [{ type: 'text', text: prompt }],
      SUBAGENT_PROMPT_ORIGIN,
    );
    if (turnId === null) {
      throw new Error('Critic subagent could not start a turn');
    }
    await runChildTurnToCompletion(child, signal);

    const result = lastAssistantText(child);
    await this.rememberCritiqueFinding(child, result);
    return result;
  }

  /**
   * Run the same prompt against multiple models in parallel and return each
   * model's text response. Tool calls are disabled so each subagent only
   * answers with text based on its existing knowledge.
   */
  async runCompare(prompt: string, modelAliases: readonly string[]): Promise<ModelComparisonResult[]> {
    const parent = await this.session.ensureAgentResumed(this.ownerAgentId);
    const signal = new AbortController().signal;

    const runOne = async (modelAlias: string): Promise<ModelComparisonResult> => {
      try {
        const profile = this.resolveProfile(parent, 'coder');
        const { agent: child } = await this.session.createAgent(
          {
            type: 'sub',
            generate: parent.rawGenerate,
            persistence: new InMemoryAgentRecordPersistence(),
          },
          { parentAgentId: this.ownerAgentId, profile, persistMetadata: false },
        );

        await this.configureChild(parent, child, profile, modelAlias);
        child.permission.policies.unshift(new DenyAllPermissionPolicy(TOOL_CALL_DISABLED_MESSAGE));
        child.context.appendSystemReminder(SIDE_QUESTION_SYSTEM_REMINDER.trim(), {
          kind: 'system_trigger',
          name: 'compare',
        });
        await this.injectMemoryContext(child, prompt);

        const turnId = child.turn.prompt([{ type: 'text', text: prompt }], SUBAGENT_PROMPT_ORIGIN);
        if (turnId === null) {
          throw new Error('Compare subagent could not start a turn');
        }
        await runChildTurnToCompletion(child, signal);
        return { modelAlias, result: lastAssistantText(child) };
      } catch (error) {
        return { modelAlias, error: error instanceof Error ? error.message : String(error) };
      }
    };

    const results = await Promise.all(modelAliases.map(runOne));
    await this.rememberComparison(parent, prompt, results);
    return results;
  }

  cancelAll(reason: unknown = userCancellationReason()): void {
    const foregroundChildren = Array.from(this.activeChildren).filter(
      ([, child]) => !child.runInBackground,
    );
    for (const [childId, child] of foregroundChildren) {
      this.session.getReadyAgent(childId)?.subagentHost?.cancelAll(reason);
      // Abort with the cancel reason (a user interruption by default) so the
      // subagent's in-flight tools report the cause accurately to the model.
      child.controller.abort(reason);
    }
  }

  markActiveChildDetached(agentId: string): void {
    const child = this.activeChildren.get(agentId);
    if (child !== undefined) child.runInBackground = true;
  }

  async getProfileName(agentId: string): Promise<string | undefined> {
    const metadata = this.session.metadata.agents[agentId];
    if (metadata?.type !== 'sub' || metadata.parentAgentId !== this.ownerAgentId) {
      return undefined;
    }
    return (await this.session.ensureAgentResumed(agentId)).config.profileName;
  }

  getSwarmItem(agentId: string): string | undefined {
    const metadata = this.session.metadata.agents[agentId];
    if (metadata?.type !== 'sub' || metadata.parentAgentId !== this.ownerAgentId) {
      return undefined;
    }
    return metadata.swarmItem;
  }

  private resolveProfile(parent: Agent, profileName: string): ResolvedAgentProfile {
    const profile =
      DEFAULT_AGENT_PROFILES[parent.config.profileName ?? 'agent']?.subagents?.[profileName] ??
      DEFAULT_AGENT_PROFILES['agent']?.subagents?.[profileName];
    if (profile === undefined) {
      throw new Error(`Subagent profile "${profileName}" was not found`);
    }
    return profile;
  }

  private runWithActiveChild(
    childId: string,
    options: RunSubagentOptions,
    run: (options: RunSubagentOptions) => Promise<SubagentCompletion>,
  ): Promise<SubagentCompletion> {
    const controller = new AbortController();
    const unlinkAbortSignal = linkAbortSignal(options.signal, controller);
    this.activeChildren.set(childId, {
      controller,
      runInBackground: options.runInBackground,
    });

    return run({ ...options, signal: controller.signal })
      .catch((error: unknown) => {
        this.maybeReprobeAfterError(error);
        throw error;
      })
      .finally(() => {
        unlinkAbortSignal();
        this.activeChildren.delete(childId);
      });
  }

  private async runPromptTurn(
    parent: Agent,
    childId: string,
    child: Agent,
    profileName: string,
    options: RunSubagentOptions,
  ): Promise<SubagentCompletion> {
    options.signal.throwIfAborted();
    await this.triggerSubagentStart(parent, profileName, options.prompt, options.signal);
    options.signal.throwIfAborted();

    let childPrompt = options.prompt;
    if (profileName === 'explore') {
      const gitContext = await collectGitContext(child.kaos, child.config.cwd);
      if (gitContext) childPrompt = `${gitContext}\n\n${childPrompt}`;
    }

    await this.injectMemoryContext(child, childPrompt);
    this.emitSubagentStarted(parent, childId);
    const turnId = child.turn.prompt([{ type: 'text', text: childPrompt }], SUBAGENT_PROMPT_ORIGIN);
    if (turnId === null) {
      throw new Error(`Agent instance "${childId}" could not start a turn`);
    }
    this.observeFirstRequest(child, options);
    return this.waitForChildCompletion(parent, childId, child, profileName, options);
  }

  private async waitForChildCompletion(
    parent: Agent,
    childId: string,
    child: Agent,
    profileName: string,
    options: RunSubagentOptions,
  ): Promise<SubagentCompletion> {
    await runChildTurnToCompletion(child, options.signal);

    // A subagent that returns an overly terse summary leaves the parent
    // agent under-informed. Give it a bounded number of chances to expand
    // the handoff; if it is still short after that, accept it as-is rather
    // than retrying indefinitely.
    let result = lastAssistantText(child);
    let remainingContinuations = SUMMARY_CONTINUATION_ATTEMPTS;
    while (remainingContinuations > 0 && result.length < SUMMARY_MIN_LENGTH) {
      remainingContinuations -= 1;
      options.signal.throwIfAborted();
      child.turn.prompt([{ type: 'text', text: SUMMARY_CONTINUATION_PROMPT }], SUBAGENT_PROMPT_ORIGIN);
      await runChildTurnToCompletion(child, options.signal);
      result = lastAssistantText(child);
    }
    const usage = child.usage.data().total;
    parent.emitEvent({
      type: 'subagent.completed',
      subagentId: childId,
      resultSummary: result,
      usage,
      contextTokens: child.context.tokenCount,
    });
    this.triggerSubagentStop(parent, profileName, result);
    return { result, usage };
  }

  /**
   * Give a subagent the same institutional knowledge the parent would have for a
   * given query. The default MemoryInjector only recalls against user-origin
   * messages; subagent prompts originate from `system_trigger`, so we bootstrap
   * the relevant memories explicitly before the turn starts.
   */
  private async injectMemoryContext(child: Agent, query: string): Promise<void> {
    if (!child.experimentalFlags.enabled('memory_auto_injection')) return;
    try {
      const alreadyInjected = child.context.history.some(
        (message) =>
          message.origin?.kind === 'injection' &&
          message.origin.variant === 'subagent_memory_context',
      );
      if (alreadyInjected) return;

      const projectRoot = child.memoryStore.getProjectRoot();
      const memories = await child.memoryStore.recall({
        query,
        project: projectRoot,
        includeGlobal: true,
        limit: 5,
      });
      if (memories.length === 0) return;

      const lines = memories.map(
        (memory) => `- [${memory.category ?? 'memory'}] ${memory.content}`,
      );
      child.context.appendSystemReminder(
        `Relevant context from past sessions:\n${lines.join('\n')}`,
        { kind: 'injection', variant: 'subagent_memory_context' },
      );
      child.telemetry.track('memory_context_injected_subagent', {
        subagent_name: child.config.profileName ?? 'subagent',
        memory_count: memories.length,
      });
    } catch {
      // Memory recall should never break the subagent.
    }
  }

  /**
   * Persist a model-comparison summary so future turns can recall which model
   * performed best for a given prompt. Stored against the parent agent so the
   * memory survives the ephemeral compare subagents.
   */
  private async rememberComparison(
    parent: Agent,
    prompt: string,
    results: readonly ModelComparisonResult[],
  ): Promise<void> {
    const successful = results.filter((r) => r.result !== undefined && r.error === undefined);
    if (successful.length === 0) return;

    const modelLines = results.map((r) => {
      const status = r.error !== undefined ? `(error: ${r.error})` : '';
      const text = r.result ?? '(no response)';
      return `- ${r.modelAlias}: ${status}${text.length > 120 ? `${text.slice(0, 117)}...` : text}`;
    });

    const content = [
      `Comparison prompt: ${prompt}`,
      '',
      ...modelLines,
    ].join('\n');

    try {
      await parent.memoryStore.remember({
        content,
        category: 'comparison',
        tags: ['compare', ...results.map((r) => r.modelAlias)],
        project: parent.memoryStore.getProjectRoot(),
        source: 'compare',
      });
      parent.telemetry.track('comparison_remembered', {
        model_count: results.length,
        successful_count: successful.length,
      });
    } catch {
      // Persistence failure must not break the compare flow.
    }
  }

  /**
   * Persist a critique as a long-term memory so recurring issues are visible to
   * future sessions. The content is truncated to avoid bloating the store.
   */
  private async rememberCritiqueFinding(child: Agent, critique: string): Promise<void> {
    const trimmed = critique.trim();
    if (trimmed.length === 0) return;

    const content = trimmed.length > 2000 ? `${trimmed.slice(0, 1997)}...` : trimmed;

    try {
      await child.memoryStore.remember({
        content,
        category: 'critique-finding',
        tags: ['critique'],
        project: child.memoryStore.getProjectRoot(),
        source: 'critique',
      });
      child.telemetry.track('critique_finding_remembered', {
        content_length: content.length,
      });
    } catch {
      // Persistence failure must not break the critique flow.
    }
  }

  private async configureChild(
    parent: Agent,
    child: Agent,
    profile: ResolvedAgentProfile,
    effectiveModel?: string,
  ): Promise<void> {
    const targetModel = effectiveModel ?? parent.config.modelAlias;
    let thinkingLevel = parent.config.thinkingLevel;

    // If the subagent is using a different model from its parent, do not
    // inherit the parent's thinking/reasoning level. Different models have
    // different thinking support (e.g. grok-build-0.1 rejects reasoningEffort),
    // and the safest default for a model switch is 'off'.
    if (targetModel !== undefined && targetModel !== parent.config.modelAlias) {
      thinkingLevel = 'off';
    }

    child.config.update({
      cwd: parent.config.cwd,
      ...(effectiveModel !== undefined ? { modelAlias: effectiveModel } : {}),
      thinkingLevel,
      generationKwargs: parent.config.generationKwargs,
    });

    const context = await prepareSystemPromptContext(
      this.session.systemContextKaos(child.kaos.getcwd()),
      this.session.options.kimiHomeDir,
      { additionalDirs: child.getAdditionalDirs() },
    );
    child.useProfile(profile, context);
    child.tools.inheritUserTools(parent.tools);
  }

  private async triggerSubagentStart(
    parent: Agent,
    profileName: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<void> {
    await parent.hooks?.trigger('SubagentStart', {
      matcherValue: profileName,
      signal,
      inputData: {
        agentName: profileName,
        prompt: prompt.slice(0, HOOK_TEXT_PREVIEW_LENGTH),
      },
    });
  }

  private triggerSubagentStop(parent: Agent, profileName: string, result: string): void {
    void parent.hooks?.fireAndForgetTrigger('SubagentStop', {
      matcherValue: profileName,
      inputData: {
        agentName: profileName,
        response: result.slice(0, HOOK_TEXT_PREVIEW_LENGTH),
      },
    });
  }

  private observeFirstRequest(
    child: Agent,
    options: RunSubagentOptions,
  ): void {
    if (options.onReady === undefined) return;
    void child.turn
      .waitForTurnFirstRequest()
      .then(() => {
        options.onReady?.();
      })
      .catch(() => {});
  }

  private resolveSubagentModel(
    parent: Agent,
    profileName: string,
    modelOverride?: string,
  ): string | undefined {
    const desired = this.modelResolver.resolve(
      profileName,
      parent.config.modelAlias ?? undefined,
      modelOverride,
    );
    if (desired === undefined) {
      return desired;
    }

    const probeStatus = this.session.modelProbeStatus ?? {};

    // If the desired model is not even configured in config.toml, we must
    // not return it — it will cause a hard error when the subagent tries to
    // make an LLM request. Instead, probe configured models and pick a
    // healthy one from the role's fallback list, or any healthy model.
    const providerManager = this.session.options.providerManager;
    const isConfigured = providerManager?.hasModel?.(desired) ?? true;

    if (!isConfigured) {
      // Try fallback models from [subagent_models] for this role first
      const fallbackModel = this.findHealthyFallback(profileName, probeStatus, providerManager);
      if (fallbackModel !== undefined) {
        return fallbackModel;
      }

      // If no role-specific fallback worked, try any configured + healthy model
      const anyHealthy = this.findAnyHealthyConfiguredModel(probeStatus, providerManager);
      if (anyHealthy !== undefined) {
        return anyHealthy;
      }

      // If probe results are empty/unavailable, fall back to any model
      // configured in [subagent_models] for this role, regardless of probe status
      const anyConfiguredFallback = this.findAnyConfiguredFallback(profileName, providerManager);
      if (anyConfiguredFallback !== undefined) {
        return anyConfiguredFallback;
      }

      // Last resort: the default model if it's configured
      const defaultModel = providerManager?.defaultModel;
      if (defaultModel !== undefined && (providerManager?.hasModel?.(defaultModel) ?? true)) {
        return defaultModel;
      }
    }

    // Standard probe-based fallback: if the desired model is known-unhealthy,
    // fall back to any globally-healthy alias.
    const status = probeStatus[desired];
    if (status !== undefined && status.status !== 'ok' && status.status !== 'unknown') {
      const fallback = Object.entries(probeStatus).find(
        ([alias, result]) =>
          alias !== desired &&
          result.status === 'ok' &&
          (providerManager?.hasModel?.(alias) ?? true),
      )?.[0];
      if (fallback !== undefined) {
        return fallback;
      }
    }
    return desired;
  }

  /**
   * Find a healthy model from the [subagent_models] fallback list for a role.
   * Only considers models that are actually configured in config.toml.
   */
  private findHealthyFallback(
    profileName: string,
    probeStatus: Readonly<Record<string, ModelProbeResult>>,
    providerManager: ModelProvider | undefined,
  ): string | undefined {
    const subagentModels = this.session.options?.config?.subagentModels;
    if (subagentModels === undefined) return undefined;

    const entry = subagentModels[profileName];
    if (entry === undefined || typeof entry === 'string') return undefined;

    const models = entry.models;
    for (const model of models) {
      if (providerManager?.hasModel?.(model) ?? true) {
        const status = probeStatus[model];
        if (status === undefined || status.status === 'ok' || status.status === 'unknown') {
          return model;
        }
      }
    }
    return undefined;
  }

  /**
   * Find any model that is both configured in config.toml and probe-healthy.
   */
  private findAnyHealthyConfiguredModel(
    probeStatus: Readonly<Record<string, ModelProbeResult>>,
    providerManager: ModelProvider | undefined,
  ): string | undefined {
    for (const [alias, result] of Object.entries(probeStatus)) {
      if (result.status === 'ok' && (providerManager?.hasModel?.(alias) ?? true)) {
        return alias;
      }
    }
    return undefined;
  }

  /**
   * Find any model from [subagent_models] for this role that is configured in
   * config.toml, regardless of probe status. Used when probe results are empty.
   */
  private findAnyConfiguredFallback(
    profileName: string,
    providerManager: ModelProvider | undefined,
  ): string | undefined {
    const subagentModels = this.session.options?.config?.subagentModels;
    if (subagentModels === undefined) return undefined;

    const entry = subagentModels[profileName];
    if (entry === undefined) return undefined;

    const models = typeof entry === 'string'
      ? [entry]
      : entry.models;

    for (const model of models) {
      if (providerManager?.hasModel?.(model) ?? true) {
        return model;
      }
    }
    return undefined;
  }

  private async ensureProbed(): Promise<void> {
    if (this.probeRequested) return;
    const requestProbe = this.session.options?.requestModelProbe;
    if (requestProbe === undefined) return;

    this.probeRequested = true;
    try {
      const status = await requestProbe({ background: false });
      this.session.setModelProbeStatus(status);
    } catch (error) {
      this.session.log.warn(
        'Initial model probe failed; continuing without updated probe status',
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  private maybeReprobeAfterError(error: unknown): void {
    if (isAbortError(error)) return;
    const isProviderError =
      error instanceof APIProviderRateLimitError ||
      (isKimiError(error) && SUBAGENT_REPROBE_ERROR_CODES.has(error.code));
    if (!isProviderError) return;

    const requestProbe = this.session.options?.requestModelProbe;
    if (requestProbe === undefined) return;

    this.probeRequested = true;
    void (async () => {
      try {
        const status = await requestProbe({ background: true });
        this.session.setModelProbeStatus(status);
      } catch (probeError) {
        this.session.log.warn(
          'Background model probe failed after subagent error',
          { error: probeError instanceof Error ? probeError.message : String(probeError) },
        );
      }
    })();
  }

  private emitSubagentSpawned(
    parent: Agent,
    childId: string,
    profileName: string,
    options: RunSubagentOptions,
    modelAlias?: string,
  ): void {
    parent.emitEvent({
      type: 'subagent.spawned',
      subagentId: childId,
      subagentName: profileName,
      parentToolCallId: options.parentToolCallId,
      parentToolCallUuid: options.parentToolCallUuid,
      parentAgentId: this.ownerAgentId,
      description: options.description,
      swarmIndex: options.swarmIndex,
      runInBackground: options.runInBackground,
      modelAlias,
    });
    parent.telemetry.track('subagent_created', {
      subagent_name: profileName,
      run_in_background: options.runInBackground,
    });
  }

  private emitSubagentStarted(
    parent: Agent,
    childId: string,
  ): void {
    parent.emitEvent({
      type: 'subagent.started',
      subagentId: childId,
    });
  }

  private emitSubagentFailed(
    parent: Agent,
    childId: string,
    options: RunSubagentOptions,
    error: unknown,
  ): void {
    if (shouldSuppressQueuedAttemptFailureEvent(options, error)) return;
    parent.emitEvent({
      type: 'subagent.failed',
      subagentId: childId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runChildTurnToCompletion(child: Agent, signal: AbortSignal): Promise<void> {
  const completion = await child.turn.waitForCurrentTurn(signal);
  const turnEnded = completion.event;
  if (turnEnded.reason !== 'completed') {
    if (turnEnded.reason === 'filtered') {
      throw new Error('Subagent turn blocked by provider safety policy');
    }
    if (turnEnded.error?.code === ErrorCodes.PROVIDER_RATE_LIMIT) {
      throw providerRateLimitErrorFromPayload(turnEnded.error);
    }
    if (turnEnded.error !== undefined) {
      throw fromKimiErrorPayload(turnEnded.error);
    }
    throw new Error(`Subagent turn ${turnEnded.reason}`);
  }
  if (completion.stopReason === 'max_tokens') {
    throw new Error(`${SUBAGENT_MAX_TOKENS_ERROR}.`);
  }
}

function providerRateLimitErrorFromPayload(error: KimiErrorPayload): APIProviderRateLimitError {
  const requestId =
    typeof error.details?.['requestId'] === 'string' ? error.details['requestId'] : null;
  return new APIProviderRateLimitError(error.message, requestId);
}

function lastAssistantText(agent: Agent): string {
  for (const message of [...agent.context.history].toReversed()) {
    if (message.role !== 'assistant') continue;
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    if (text.trim().length > 0) return text.trim();
  }
  return '';
}

function shouldSuppressQueuedAttemptFailureEvent(
  options: RunSubagentOptions,
  error: unknown,
): boolean {
  if (options.suppressRateLimitFailureEvent !== true) return false;
  if (isProviderRateLimitError(error)) return true;
  return isAbortError(error) || options.signal.aborted;
}

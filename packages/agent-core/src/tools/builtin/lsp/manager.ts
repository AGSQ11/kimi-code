/**
 * LspManager — owns one LanguageServerClient per language id.
 *
 * Lazily starts servers, keeps a small open-document cache, and routes
 * requests to the right server.
 */

import type { Kaos } from '@moonshot-ai/kaos';
import { pathToFileURL } from 'node:url';

import { LspClient } from './client';
import { serverConfigForFile, serverConfigForLanguageId, type LanguageServerConfig } from './languages';

export interface LspPosition {
  readonly line: number;
  readonly character: number;
}

export class LspManager {
  private readonly clients = new Map<string, LspClient>();
  private readonly openedFiles = new Set<string>();

  constructor(
    private readonly kaos: Kaos,
    private readonly workspaceRoot: string,
  ) {}

  async ensureFile(filePath: string): Promise<void> {
    const languageId = this.languageIdForFile(filePath);
    if (languageId === undefined) {
      throw new Error(`No language server configured for ${filePath}.`);
    }
    const client = await this.getClient(languageId);
    const uri = this.fileUri(filePath);
    if (this.openedFiles.has(uri)) return;
    const text = await this.kaos.readText(filePath);
    client.didOpen(uri, languageId, 1, text);
    this.openedFiles.add(uri);
  }

  async requestFileOperation<T>(
    filePath: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    await this.ensureFile(filePath);
    const languageId = this.languageIdForFile(filePath)!;
    const client = await this.getClient(languageId);
    const response = await client.request(method, params);
    if (response.error !== undefined) {
      throw new Error(response.error.message);
    }
    return response.result as T;
  }

  async workspaceSymbols(query: string): Promise<Array<{ server: string; symbols: unknown }>> {
    const results: Array<{ server: string; symbols: unknown }> = [];
    for (const config of this.languageConfigs()) {
      const client = await this.getClient(config.languageId).catch(() => undefined);
      if (client === undefined || !client.isInitialized()) continue;
      const response = await client.request('workspace/symbol', { query });
      if (response.error === undefined && response.result !== undefined) {
        results.push({ server: client.getServerName(), symbols: response.result });
      }
    }
    return results;
  }

  async diagnosticsForFile(filePath: string): Promise<unknown> {
    await this.ensureFile(filePath);
    const languageId = this.languageIdForFile(filePath)!;
    const client = await this.getClient(languageId);
    // Many servers publish diagnostics via notification after didOpen.
    // We do not have a subscription model, so request a fresh pull if the
    // server supports it; otherwise return a hint.
    const response = await client.request('textDocument/diagnostic', {
      textDocument: { uri: this.fileUri(filePath) },
    });
    if (response.error !== undefined) {
      // Diagnostic pull may not be supported; surface didOpen hint.
      return {
        note: 'Server may publish diagnostics asynchronously. Re-request after a short delay if no diagnostics appear.',
        serverError: response.error.message,
      };
    }
    return response.result;
  }

  listConfiguredLanguages(): string[] {
    return this.languageConfigs().map((c) => c.languageId);
  }

  stop(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }

  private async getClient(languageId: string): Promise<LspClient> {
    const existing = this.clients.get(languageId);
    if (existing !== undefined) return existing;

    const config = serverConfigForLanguageId(languageId);
    if (config === undefined) {
      throw new Error(`No language server configured for language id "${languageId}".`);
    }

    const rootUri = pathToFileURL(this.workspaceRoot).href;
    const client = new LspClient(config.command, config.args, rootUri);
    this.clients.set(languageId, client);
    await client.start();
    return client;
  }

  private languageIdForFile(filePath: string): string | undefined {
    return serverConfigForFile(filePath)?.languageId;
  }

  private fileUri(filePath: string): string {
    return pathToFileURL(filePath).href;
  }

  private languageConfigs(): LanguageServerConfig[] {
    const configs: LanguageServerConfig[] = [];
    const seen = new Set<string>();
    for (const config of [
      serverConfigForLanguageId('typescript')!,
      serverConfigForLanguageId('python')!,
      serverConfigForLanguageId('rust')!,
      serverConfigForLanguageId('go')!,
    ]) {
      if (!seen.has(config.languageId)) {
        seen.add(config.languageId);
        configs.push(config);
      }
    }
    return configs;
  }
}

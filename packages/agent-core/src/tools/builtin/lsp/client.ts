/**
 * Minimal JSON-RPC/LSP client over stdio.
 *
 * Supports the small subset of LSP needed by the agent tool:
 * initialize, textDocument/didOpen, and a handful of textDocument requests.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface LspResponse<T = unknown> {
  readonly id: number;
  readonly result?: T;
  readonly error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  readonly resolve: (value: LspResponse) => void;
  readonly reject: (reason: Error) => void;
}

export interface LspInitializeResult {
  readonly capabilities: Record<string, unknown>;
}

export class LspClient {
  private proc: ChildProcess | undefined;
  private initialized = false;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = Buffer.alloc(0);
  private contentLength = -1;
  private stderrChunks: Buffer[] = [];
  private serverName: string;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly rootUri: string,
  ) {
    this.serverName = `${command} ${args.join(' ')}`;
  }

  async start(): Promise<LspInitializeResult> {
    if (this.proc !== undefined) return this.initializeResult();

    this.proc = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.onData(chunk);
    });
    this.proc.stderr!.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(chunk);
    });
    this.proc.on('error', (error) => {
      this.onError(error);
    });
    this.proc.on('exit', (code) => {
      this.onExit(code);
    });

    const initResult = await this.request('initialize', {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {},
      workspaceFolders: null,
    });

    if (initResult.error !== undefined) {
      throw new Error(`LSP initialize failed: ${initResult.error.message}`);
    }

    this.notify('initialized', {});
    this.initialized = true;
    return initResult.result as LspInitializeResult;
  }

  stop(): void {
    if (this.proc === undefined) return;
    try {
      this.notify('shutdown', {});
    } catch {
      // ignore
    }
    this.proc.kill('SIGTERM');
  }

  request(method: string, params: unknown): Promise<LspResponse> {
    return this.sendMessage(method, params, true);
  }

  notify(method: string, params: unknown): void {
    void this.sendMessage(method, params, false);
  }

  didOpen(uri: string, languageId: string, version: number, text: string): void {
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getServerName(): string {
    return this.serverName;
  }

  private initializeResult(): Promise<LspInitializeResult> {
    if (this.initialized) {
      return Promise.resolve({ capabilities: {} });
    }
    return Promise.reject(new Error('LSP server still initializing'));
  }

  private sendMessage(method: string, params: unknown, expectResponse: boolean): Promise<LspResponse> {
    const proc = this.proc;
    if (proc === undefined || proc.killed) {
      return Promise.reject(new Error(`LSP server ${this.serverName} is not running`));
    }

    const id = expectResponse ? this.nextId++ : undefined;
    const message: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) message['params'] = params;
    if (id !== undefined) message['id'] = id;

    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header = `Content-Length: ${payload.length}\r\n\r\n`;
    const packet = Buffer.concat([Buffer.from(header, 'utf8'), payload]);

    return new Promise<LspResponse>((resolve, reject) => {
      if (id !== undefined) {
        this.pending.set(id, { resolve, reject });
      }
      proc.stdin!.write(packet, (error) => {
        if (error !== null) {
          if (id !== undefined) this.pending.delete(id);
          reject(error);
        } else if (!expectResponse) {
          resolve({ id: -1 });
        }
      });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      if (this.contentLength < 0) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = this.buffer.subarray(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (match === null) {
          this.buffer = this.buffer.subarray(headerEnd + 4);
          continue;
        }
        this.contentLength = Number(match[1]);
        this.buffer = this.buffer.subarray(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;
      const body = this.buffer.subarray(0, this.contentLength).toString('utf8');
      this.buffer = this.buffer.subarray(this.contentLength);
      this.contentLength = -1;
      this.handleMessage(body);
    }
  }

  private handleMessage(body: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return;
    }

    const messageId = message['id'];
    if (typeof messageId === 'number') {
      const pending = this.pending.get(messageId);
      if (pending !== undefined) {
        this.pending.delete(messageId);
        pending.resolve(message as unknown as LspResponse);
      }
    }
  }

  private onError(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private onExit(code: number | null): void {
    const stderr = Buffer.concat(this.stderrChunks).toString('utf8').slice(0, 500);
    const reason =
      code === 0
        ? 'LSP server exited'
        : `LSP server exited with code ${String(code)}${stderr ? `: ${stderr}` : ''}`;
    for (const pending of this.pending.values()) {
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

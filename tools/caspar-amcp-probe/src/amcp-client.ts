import * as net from 'node:net';

export interface AmcpLine {
  ts: number;
  line: string;
}

/**
 * Minimal AMCP/TCP client for the spike. Sends CRLF-terminated lines and keeps
 * a timestamped log of every reply line so the runner can associate replies
 * with the command it just sent (AMCP replies are ordered).
 */
export class AmcpClient {
  #socket: net.Socket | null = null;
  #buffer = '';
  readonly #lines: AmcpLine[] = [];
  readonly #onTrace: ((dir: 'send' | 'recv', line: string) => void) | undefined;

  constructor(onTrace?: (dir: 'send' | 'recv', line: string) => void) {
    this.#onTrace = onTrace;
  }

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.off('error', reject);
        this.#socket = socket;
        resolve();
      });
      socket.setEncoding('utf-8');
      socket.once('error', reject);
      socket.on('data', (chunk: string) => this.#onData(chunk));
    });
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let idx = this.#buffer.indexOf('\r\n');
    while (idx >= 0) {
      const line = this.#buffer.slice(0, idx);
      this.#buffer = this.#buffer.slice(idx + 2);
      this.#lines.push({ ts: Date.now(), line });
      this.#onTrace?.('recv', line);
      idx = this.#buffer.indexOf('\r\n');
    }
  }

  send(line: string): void {
    if (this.#socket === null) throw new Error('AmcpClient: not connected');
    this.#onTrace?.('send', line);
    this.#socket.write(`${line}\r\n`);
  }

  /** Reply lines received at or after `ts`. */
  linesSince(ts: number): string[] {
    return this.#lines.filter((l) => l.ts >= ts).map((l) => l.line);
  }

  close(): Promise<void> {
    const socket = this.#socket;
    this.#socket = null;
    if (socket === null) return Promise.resolve();
    return new Promise((resolve) => {
      socket.end(() => resolve());
    });
  }
}

/** First whitespace-delimited token of an AMCP reply is the numeric status code. */
export function replyCode(line: string): number {
  const m = /^(\d{3})\b/.exec(line.trim());
  return m === null ? 0 : Number(m[1]);
}

/** True when the line is a 2xx success reply. */
export function isOkCode(code: number): boolean {
  return code >= 200 && code < 300;
}

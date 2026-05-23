import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { AmcpResponseParser, type ParsedAmcpResponse } from './response-parser.js';

/** Typed event signatures — consumers get inferred argument types. */
export interface AmcpTransportEvents {
  connected: [];
  response: [resp: ParsedAmcpResponse];
  error: [err: Error];
  close: [info: { wasError: boolean }];
}

/**
 * AmcpTransport — owns a single TCP connection to CasparCG's AMCP port.
 *
 * Responsibilities (Phase 5 §3):
 *  - Persistent TCP, UTF-8, `\r\n` line framing for outbound commands.
 *  - Streaming parse of inbound responses via `AmcpResponseParser`.
 *  - Emits parsed responses, connection lifecycle, and errors.
 *  - **Does not** pair commands with responses — that's `CommandQueue`'s
 *    job (M4.3). The transport just streams data both ways.
 *
 * The caller is responsible for quoting; `send(line)` writes `line + \r\n`
 * verbatim. Use `quote()` from `./escape` to build the line safely.
 *
 * Lifecycle:
 *   new AmcpTransport()
 *      .connect(host, port)
 *      .send('VERSION')            // resolves once flushed
 *      .on('response', resp =>...) // 0..N times, ordered
 *      .close()                    // graceful FIN
 *
 *   Errors flow through the 'error' event; a closed/reset socket emits
 *   'close' with `wasError: boolean`.
 */
export class AmcpTransport extends EventEmitter<AmcpTransportEvents> {
  private socket: net.Socket | null = null;
  private readonly parser: AmcpResponseParser;
  private connecting = false;
  private connected = false;

  constructor() {
    super();
    this.parser = new AmcpResponseParser((resp) => {
      this.emit('response', resp);
    });
    // Baseline 'error' listener so a socket-level error event with no
    // consumer-attached listener doesn't escalate to a process-level
    // uncaught-exception. Consumer-attached listeners still fire — they
    // run alongside this no-op, not instead of it.
    this.on('error', noop);
  }

  /** Open the TCP connection. Resolves on the socket's `connect` event. */
  async connect(host: string, port: number): Promise<void> {
    if (this.connecting || this.connected) {
      throw new Error('AmcpTransport: already connected or connecting');
    }
    this.connecting = true;
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port });
      sock.setEncoding('utf-8');
      sock.setKeepAlive(true, 15000);

      const onConnect = (): void => {
        sock.off('error', onErrorPreConnect);
        this.connecting = false;
        this.connected = true;
        this.socket = sock;
        this.attachHandlers(sock);
        this.emit('connected');
        resolve();
      };
      const onErrorPreConnect = (err: Error): void => {
        sock.off('connect', onConnect);
        this.connecting = false;
        sock.destroy();
        reject(err);
      };

      sock.once('connect', onConnect);
      sock.once('error', onErrorPreConnect);
    });
  }

  /**
   * Write one AMCP command line. The transport appends `\r\n`; the caller
   * is responsible for tokenizing + quoting (`quote()` in ./escape).
   *
   * Resolves once the bytes have been handed to the OS write buffer. This
   * is **not** a response wait — listen to the `response` event.
   */
  async send(line: string): Promise<void> {
    const sock = this.socket;
    if (sock === null || sock.writable === false) {
      throw new Error('AmcpTransport: socket not writable');
    }
    return new Promise((resolve, reject) => {
      sock.write(`${line}\r\n`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Graceful close — sends FIN, waits for the peer to drain. */
  async close(): Promise<void> {
    const sock = this.socket;
    if (sock === null) return;
    this.socket = null;
    this.connected = false;
    await new Promise<void>((resolve) => {
      sock.end(() => {
        resolve();
      });
    });
  }

  /** Force-close the socket. Used when the FSM decides the peer is unreachable. */
  destroy(): void {
    const sock = this.socket;
    if (sock === null) return;
    this.socket = null;
    this.connected = false;
    sock.destroy();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Diagnostic: bytes buffered by the parser awaiting CRLF. */
  get pendingBytes(): number {
    return this.parser.pendingBytes;
  }

  private attachHandlers(sock: net.Socket): void {
    sock.on('data', (chunk: string) => {
      this.parser.feed(chunk);
    });
    sock.on('error', (err) => {
      this.emit('error', err);
    });
    sock.on('close', (hadError: boolean) => {
      const wasConnected = this.connected;
      this.socket = null;
      this.connected = false;
      if (wasConnected) {
        this.emit('close', { wasError: hadError });
      }
    });
  }
}

/** Re-export so consumers only need to import from one place. */
export type { ParsedAmcpResponse };

function noop(): void {
  /* see constructor — baseline error listener */
}

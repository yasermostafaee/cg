import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PROBE_HTML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'probe.html',
);

export interface BeaconMessage {
  ts: number;
  type: 'hello' | 'update' | string;
  payload?: string;
  len?: number;
  count?: number;
  source?: string;
  href?: string;
  /** B-041 escape-sweep — whether the template's own `JSON.parse(payload)` succeeded. */
  parseOk?: boolean;
}

/**
 * Serves the instrumented probe over HTTP and collects its WebSocket "beacon"
 * — every `window.update` call the probe receives is reported here, so the
 * harness can auto-detect whether (and what) the payload arrived, in addition
 * to the operator eyeballing the CasparCG output.
 */
export class ProbeServer {
  #server: http.Server | null = null;
  #wss: WebSocketServer | null = null;
  #port = 0;
  readonly messages: BeaconMessage[] = [];

  start(host: string, port: number): Promise<number> {
    const html = fs.readFileSync(PROBE_HTML, 'utf-8');
    const server = http.createServer((req, res) => {
      const url = (req.url ?? '/').split('?')[0];
      if (url === '/' || url === '/probe.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => {
      socket.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString()) as Omit<BeaconMessage, 'ts'>;
          this.messages.push({ ts: Date.now(), ...parsed });
        } catch {
          /* ignore non-JSON beacon noise */
        }
      });
    });

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        const addr = server.address();
        this.#port = typeof addr === 'object' && addr !== null ? addr.port : port;
        this.#server = server;
        this.#wss = wss;
        resolve(this.#port);
      });
    });
  }

  get port(): number {
    return this.#port;
  }

  /** The URL CasparCG should load, reachable at `serveHost` (its view of this machine). */
  probeUrl(serveHost: string): string {
    return `http://${serveHost}:${String(this.#port)}/probe.html`;
  }

  /** Did the probe page connect (a `hello`) at or after `ts`? */
  helloSince(ts: number): boolean {
    return this.messages.some((m) => m.type === 'hello' && m.ts >= ts);
  }

  /** The most recent `update` beacon at or after `ts`, or null. */
  lastUpdateSince(ts: number): BeaconMessage | null {
    const updates = this.messages.filter((m) => m.type === 'update' && m.ts >= ts);
    return updates.at(-1) ?? null;
  }

  async stop(): Promise<void> {
    this.#wss?.close();
    const server = this.#server;
    this.#server = null;
    if (server === null) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

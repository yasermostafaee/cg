import * as dgram from 'node:dgram';
import { encodeBundle, type OscMessage } from './osc-encode.js';
import type { LayerRegistry } from './layer-state.js';
import type { OscArgValue } from './types.js';

/**
 * Owns the UDP socket and the periodic OSC bundle emission. CasparCG
 * pushes OSC at frame rate; the mock samples at a configurable lower Hz
 * to keep tests readable.
 *
 * Per ADR 0004 the emitted addresses are:
 *  - `/channel/N/framerate` once per tick
 *  - `/channel/N/mixer/audio/volume` once per tick (eight zeros)
 *  - `/channel/N/stage/layer/L/foreground/producer` per allocated slot
 *  - `/channel/N/stage/layer/L/foreground/file/path` per allocated slot
 *  - `/channel/N/stage/layer/L/foreground/paused` per allocated slot
 *  - `/channel/N/stage/layer/L/background/producer` per allocated slot
 *
 * No /cg.invoked or /foreground/file/frame — those don't exist in 2.3.x.
 */
export class OscEmitter {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly observers = new Set<{ host: string; port: number }>();
  private boundPort = 0;

  constructor(
    private readonly registry: LayerRegistry,
    private readonly channelCount: number,
    private readonly hz: number,
  ) {}

  async start(bindHost: string, defaultHost: string, defaultPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      sock.on('error', reject);
      sock.bind(0, bindHost, () => {
        sock.off('error', reject);
        const addr = sock.address();
        this.socket = sock;
        this.boundPort = addr.port;
        if (defaultPort > 0) {
          this.observers.add({ host: defaultHost, port: defaultPort });
        }
        this.startTimer();
        resolve(this.boundPort);
      });
    });
  }

  /** Add a UDP destination. CasparCG's `<osc><predefined-clients>` analogue. */
  addObserver(host: string, port: number): void {
    this.observers.add({ host, port });
  }

  /** Encode + send `messages` as one bundle to every observer. */
  sendBundle(messages: readonly OscMessage[]): void {
    if (this.socket === null || messages.length === 0) return;
    const buf = encodeBundle(messages);
    for (const obs of this.observers) {
      this.socket.send(buf, obs.port, obs.host);
    }
  }

  /** Send a single ad-hoc message (test hook). */
  sendMessage(address: string, args: readonly OscArgValue[]): void {
    this.sendBundle([{ address, args }]);
  }

  get port(): number {
    return this.boundPort;
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const sock = this.socket;
    if (sock === null) return;
    this.socket = null;
    await new Promise<void>((resolve) => {
      sock.close(() => {
        resolve();
      });
    });
  }

  private startTimer(): void {
    if (this.hz <= 0) return;
    const periodMs = Math.max(1, Math.round(1000 / this.hz));
    this.timer = setInterval(() => {
      this.emitTick();
    }, periodMs);
    // Don't keep the process alive just for OSC ticks.
    this.timer.unref();
  }

  private emitTick(): void {
    const messages: OscMessage[] = [];
    for (let ch = 1; ch <= this.channelCount; ch++) {
      messages.push({ address: `/channel/${String(ch)}/framerate`, args: [50, 1] });
      messages.push({
        address: `/channel/${String(ch)}/mixer/audio/volume`,
        args: [0, 0, 0, 0, 0, 0, 0, 0],
      });
    }
    for (const layer of this.registry.all()) {
      const base = `/channel/${String(layer.slot.channel)}/stage/layer/${String(layer.slot.layer)}`;
      messages.push({
        address: `${base}/foreground/producer`,
        args: [layer.producer],
      });
      if (layer.producer !== 'empty') {
        messages.push({
          address: `${base}/foreground/file/path`,
          args: [layer.filePath],
        });
        messages.push({
          address: `${base}/foreground/paused`,
          args: [layer.paused],
        });
      }
      messages.push({
        address: `${base}/background/producer`,
        args: [layer.backgroundProducer],
      });
    }
    this.sendBundle(messages);
  }
}

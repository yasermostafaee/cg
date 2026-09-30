import * as dgram from 'node:dgram';
import { encodeBundle, type OscMessage } from './osc-encode.js';
import { clipElapsedAt, type LayerRegistry } from './layer-state.js';
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
 *  - `MEDIA-PLATES-01` — for a media clip whose length the mock knows:
 *    `/channel/N/stage/layer/L/foreground/file/time` (elapsed, length — seconds, as 2.5.0's
 *    `av_producer.cpp` sends `state_["file/time"]`) and `/foreground/loop`
 *
 * No /cg.invoked or /foreground/file/frame — those don't exist in 2.3.x.
 */
export class OscEmitter {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  /**
   * `CENTRAL-BRIDGE-01` — every destination, keyed by `host:port` and REFERENCE-COUNTED, as the
   * core's OSC client keeps its subscribers (`osc::client::get_subscription_token`): two holders of
   * one endpoint — a predefined client and an `OSC SUBSCRIBE` to the same address — get ONE copy
   * of each packet, and the endpoint stops only when its last holder lets go.
   */
  private readonly observers = new Map<string, { host: string; port: number; holders: number }>();
  private boundPort = 0;

  constructor(
    private readonly registry: LayerRegistry,
    private readonly channelCount: number,
    private readonly hz: number,
    /** `MEDIA-PLATES-01` — the mock clock (ms) a clip's elapsed time is read at. */
    private readonly now: () => number = () => performance.now(),
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
          this.subscribe(defaultHost, defaultPort);
        }
        this.startTimer();
        resolve(this.boundPort);
      });
    });
  }

  /** Add a UDP destination. CasparCG's `<osc><predefined-clients>` analogue. */
  addObserver(host: string, port: number): void {
    this.subscribe(host, port);
  }

  /**
   * `CENTRAL-BRIDGE-01` — hold `host:port` as a destination until the returned release is called:
   * what `OSC SUBSCRIBE` and the core's per-client default subscription each take, and give back
   * when their AMCP connection ends. Releasing twice releases once.
   */
  subscribe(host: string, port: number): () => void {
    const key = `${host}:${String(port)}`;
    const held = this.observers.get(key);
    if (held === undefined) this.observers.set(key, { host, port, holders: 1 });
    else held.holders += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const entry = this.observers.get(key);
      if (entry === undefined) return;
      entry.holders -= 1;
      if (entry.holders <= 0) this.observers.delete(key);
    };
  }

  /** `CENTRAL-BRIDGE-01` — every destination now, one per endpoint (a test's instrument). */
  destinations(): readonly { host: string; port: number }[] {
    return [...this.observers.values()].map((o) => ({ host: o.host, port: o.port }));
  }

  /** Encode + send `messages` as one bundle to every observer. */
  sendBundle(messages: readonly OscMessage[]): void {
    if (this.socket === null || messages.length === 0) return;
    const buf = encodeBundle(messages);
    for (const obs of this.observers.values()) {
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
    // `RELEASE-091-01` B2 — the layers ON THE STAGE only: a cleared layer is erased from the core's
    // stage and simply stops being reported (`stage.cpp` rebuilds the state from what exists).
    for (const layer of this.registry.onStage()) {
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
        const elapsed = layer.producer === 'ffmpeg' ? clipElapsedAt(layer, this.now()) : undefined;
        if (elapsed !== undefined && layer.clipLengthS !== undefined) {
          messages.push({
            address: `${base}/foreground/file/time`,
            args: [elapsed, layer.clipLengthS],
          });
          messages.push({ address: `${base}/foreground/loop`, args: [layer.loop] });
        }
      }
      messages.push({
        address: `${base}/background/producer`,
        args: [layer.backgroundProducer],
      });
    }
    this.sendBundle(messages);
  }
}

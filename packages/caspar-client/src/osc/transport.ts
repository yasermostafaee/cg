import * as dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import type { OscEvent } from '@cg/shared-schema';
import { flatten, parsePacket } from './parser.js';
import { messageToEvent } from './event-mapper.js';
import { OscRateLimiter } from './rate-limiter.js';
import { OscChangeTracker } from './change-tracker.js';
import { OscInterestFilter } from './interest.js';
import { OscOccupancyTap } from './occupancy-tap.js';

/**
 * OscTransport — UDP receiver for CasparCG 2.3.x's pushed OSC stream.
 *
 * Pipeline (Phase 5 §4):
 *   raw UDP packet
 *     → parsePacket          (decode OSC bundle/message)
 *     → flatten              (atomic burst → flat message list)
 *     → messageToEvent       (drop addresses we don't model)
 *     → occupancy tap        (R-009: passive note of producer state — NOT a
 *                             filter, adds nothing to the pipeline)
 *     → interest filter      (drop out-of-interest channel/layer)
 *     → rate limiter         (suppress per-kind floods, default 1Hz framerate)
 *     → change tracker       (dispatch-on-change only)
 *     → emit 'events'        ([OscEvent[], { recvAt }]) — once per UDP packet
 *
 * The atomic-burst semantics matter for the Reconciler — addresses inside
 * one bundle reflect a single channel tick and should be applied together
 * to avoid partial-state races.
 *
 * The transport doesn't bind a destination; CasparCG pushes to whatever
 * port it's configured for. Bind locally with `listen(host, port)`.
 */
export class OscTransport extends EventEmitter<OscTransportEvents> {
  private socket: dgram.Socket | null = null;
  private boundPort = 0;
  private boundAddress = '';
  private packetsReceived = 0;
  private parseFailures = 0;

  readonly interest: OscInterestFilter;
  readonly rateLimiter: OscRateLimiter;
  readonly changeTracker: OscChangeTracker;
  /**
   * R-009 — passive occupancy tap, fed BEFORE the interest drop so it sees
   * every layer's producer state. Emits nothing into the pipeline; the
   * bridge's periodic orphan sweep samples it.
   */
  readonly occupancy: OscOccupancyTap;

  constructor(options: OscTransportOptions = {}) {
    super();
    this.interest = options.interest ?? new OscInterestFilter();
    this.rateLimiter = options.rateLimiter ?? new OscRateLimiter();
    this.changeTracker = options.changeTracker ?? new OscChangeTracker();
    this.occupancy = options.occupancy ?? new OscOccupancyTap();
    this.on('error', noop);
  }

  /** Bind the UDP socket. Pass `port: 0` for an OS-assigned ephemeral port. */
  async listen(host: string, port: number): Promise<number> {
    if (this.socket !== null) {
      throw new Error('OscTransport: already listening');
    }
    const sock = dgram.createSocket('udp4');
    return new Promise((resolve, reject) => {
      const onErrorPreBind = (err: Error): void => {
        sock.off('listening', onListening);
        sock.close();
        reject(err);
      };
      const onListening = (): void => {
        sock.off('error', onErrorPreBind);
        const addr = sock.address();
        this.socket = sock;
        this.boundPort = addr.port;
        this.boundAddress = addr.address;
        this.attachHandlers(sock);
        resolve(addr.port);
      };
      sock.once('error', onErrorPreBind);
      sock.once('listening', onListening);
      sock.bind(port, host);
    });
  }

  async close(): Promise<void> {
    const sock = this.socket;
    if (sock === null) return;
    this.socket = null;
    await new Promise<void>((resolve) => {
      sock.close(() => {
        resolve();
      });
    });
  }

  /** Reset the change tracker and rate limiter (e.g. after a resync). */
  resetState(): void {
    this.changeTracker.reset();
    this.rateLimiter.reset();
    this.interest.resetDroppedCount();
    // R-009 — occupancy re-accumulates from the fresh session's stream
    // within a tick; carrying pre-reconnect ghosts would fake orphans.
    this.occupancy.reset();
  }

  get port(): number {
    return this.boundPort;
  }

  get address(): string {
    return this.boundAddress;
  }

  /** Telemetry: how many UDP packets the receiver has consumed. */
  get receivedCount(): number {
    return this.packetsReceived;
  }

  /** Telemetry: packets that failed to parse as OSC. */
  get parseFailureCount(): number {
    return this.parseFailures;
  }

  private attachHandlers(sock: dgram.Socket): void {
    sock.on('message', (buf: Buffer) => {
      this.packetsReceived++;
      const recvAt = Date.now();
      const packet = parsePacket(buf);
      if (packet === null) {
        this.parseFailures++;
        return;
      }
      const messages = flatten(packet);
      const events: OscEvent[] = [];
      for (const msg of messages) {
        const event = messageToEvent(msg);
        if (event === null) continue;
        // R-009 — the passive occupancy tap sees EVERY parsed producer
        // event, BEFORE the interest drop; it never adds to `events`.
        this.occupancy.note(event, recvAt);
        if (!this.interest.shouldEmit(event)) continue;
        if (!this.rateLimiter.shouldEmit(event)) continue;
        if (!this.changeTracker.shouldEmit(event)) continue;
        events.push(event);
      }
      // Emit once per UDP packet — even when the burst is empty — so the
      // Reconciler can treat freshness as "we heard from the server."
      this.emit('events', events, { recvAt });
    });
    sock.on('error', (err) => {
      this.emit('error', err);
    });
  }
}

export interface OscTransportOptions {
  interest?: OscInterestFilter;
  rateLimiter?: OscRateLimiter;
  changeTracker?: OscChangeTracker;
  occupancy?: OscOccupancyTap;
}

export interface OscTransportEvents {
  events: [events: OscEvent[], meta: { recvAt: number }];
  error: [err: Error];
}

function noop(): void {
  /* baseline error listener — see AmcpTransport for rationale */
}

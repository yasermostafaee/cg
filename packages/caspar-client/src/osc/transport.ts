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
  private readonly expectedSourceHost: string | undefined;

  constructor(options: OscTransportOptions = {}) {
    super();
    this.interest = options.interest ?? new OscInterestFilter();
    this.rateLimiter = options.rateLimiter ?? new OscRateLimiter();
    this.changeTracker = options.changeTracker ?? new OscChangeTracker();
    this.occupancy = options.occupancy ?? new OscOccupancyTap();
    this.expectedSourceHost = options.expectedSourceHost;
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

  /**
   * Does this datagram come from the server we are supposed to be hearing?
   *
   * Unconfigured (or loopback-bound) transports accept anything, which keeps the
   * unit tests and the local single-box case working exactly as before. The
   * comparison tolerates IPv4-mapped IPv6 (`::ffff:a.b.c.d`), which is how a
   * dual-stack bind reports an IPv4 sender.
   */
  private isExpectedSource(address: string): boolean {
    const expected = this.expectedSourceHost;
    if (expected === undefined || expected === '') return true;
    const normalize = (a: string): string => a.replace(/^::ffff:/i, '');
    return normalize(address) === normalize(expected);
  }

  private attachHandlers(sock: dgram.Socket): void {
    sock.on('message', (buf: Buffer, rinfo: dgram.RemoteInfo) => {
      this.packetsReceived++;
      const recvAt = Date.now();
      const packet = parsePacket(buf);
      if (packet === null) {
        this.parseFailures++;
        return;
      }
      // The tap learns we are HEARING this server, separately from what any
      // layer reports. Packet-level on purpose: an idle channel emits no
      // per-layer producer messages at all, so producer events cannot tell a
      // healthy-but-idle server from a tap that is receiving nothing.
      //
      // …but only from the RIGHT server: another box's OSC is not evidence about
      // this one (see `expectedSourceHost`). Trust signal only — the parsed
      // events below are untouched either way.
      if (this.isExpectedSource(rinfo.address)) this.occupancy.noteTraffic(recvAt);
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
  /**
   * The server this transport is supposed to be hearing from. When set, only OSC
   * arriving FROM that address counts as evidence that we are hearing THIS
   * server (`OscOccupancyTap.hasFreshOsc`).
   *
   * The ingest binds a routable interface for a remote server (R-010), so any
   * host on the LAN can deliver OSC to this port — including a second CasparCG
   * whose config points at us. Without this, that foreign stream permanently
   * satisfies the "am I hearing my server?" gate while the real primary's OSC is
   * firewalled: precisely the blind install the gate exists to catch, wearing a
   * disguise. Verified reproducible by adversarial review.
   *
   * It filters the TRUST signal ONLY. Parsed events still flow to `note()` and
   * the pipeline unchanged, so `occupied()`, the R-009 orphan sweep and B-086's
   * reconcile see exactly what they saw before.
   */
  expectedSourceHost?: string;
}

export interface OscTransportEvents {
  events: [events: OscEvent[], meta: { recvAt: number }];
  error: [err: Error];
}

function noop(): void {
  /* baseline error listener — see AmcpTransport for rationale */
}

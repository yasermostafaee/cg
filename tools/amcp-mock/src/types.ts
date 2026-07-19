/**
 * AMCP request: one parsed command line. Tokens are post-tokenizer
 * (quoting removed). `raw` keeps the original wire bytes for logging.
 */
export interface AmcpRequest {
  /** First token, uppercased (e.g. `PLAY`, `CG`). */
  verb: string;
  /** Remaining tokens, in order, with quotes stripped. */
  args: readonly string[];
  /** Original line minus trailing CRLF. */
  raw: string;
}

/** Outbound AMCP response shape, before serialization. */
export type AmcpResponse =
  | { kind: 'ok'; code: 202; verb: string }
  | { kind: 'ok-line'; code: 201; verb: string; data: string }
  | { kind: 'ok-multi'; code: 200; verb: string; lines: readonly string[] }
  | { kind: 'err'; code: number; verb: string; detail?: string };

/**
 * Identifies a layer slot. Channels are 1-based per CasparCG convention.
 */
export interface LayerSlot {
  readonly channel: number;
  readonly layer: number;
}

/** Reconnect-reconciliation — a `CG ADD` template fetch's asynchronous verdict. */
export type CgAddResolution = 'pending' | 'resolved' | 'failed';

/**
 * Observable layer state. Mirrors what CasparCG 2.3.x emits via OSC
 * (see ADR 0004) — `producer` is the load-bearing signal.
 */
export interface LayerState {
  readonly slot: LayerSlot;
  /**
   * `'empty'` when the slot is idle; `'html'` when an HTML page is loaded;
   * `'ffmpeg'` when a media file is playing (R-015 — real CasparCG reports the
   * producer KIND per layer over OSC, and the video-layer protection keys on
   * exactly this discriminator, so the mock must tell the truth about media).
   */
  producer: 'empty' | 'html' | 'ffmpeg';
  /** Loaded file path (URL string). Only meaningful when `producer !== 'empty'`. */
  filePath: string;
  /** Background "next-up" producer. CasparCG emits this on every framerate tick. */
  backgroundProducer: 'empty' | 'html';
  /** Play/pause flag — `false` means playing. */
  paused: boolean;
  /**
   * B-039 — whether a CG template producer is loaded AND playing (on air). `CG ADD`
   * sets it from the play-on-load flag; `CG PLAY` sets it true ONLY when a producer
   * is loaded (PLAY on an empty/destroyed layer is an observable no-op); `CLEAR` /
   * `CG REMOVE` reset it. Lets tests distinguish "playing a producer" from "PLAY on
   * nothing" — the exact gap the old blind-ack hid.
   */
  onAir: boolean;
  /**
   * Reconnect-reconciliation — the html page's async load outcome, mirroring the
   * real producer's CEF load: a URL `CG ADD` acks `202` immediately and the page
   * resolves asynchronously (`'pending'` → `'resolved' | 'failed'`). A `'failed'`
   * page produces empty frames (master's `OnLoadError`; the queued `play()` never
   * flushes): `CG PLAY` on it still `202`s but stays observably off air. Only
   * meaningful when `producer === 'html'`; non-fetching producer paths
   * (`LOAD`/`PLAY` media) are `'resolved'`.
   */
  pageResolution: CgAddResolution;
}

/** B-041 — why the mock's second-layer (html_cg_proxy → V8) emulation rejected a CG data arg. */
export interface CgDataRejection {
  reason: 'raw-control-char' | 'js-syntax-error' | 'invalid-json';
  /** The tokenizer-decoded (layer-1) wire argument that failed validation. */
  decodedArg: string;
  /** Human-readable specifics for test-failure messages. */
  detail: string;
}

/**
 * B-041 — outcome of decoding a `CG ADD` / `CG UPDATE` data argument through
 * BOTH emulated un-escape layers (AMCP tokenizer, then html_cg_proxy → V8).
 */
export interface CgDataResult {
  /**
   * The string `window.update` would receive — post BOTH layers — or `null`
   * when the argument was rejected (real CasparCG still `202`s such a command;
   * the V8 error just means the update never fires).
   */
  data: string | null;
  /** Present iff the argument was rejected/flagged. */
  rejected?: CgDataRejection;
}

export interface MockOptions {
  /**
   * AMCP TCP port. Default 5250. Pass `0` for an OS-assigned ephemeral port
   * — useful for tests so concurrent runs don't collide.
   */
  amcpPort?: number;
  /** OSC UDP port. Default 6250. `0` = ephemeral. */
  oscPort?: number;
  /** OSC destination host. Default `'127.0.0.1'`. */
  oscHost?: string;
  /** AMCP TCP bind interface. Default `'127.0.0.1'`. */
  host?: string;
  /**
   * Hz at which the OSC emitter ticks per channel. CasparCG observed at
   * roughly 50 Hz (one tick per frame on a 1080i50 channel); the mock
   * defaults to 10 Hz to keep test traffic readable. Set higher for soak.
   */
  oscHz?: number;
  /** Initial channel count. Default 1. Each channel runs at 50 fps numerator/denominator. */
  channels?: number;
  /** Optional path to an NDJSON wire-trace file. */
  tracePath?: string;
  /** Disable the OSC emitter loop. Useful for command-only tests. */
  disableOsc?: boolean;
}

export interface MockHandle {
  /** Bound AMCP port. Reflects the OS-assigned port when `amcpPort: 0`. */
  readonly amcpPort: number;
  /** Bound OSC source port. */
  readonly oscPort: number;
  readonly host: string;
  /** Send an OSC packet to all observers right now. Test hook. */
  emitOsc(address: string, args: readonly OscArgValue[]): void;
  /**
   * Register a UDP destination for the mock's OSC stream — both the
   * periodic heartbeat tick (if enabled) and ad-hoc `emitOsc()` calls.
   *
   * Useful when the runtime's ServerSession binds to an ephemeral port:
   * call this after `session.osc.port` is known, before triggering OSC
   * scenarios.
   */
  addOscObserver(host: string, port: number): void;
  /** Force-close every connected AMCP client. Test hook for reset/timeout scenarios. */
  closeAllAmcpConnections(): void;
  /** Inject an arbitrary handler for one command verb (overrides defaults). Test hook. */
  setHandler(verb: string, handler: AmcpHandler): void;
  /** Snapshot of the layer the slot currently has. */
  layerState(slot: LayerSlot): LayerState | undefined;
  /**
   * B-038 — the last `CG ADD` seen on a slot: the template argument and the data
   * payload. Lets tests assert `CG ADD` carried a real URL + non-empty fields.
   * B-041 — `data` is what `window.update` would receive (post BOTH un-escape
   * layers); a framing/JSON-breaking argument is surfaced via `rejected`.
   * Reconnect-reconciliation — `resolution` is the async template-fetch verdict
   * (`'pending'` until the GET settles; a bare non-URL id settles `'failed'`
   * immediately). Tests assert delivery through it, never through a synthetic
   * AMCP failure.
   */
  lastCgAdd(
    slot: LayerSlot,
  ): ({ template: string; resolution: CgAddResolution } & CgDataResult) | undefined;
  /**
   * Reconnect-reconciliation — resolves with the slot's LAST `CG ADD` async
   * fetch verdict once it settles (`'resolved' | 'failed'`); rejects on timeout
   * (default 2500 ms) if no ADD was seen or the verdict never settles.
   */
  waitForCgAddResolution(slot: LayerSlot, timeoutMs?: number): Promise<'resolved' | 'failed'>;
  /**
   * Flush barrier for the NDJSON wire trace (`tracePath`): resolves once every
   * trace line queued so far has reached the file. The trace stream writes
   * asynchronously, so a test must await this before reading the file — a
   * fixed sleep is contention-fragile (a truncated read misses lines or
   * misaligns offset-based slicing). No-op without a `tracePath`.
   */
  traceFlush(): Promise<void>;
  /** B-038/B-041 — the last `CG UPDATE` data payload seen on a slot (see `lastCgAdd`). */
  lastCgUpdate(slot: LayerSlot): CgDataResult | undefined;
  /** Number of currently-connected AMCP clients. */
  readonly amcpClientCount: number;
  /** Shut down both servers and resolve when fully closed. */
  stop(): Promise<void>;
}

export type AmcpHandler = (
  req: AmcpRequest,
  ctx: HandlerContext,
) => AmcpResponse | Promise<AmcpResponse>;

export interface HandlerContext {
  /** Get a layer's current state (creates an `'empty'` entry on first read). */
  getLayer(slot: LayerSlot): LayerState;
  /** Apply a partial update to a layer; emits OSC reflecting the new state. */
  setLayer(slot: LayerSlot, patch: Partial<Omit<LayerState, 'slot'>>): void;
  /**
   * B-038/B-041 — record a `CG ADD`'s template argument + decoded data verdict.
   * Returns an ownership token identifying THIS add — its async completion
   * passes the token back so a stale fetch can never settle a newer add's
   * verdict (two ADDs of the same URL on one slot are otherwise ambiguous).
   */
  recordCgAdd(slot: LayerSlot, template: string, result: CgDataResult): number;
  /** B-038/B-041 — record a `CG UPDATE`'s decoded data verdict. */
  recordCgUpdate(slot: LayerSlot, result: CgDataResult): void;
  /**
   * Reconnect-reconciliation — load a URL `CG ADD`'s page onto the layer
   * (producer exists immediately, resolution pending) and record the add
   * (by its `recordCgAdd` token) as the page's owner: only the owning add's
   * completion may settle the layer's `pageResolution`.
   */
  loadCgPage(slot: LayerSlot, token: number, template: string, playOnLoad: boolean): void;
  /**
   * Reconnect-reconciliation — settle a `CG ADD`'s async template resolution
   * (identified by the token `recordCgAdd` returned). The RECORDED verdict
   * settles only for the slot's latest add; the LAYER's `pageResolution`
   * settles only for the page's owning add (a failed page also drops `onAir`
   * — the queued `play()` never flushed). Anything staler is ignored.
   */
  completeCgAdd(slot: LayerSlot, token: number, resolved: boolean): void;
  /** Channel count the mock was started with. */
  readonly channelCount: number;
}

/** OSC argument value union — only the types CasparCG 2.3.x actually emits (per ADR 0004). */
export type OscArgValue = number | string | boolean;

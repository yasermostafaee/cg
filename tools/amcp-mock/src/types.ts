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

/**
 * Observable layer state. Mirrors what CasparCG 2.3.x emits via OSC
 * (see ADR 0004) — `producer` is the load-bearing signal.
 */
export interface LayerState {
  readonly slot: LayerSlot;
  /** `'empty'` when the slot is idle; `'html'` when an HTML page is loaded. */
  producer: 'empty' | 'html';
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
   */
  lastCgAdd(slot: LayerSlot): ({ template: string } & CgDataResult) | undefined;
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
  /** B-038/B-041 — record a `CG ADD`'s template argument + decoded data verdict. */
  recordCgAdd(slot: LayerSlot, template: string, result: CgDataResult): void;
  /** B-038/B-041 — record a `CG UPDATE`'s decoded data verdict. */
  recordCgUpdate(slot: LayerSlot, result: CgDataResult): void;
  /** Channel count the mock was started with. */
  readonly channelCount: number;
}

/** OSC argument value union — only the types CasparCG 2.3.x actually emits (per ADR 0004). */
export type OscArgValue = number | string | boolean;

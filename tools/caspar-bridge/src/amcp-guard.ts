import { FIRST_ALLOCATABLE_LAYER, LAYER_BANDS } from '@cg/shared-ipc';

/**
 * 🔴 `ROUTE-PLATES-01` §1.E — **THE ONE QUESTION ASKED OF EVERY AMCP LINE BEFORE IT IS WRITTEN: may
 * this station send it at all?** Contract v1.3 rule 3 with the Playout's C5 additions
 * (`PLAYOUT-CG-RESPONSE-V13-STATE` §3.5) and our acceptance (`CG-CONTROL-REPLY-V13-STATE` §3).
 *
 * It is a GUARD, not a new fence: the station fence already refuses a request for a channel this
 * station does not operate (`#isDeclaredChannel`, the request gate's `not-declared`). This is the
 * backstop at the seam every command passes through, so a line no request should ever have produced
 * — a holder channel's number read off D10, a planted test line, a regression — never leaves the
 * process. A refused line is answered like a refused command, and nothing is sent.
 *
 * Refused, whatever the channel:
 *
 * - a command whose TARGET channel is not a declared programme channel — the Playout's holder and
 *   guard channels are never declared, so they can never be a target;
 * - `CLEAR <ch>` (the whole channel — it clears the Playout's own layer too);
 * - `MIXER <ch> CLEAR` (the channel-wide mixer clear — it resets the Playout layer's gain, and every
 *   hidden plate on the channel comes back visible and loud next tick);
 * - `SWAP`, `SET … MODE`, consumer `ADD` / `REMOVE` (never `CG … ADD` / `CG … REMOVE`, our own
 *   page on our own layer), `CLEAR ALL`, `CHANNEL_GRID`;
 * - `CLEAR <ch>-<L>` outside CG's layers ({@link FIRST_ALLOCATABLE_LAYER} to the template band's
 *   top — 50–99) — "only on your own layers (50 to 99)", as C5 words it — unless the station's own
 *   CONFIG declares that layer ({@link AmcpGuardContext.isOwnLayer});
 * - `MIXER <ch>-<L> CLEAR` on a layer that holds a SEATED plate (the same next-tick reveal, one
 *   layer at a time);
 * - a PLAYOUT route (`route://H`) with no layer (rule 3: it stacks every held input);
 * - `MEDIA-PLATES-01` — `PAUSE`, `RESUME` or `CALL` to any coordinate but a seated CLIP of ours
 *   ({@link AmcpGuardContext.clipOn}).
 *
 * `INFO` is read-only and names what it reads; it is not a target in rule 3's sense and is left alone.
 */

/** The station facts the guard reads. Every answer comes from the bridge's one source for it. */
export interface AmcpGuardContext {
  /** `#isDeclaredChannel` — the ONE answer to "does this station operate channel N". */
  readonly isDeclaredChannel: (channel: number) => boolean;
  /** Does the ledger hold a seated plate on this coordinate right now? */
  readonly seatedPlateOn: (channel: number, layer: number) => boolean;
  /**
   * Does this station's own CONFIG declare this layer — a bank row, a bed row, the plate band, a
   * dynamic range — on a declared channel, and not a reserved one? On every station that can boot
   * these all lie inside 50–99 (a bank or bed row below its band is refused at boot, and the plate
   * band must lie above the beds), so on a real station C5's `CLEAR` rule reads exactly as the
   * contract words it. Absent: no layer outside 50–99 is the station's.
   */
  readonly isOwnLayer?: (channel: number, layer: number) => boolean;
  /**
   * The line seats a PLAYOUT route (a D10 input). Rule 3's "a `route://H` with no layer" is asked of
   * these only: a hand-made `route://N` names a programme channel, not a holder, and keeps today's
   * wire (`ROUTE-PLATES-01`'s hard stop: byte-identical for every plate not bound to D10).
   */
  readonly playoutRoute?: boolean;
  /**
   * 🔴 `MEDIA-PLATES-01` — does the ledger hold a media CLIP of ours on this coordinate? `PAUSE`,
   * `RESUME` and `CALL` are only ever meant for one. On the Playout's core a `CALL` to anything but a
   * file producer (DeckLink, NDI, a route) gets NO reply and holds every channel's AMCP for 5 s, and a
   * `SEEK` can freeze a live stream for good (`PLAYOUT-DESIGN-INPUT-HOLDER-v1.md` §8 #2); a route is
   * never paused (contract v1.3). Absent: this rule is not asked (a context without a ledger).
   */
  readonly clipOn?: (channel: number, layer: number) => boolean;
}

/** `MEDIA-PLATES-01` — the transport verbs, which only a seated clip of ours may receive. */
const CLIP_ONLY_VERBS = new Set(['PAUSE', 'RESUME', 'CALL']);

export interface AmcpGuardRefusal {
  /** `amcp-guard-<what>`, for the log and the refusal's code. */
  readonly code: string;
  /** One sentence, for the log. */
  readonly reason: string;
}

/** The last layer this station may clear: the top of the template band. */
const LAST_CG_LAYER = LAYER_BANDS.template.end;

/** Verbs a reserved channel must never receive (rule 3's list), besides `INFO`. */
const TARGETED_VERBS = new Set([
  'PLAY',
  'LOAD',
  'LOADBG',
  'STOP',
  'CLEAR',
  'PAUSE',
  'RESUME',
  'CALL',
  'MIXER',
  'ADD',
  'REMOVE',
  'SWAP',
  'SET',
  'CG',
]);

/** A `<channel>` or `<channel>-<layer>` token, or `null` when the token is neither. */
function targetOf(token: string | undefined): { channel: number; layer?: number } | null {
  if (token === undefined) return null;
  const match = /^(\d+)(?:-(\d+))?$/.exec(token);
  if (match === null) return null;
  const channel = Number(match[1]);
  if (match[2] === undefined) return { channel };
  return { channel, layer: Number(match[2]) };
}

/** `route://H` (no layer) anywhere on the line — rule 3's refusal. */
const ROUTE_WITHOUT_LAYER = /route:\/\/\d+(?!-\d)(?=["\s]|$)/i;

/**
 * Answer why `line` must not be sent, or `null` when it may be. Pure: the facts come in through
 * `context`, so every branch is testable without a server.
 */
export function amcpLineRefusal(line: string, context: AmcpGuardContext): AmcpGuardRefusal | null {
  const tokens = line.trim().split(/\s+/);
  const verb = (tokens[0] ?? '').toUpperCase();
  const second = (tokens[1] ?? '').toUpperCase();

  if (verb === 'CHANNEL_GRID') {
    return { code: 'amcp-guard-global', reason: 'CHANNEL_GRID is never sent (rule 3)' };
  }
  if (verb === 'CLEAR' && second === 'ALL') {
    return { code: 'amcp-guard-global', reason: 'CLEAR ALL is never sent (rule 3)' };
  }
  if (verb === 'SWAP') {
    return { code: 'amcp-guard-forbidden', reason: 'SWAP is never sent (C5)' };
  }
  if (verb === 'SET' && tokens.some((t) => t.toUpperCase() === 'MODE')) {
    return { code: 'amcp-guard-forbidden', reason: 'SET MODE is never sent (C5)' };
  }
  if (verb === 'ADD' || verb === 'REMOVE') {
    return {
      code: 'amcp-guard-forbidden',
      reason: `a consumer ${verb} is never sent (C5); our pages go by CG … ${verb}`,
    };
  }
  if (context.playoutRoute === true && ROUTE_WITHOUT_LAYER.test(line)) {
    return {
      code: 'amcp-guard-route-layer',
      reason: 'a Playout route:// with no layer is never sent (rule 3)',
    };
  }

  if (!TARGETED_VERBS.has(verb)) return null;
  const target = targetOf(tokens[1]);
  if (target === null) return null;
  if (!context.isDeclaredChannel(target.channel)) {
    return {
      code: 'amcp-guard-channel',
      reason: `channel ${String(target.channel)} is not a declared programme channel`,
    };
  }
  if (verb === 'CLEAR') {
    if (target.layer === undefined) {
      return {
        code: 'amcp-guard-forbidden',
        reason: `CLEAR ${String(target.channel)} clears the whole channel (C5)`,
      };
    }
    const inCgLayers = target.layer >= FIRST_ALLOCATABLE_LAYER && target.layer <= LAST_CG_LAYER;
    if (!inCgLayers && context.isOwnLayer?.(target.channel, target.layer) !== true) {
      return {
        code: 'amcp-guard-layer',
        reason:
          `CLEAR ${String(target.channel)}-${String(target.layer)} is outside CG's layers ` +
          `${String(FIRST_ALLOCATABLE_LAYER)}-${String(LAST_CG_LAYER)}`,
      };
    }
  }
  if (CLIP_ONLY_VERBS.has(verb) && context.clipOn !== undefined) {
    if (target.layer === undefined || !context.clipOn(target.channel, target.layer)) {
      return {
        code: 'amcp-guard-not-a-clip',
        reason:
          `${verb} ${String(target.channel)}${target.layer === undefined ? '' : `-${String(target.layer)}`} ` +
          `is for a seated clip of ours, and none is there`,
      };
    }
  }
  if (verb === 'MIXER' && tokens.length >= 3 && (tokens[2] ?? '').toUpperCase() === 'CLEAR') {
    // The reasons never spell the wire line: `mixer-scope-pins` holds `mixerClear` to be the ONLY
    // code that builds one, and a log sentence is not an exception to that.
    if (target.layer === undefined) {
      return {
        code: 'amcp-guard-forbidden',
        reason: `a channel-wide mixer clear resets all of channel ${String(target.channel)} (C5)`,
      };
    }
    if (context.seatedPlateOn(target.channel, target.layer)) {
      return {
        code: 'amcp-guard-forbidden',
        reason:
          `a mixer clear of ${String(target.channel)}-${String(target.layer)} under a seated ` +
          `plate would show it, loud, next tick (C5)`,
      };
    }
  }
  return null;
}

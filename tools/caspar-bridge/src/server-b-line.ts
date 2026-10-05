import {
  BACKUP_GUARD_CODE,
  BACKUP_ROUTE_CODE,
  BACKUP_UNMAPPED_CODE,
  FIRST_ALLOCATABLE_LAYER,
  LAYER_BANDS,
} from '@cg/shared-ipc';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **THE LINE SERVER B GETS: ITS OWN CHANNEL NUMBER, OR NOTHING.**
 *
 * On the Playout, the mirror of the primary's channel N is the backup engine's own channel M, and the
 * backup's channel N is another channel — maybe another programme on air, a preview, a holder or a guard
 * (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §2). Their rule: never the primary's number on the backup; with no
 * known mapping, nothing for that channel. Two pure functions, composed by the runtime into the ONE
 * `serverBLine` the redundancy adapter asks on every road to server B (`RedundancyAdapter.ownLine`):
 *
 *   1. {@link translateForServerB} — the station line's channel N becomes M, the layer and every other byte
 *      unchanged. A `route://` anywhere, a channel with no mapping in force, or a line of no known shape is
 *      refused. A line that names no channel (`VERSION`, `INFO CONFIG` …) passes as it is.
 *   2. {@link serverBLineRefusal} — THE GUARD: the line about to be sent to B, judged on its own, without
 *      trusting step 1. Its channel must be one of B's mirror channels in force, its layer one of CG's layers
 *      (50–99) or the station's own configured layer, a channel-wide line only `MIXER M COMMIT` or `INFO M`.
 *      So a line that reached here untranslated — B's channel 1, a preview — is refused HERE.
 *
 * Server A's line never passes through either.
 */

/** Where every line for a station channel goes on server B, as CG Bridge holds it NOW. */
export interface BackupChannelMap {
  /** Server B's own channel for the station's channel N while N's mapping is IN FORCE; `null` — none. */
  channelOnB(channel: number): number | null;
  /**
   * The channel a TAKE on N would put in force: the resolved mapping, a held channel's included (`null` —
   * none). Read-only: {@link release} is what puts it in force.
   */
  channelOnBAtTake(channel: number): number | null;
  /** The station's channel whose mirror in force is server B's channel M; `null` — M is no mirror of ours. */
  stationChannelOf(channelOnB: number): number | null;
  /** A take on N begins: a held channel takes its newly resolved mapping (or none). */
  release(channel: number): void;
}

/** No server B, or nothing known: no channel reaches server B. The runtime's default. */
export const NO_BACKUP_CHANNELS: BackupChannelMap = {
  channelOnB: () => null,
  channelOnBAtTake: () => null,
  stationChannelOf: () => null,
  release: () => undefined,
};

export type ServerBRefusalCode =
  | typeof BACKUP_UNMAPPED_CODE
  | typeof BACKUP_ROUTE_CODE
  | typeof BACKUP_GUARD_CODE;

export type ServerBLineVerdict =
  | { readonly line: string }
  | {
      readonly refused: ServerBRefusalCode;
      readonly reason: string;
      /** The station's channel the refusal is about, when it names one. */
      readonly channel?: number;
    };

/** The verbs whose first argument is `<channel>` or `<channel>-<layer>`. */
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
  'CG',
  'INFO',
]);

/** `INFO <word>` that names no channel. */
const CHANNEL_FREE_INFO = new Set(['CONFIG', 'PATHS', 'SYSTEM', 'SERVER', 'THREADS', 'QUEUES']);

const LAST_CG_LAYER = LAYER_BANDS.template.end;

/** `verb`, the separator, token 1 and everything after it — byte for byte. */
const LINE_SHAPE = /^(\S+)(\s+)(\S+)([\s\S]*)$/;
const TARGET = /^(\d+)(?:-(\d+))?$/;
const ROUTE = /route:\/\//i;

/** A line that names no channel at all: it reaches B as it is. */
function isChannelFree(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  const verb = (tokens[0] ?? '').toUpperCase();
  const second = (tokens[1] ?? '').toUpperCase();
  if (verb === 'VERSION' && tokens.length === 1) return true;
  if (verb === 'INFO')
    return tokens.length === 1 || (tokens.length === 2 && CHANNEL_FREE_INFO.has(second));
  if (verb === 'OSC') {
    return (second === 'SUBSCRIBE' || second === 'UNSUBSCRIBE') && /^\d+$/.test(tokens[2] ?? '');
  }
  return false;
}

function refused(
  code: ServerBRefusalCode,
  reason: string,
  channel?: number,
): Extract<ServerBLineVerdict, { refused: ServerBRefusalCode }> {
  return { refused: code, reason, ...(channel !== undefined ? { channel } : {}) };
}

/**
 * Step 1 — the station's line, with server B's own channel. Never guesses: a channel with no mapping in
 * force, a `route://`, or a line of no known shape is refused.
 */
export function translateForServerB(line: string, map: BackupChannelMap): ServerBLineVerdict {
  if (ROUTE.test(line)) {
    return refused(BACKUP_ROUTE_CODE, 'a route:// is never sent to server B');
  }
  if (isChannelFree(line)) return { line };
  const shape = LINE_SHAPE.exec(line.trim());
  const verb = (shape?.[1] ?? line.trim()).toUpperCase();
  if (shape === null || !TARGETED_VERBS.has(verb)) {
    return refused(BACKUP_GUARD_CODE, `a ${verb} line of no known shape is never sent to server B`);
  }
  const [, verbText = '', sep = ' ', token = '', rest = ''] = shape;
  const target = TARGET.exec(token);
  if (target === null) {
    return refused(BACKUP_GUARD_CODE, `a ${verb} line with no channel is never sent to server B`);
  }
  const channel = Number(target[1]);
  const onB = map.channelOnB(channel);
  if (onB === null) {
    return refused(
      BACKUP_UNMAPPED_CODE,
      `no backup channel is known for CH ${String(channel)}`,
      channel,
    );
  }
  const layer = target[2] === undefined ? '' : `-${target[2]}`;
  return { line: `${verbText}${sep}${String(onB)}${layer}${rest}` };
}

export interface ServerBGuardContext {
  readonly map: BackupChannelMap;
  /** The station's own configured layer on its channel N (`#isOwnConfiguredLayer`), as A's guard asks. */
  readonly isOwnLayer: (stationChannel: number, layer: number) => boolean;
}

/**
 * Step 2 — 🔴 **THE GUARD FOR SERVER B.** The line about to be sent to B, judged alone: `null` — it may go.
 * It does not trust step 1; a line that reaches it untranslated names a channel that is not one of B's mirror
 * channels in force (B's channel 1, a preview, a holder, a guard) and is refused here, as A's guard refuses
 * layers 1–49.
 */
export function serverBLineRefusal(
  lineOnB: string,
  ctx: ServerBGuardContext,
): { readonly code: ServerBRefusalCode; readonly reason: string } | null {
  if (ROUTE.test(lineOnB)) {
    return { code: BACKUP_ROUTE_CODE, reason: 'a route:// is never sent to server B' };
  }
  if (isChannelFree(lineOnB)) return null;
  const tokens = lineOnB.trim().split(/\s+/);
  const verb = (tokens[0] ?? '').toUpperCase();
  const target = TARGET.exec(tokens[1] ?? '');
  if (!TARGETED_VERBS.has(verb) || target === null) {
    return { code: BACKUP_GUARD_CODE, reason: `a ${verb} line of no known shape for server B` };
  }
  const onB = Number(target[1]);
  const station = ctx.map.stationChannelOf(onB);
  if (station === null) {
    return {
      code: BACKUP_GUARD_CODE,
      reason: `server B's channel ${String(onB)} is not a mirror channel of this station`,
    };
  }
  if (target[2] === undefined) {
    const commit = verb === 'MIXER' && (tokens[2] ?? '').toUpperCase() === 'COMMIT';
    if ((commit && tokens.length === 3) || (verb === 'INFO' && tokens.length === 2)) return null;
    return {
      code: BACKUP_GUARD_CODE,
      reason: `${verb} ${String(onB)} addresses the whole of server B's channel ${String(onB)}`,
    };
  }
  const layer = Number(target[2]);
  const inCgLayers = layer >= FIRST_ALLOCATABLE_LAYER && layer <= LAST_CG_LAYER;
  if (!inCgLayers && !ctx.isOwnLayer(station, layer)) {
    return {
      code: BACKUP_GUARD_CODE,
      reason:
        `${verb} ${String(onB)}-${String(layer)} is outside CG's layers ` +
        `${String(FIRST_ALLOCATABLE_LAYER)}-${String(LAST_CG_LAYER)}`,
    };
  }
  return null;
}

/**
 * The two steps, composed: what server B gets for a station line. `verbatim` is a TEST-ONLY fault that skips
 * step 1, so a test can prove the guard alone refuses a line carrying the primary's number.
 */
export function serverBLineFor(
  line: string,
  ctx: ServerBGuardContext,
  options: { readonly verbatim?: boolean } = {},
): ServerBLineVerdict {
  const translated = options.verbatim === true ? { line } : translateForServerB(line, ctx.map);
  if (!('line' in translated)) return translated;
  const refusal = serverBLineRefusal(translated.line, ctx);
  return refusal === null ? translated : refused(refusal.code, refusal.reason);
}

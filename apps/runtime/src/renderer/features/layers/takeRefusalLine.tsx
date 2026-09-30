import {
  CG_UNLICENSED_CODE,
  notShowableWords,
  unseatableWords,
  type SourceDefinition,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { TakeRefusal } from '@cg/shared-schema';
import { amcpCommandFacts, amcpRefusalWords } from '../../ui/amcpRefusal.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';

/**
 * 🔴 `FIELD-FIXES-01` B — **A REFUSED TAKE IS SAID ON ITS ROW, IN ONE LINE**, `design.md` §29
 * grammar: the row, the source that was refused and the input it named, then what the server's
 * refusal means (A's one mapping).
 *
 *     Bed 59 · studio1 (DeckLink 1): the server has no such input, or it is in use.
 *
 * The SAME line on the row and in its Inspector, both read off the item's `takeRefusal`, which
 * the bridge records where the take was refused and withdraws when the row is next taken or
 * cleared. So it is in that channel's view only, like the row; no banner repeats it.
 *
 * Only the plate that was refused is ever named: the take stops there, and plates it never tried
 * are not said to have failed (`FIELD-FIXES-01-A` Decision 1). A refusal of the graphic's own
 * command names no source.
 *
 * `LOOK-SWITCH-01` / `B-273` — a LOOK SWITCH refused for a plate writes the same record, so it is
 * said by this same line (the row keeps its old look; a switch that lands withdraws it).
 */
export interface TakeRefusalLine {
  /** The row, in the operator's words (`operatorRowName`). */
  readonly row: string;
  /** The catalog name of the refused plate's source, when a plate was refused. */
  readonly source: string | null;
  /** The input the refused command named — `DeckLink 1` — when it named one. */
  readonly input: string | null;
  /** What the refusal means, as a clause (A's mapping, or the code's own sentence). */
  readonly clause: string;
  /** The whole line as one string: a `title`, an accessible name, a test. */
  readonly text: string;
  /**
   * `PLAYOUT-SOURCES-01` §1.C — for an entry the Playout stopped offering (or that cannot be played),
   * the line names the PLATE by its position and opens its clause with the SOURCE's quoted name:
   * `Bed 59 · Plate 1: “Studio 5” is not in the Playout's input list.` The name is apart from the
   * rest so it can be isolated.
   */
  readonly unseatable?: {
    readonly plate: string | null;
    readonly name: string;
    readonly rest: string;
  };
  /**
   * `ROUTE-PLATES-01` rule 5 — a line that names the PLATE and no source:
   * `Bed 59 · Plate 1: waiting for the Playout's input list.`
   */
  readonly plate?: string | null;
  /**
   * `PLAYOUT-FEATURES-01` D — the clause is the PLAYOUT's own sentence (its license message, Persian),
   * isolated on its own when rendered.
   */
  readonly playoutWords?: string;
}

/**
 * 🔴 `ROUTE-PLATES-01` / contract v1.3 C4 — the row's other one-line state fact: the backup server
 * carries this row's graphic without its Playout route plates (`StackItemState.backupUnmirrored`).
 * Said on the row and in its Inspector, in the channel's own view; a refused take's line outranks it.
 */
export const BACKUP_UNMIRRORED_LINE = 'Backup: live boxes not mirrored.';

/** The codes a take refused before any AMCP because of what became of a bound entry (§1.C). */
const UNSEATABLE_CODES = new Set(['source-unavailable', 'source-unusable']);

/** `ROUTE-PLATES-01` rule 1 — the row's channel is not one the entry may be shown on. */
const NOT_SHOWABLE_CODE = 'source-not-showable';

/** `ROUTE-PLATES-01` rule 5 — a Playout route whose epoch could not be confirmed stays empty. */
const ROUTE_WAITING_CODE = 'route-epoch-waiting';

/**
 * 🔴 `CHANNEL-SOURCES-01` decision 3 — the take found no live source layer band declared. One short
 * line on the row, in the words of Station setup's `Live source layer band` card; no plate is named,
 * because the band is the station's and not a box's.
 */
const NO_BAND_CODE = 'live-source-no-layer-range';
const NO_BAND_CLAUSE = 'no live source layer band is declared — nothing was sent.';

export function takeRefusalLine(
  rowName: string,
  refusal: TakeRefusal,
  context: {
    /** `Plate N` — the refused plate's position in its template, when the caller knows it. */
    readonly plateLabel?: string | undefined;
    /** The catalogue entry the plate was bound to, as it stands now. */
    readonly entry?: SourceDefinition | undefined;
    /** `ROUTE-PLATES-01` — the row's channel, for a source that may not be shown on it. */
    readonly channel?: number | undefined;
  } = {},
): TakeRefusalLine {
  if (refusal.code === NOT_SHOWABLE_CODE && context.channel !== undefined) {
    // `“ورودی ۴” can't be shown on CH 2.` — the bridge's own clause (`notShowableWords`).
    const words = notShowableWords(
      refusal.sourceName ?? context.entry?.name ?? 'the source',
      context.channel,
    );
    const plate = context.plateLabel ?? null;
    const who = plate === null ? rowName : `${rowName} · ${plate}`;
    const clause = `“${words.name}”${words.rest}`;
    return {
      row: rowName,
      source: null,
      input: null,
      clause,
      text: `${who}: ${clause}`,
      unseatable: { plate, name: words.name, rest: words.rest },
    };
  }
  if (refusal.code === CG_UNLICENSED_CODE && refusal.message !== undefined) {
    // `PLAYOUT-FEATURES-01` D — CG is not licensed on the row's channel: the Playout's own words.
    return {
      row: rowName,
      source: null,
      input: null,
      clause: refusal.message,
      text: `${rowName}: ${refusal.message}`,
      playoutWords: refusal.message,
    };
  }
  if (refusal.code === NO_BAND_CODE) {
    return {
      row: rowName,
      source: null,
      input: null,
      clause: NO_BAND_CLAUSE,
      text: `${rowName}: ${NO_BAND_CLAUSE}`,
    };
  }
  if (refusal.code === ROUTE_WAITING_CODE) {
    const plate = context.plateLabel ?? null;
    const who = plate === null ? rowName : `${rowName} · ${plate}`;
    const clause = "waiting for the Playout's input list.";
    return { row: rowName, source: null, input: null, clause, text: `${who}: ${clause}`, plate };
  }
  if (UNSEATABLE_CODES.has(refusal.code)) {
    /*
      THE WORDS ARE THE BRIDGE'S OWN CLAUSE (`unseatableWords`, `@cg/shared-ipc`), from the refusal
      as it was recorded — the entry's own reason when it still says the same thing, never a
      healthier reading of an entry that has since come back.
    */
    const entry = context.entry;
    const unavailable = refusal.code === 'source-unavailable';
    const still =
      entry !== undefined && entry.status === (unavailable ? 'unavailable' : 'unusable');
    const words = unseatableWords({
      name: refusal.sourceName ?? entry?.name ?? 'the source',
      origin: refusal.sourceOrigin ?? entry?.origin,
      status: unavailable ? 'unavailable' : 'unusable',
      ...(still && entry.departed === true ? { departed: true as const } : {}),
      ...(!still && unavailable ? { departed: true as const } : {}),
      ...(still && entry.reason !== undefined ? { reason: entry.reason } : {}),
    });
    const plate = context.plateLabel ?? null;
    const who = plate === null ? rowName : `${rowName} · ${plate}`;
    const clause = `“${words.name}”${words.rest}`;
    return {
      row: rowName,
      source: null,
      input: null,
      clause,
      text: `${who}: ${clause}`,
      unseatable: { plate, name: words.name, rest: words.rest },
    };
  }
  const words = amcpRefusalWords(refusal.code, refusal.command);
  const clause =
    words?.clause ?? lowerFirst(errorCodeMessage(refusal.code) ?? 'the take was refused.');
  const deck = amcpCommandFacts(refusal.command).decklink;
  const source = refusal.sourceName ?? null;
  const input = source !== null && deck !== null ? `DeckLink ${String(deck)}` : null;
  const who =
    source === null ? rowName : `${rowName} · ${source}${input === null ? '' : ` (${input})`}`;
  return { row: rowName, source, input, clause, text: `${who}: ${clause}` };
}

/**
 * `Plate N` for a template's plate — its position among the template's declared plates, the
 * operator's word for it (golden rule 11: the id stays on a `title`).
 */
export function plateLabelOf(
  template: TemplateInfo | null | undefined,
  plateId: string | undefined,
): string | undefined {
  if (plateId === undefined) return undefined;
  const index = (template?.liveSources?.sources ?? []).findIndex((p) => p.sourceId === plateId);
  return index < 0 ? undefined : `Plate ${String(index + 1)}`;
}

/**
 * A sentence as a clause. Only a plain capitalised first word is lowered ("The command…" → "the
 * command…"); a name is kept as it is spelled ("CasparCG did not answer…" stays "CasparCG").
 */
function lowerFirst(sentence: string): string {
  const first = sentence.split(/\s/, 1)[0] ?? '';
  return /^[A-Z][a-z’']*$/.test(first)
    ? sentence.charAt(0).toLowerCase() + sentence.slice(1)
    : sentence;
}

/**
 * The line as rendered. Golden rule 11: the row's name and the source's name are OPERATOR DATA
 * (Persian as often as not), so each is isolated in its own `<bdi>`; the line itself is LTR
 * chrome, so the English clause is never flipped by the name beside it.
 */
export function TakeRefusalText({ line }: { line: TakeRefusalLine }): JSX.Element {
  if (line.playoutWords !== undefined) {
    // The row and the Playout's sentence are both data, each isolated; only `: ` is chrome.
    return (
      <>
        <bdi>{line.row}</bdi>
        {': '}
        <bdi>{line.playoutWords}</bdi>
      </>
    );
  }
  if (line.unseatable !== undefined) {
    // The row and the source are data, each isolated; `Plate N` and the clause are chrome.
    return (
      <>
        <bdi>{line.row}</bdi>
        {line.unseatable.plate !== null && ` · ${line.unseatable.plate}`}
        {': “'}
        <bdi>{line.unseatable.name}</bdi>
        {`”${line.unseatable.rest}`}
      </>
    );
  }
  return (
    <>
      <bdi>{line.row}</bdi>
      {line.source === null &&
        line.plate !== undefined &&
        line.plate !== null &&
        ` · ${line.plate}`}
      {line.source !== null && (
        <>
          {' · '}
          <bdi>{line.source}</bdi>
          {line.input !== null && ` (${line.input})`}
        </>
      )}
      {`: ${line.clause}`}
    </>
  );
}

/**
 * `FIELD-FIXES-01` B — the channels whose rows carry a refused take's line, for the strip's mark
 * (`channelSignals`): on another channel's view the line itself is not shown, only the mark. The
 * channel is the item's own `slot`, else the bank row it is bound to.
 */
export function takeRefusalChannels(
  items: readonly {
    itemId: string;
    slot?: { channel: number } | undefined;
    takeRefusal?: unknown;
  }[],
  slots: readonly { channel: number; binding: { itemId: string } | null }[],
): number[] {
  const out: number[] = [];
  for (const item of items) {
    if (item.takeRefusal === undefined) continue;
    const channel =
      item.slot?.channel ?? slots.find((s) => s.binding?.itemId === item.itemId)?.channel;
    if (channel !== undefined) out.push(channel);
  }
  return out;
}

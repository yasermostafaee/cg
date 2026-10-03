import {
  bankInSet,
  bankSetSize,
  defaultLayerAlias,
  isFixedBankLayer,
  layerAlias,
  type BankSet,
} from './channels/fixedLayers.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **THE WORDS A ROW SHOWS, IN ONE PLACE BOTH SIDES CAN ASK.**
 *
 * The audit's search runs on CG Bridge now (a page of 100 from a record of any length cannot be
 * searched in the console), and its rule is that a hit is something the row SHOWS. So the bridge
 * must word a row exactly as the console does — and two spellings of one naming rule is how a name
 * comes to lie (golden rule 6). These moved here unchanged from the console's renderer, which
 * re-exports them from their old homes (`templateName.ts`, `operatorNaming.ts`,
 * `producerDisplay.tsx`, `auditFormat.ts`), so every reader there keeps its import path and its
 * tests. React-free and Node-free: the console and CG Bridge both run them.
 */

/** A name is "usable" only if it survives a trim — `ManifestSchema.name` has no `.min(1)`. */
function usable(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * `news-lower-third.vcg` → `news lower third`.
 *
 * Strips the `.vcg` extension and turns the separators an operator types (`-`, `_`) into
 * spaces. **Case is left exactly as it was**: these names are routinely Persian, or mixed
 * Persian/English, and title-casing them would corrupt the text — there is no correct
 * "capitalize" for an Arabic-script string, and imposing one on the Latin half would make
 * the two halves disagree.
 */
export function cleanFileName(fileName: string | undefined): string | undefined {
  if (fileName === undefined) return undefined;
  // Trim FIRST: the extension anchors to the end of the string, so a stray trailing space
  // would otherwise leave ".vcg" in the operator's label.
  const withoutExt = fileName.trim().replace(/\.vcg$/i, '');
  const spaced = withoutExt.replace(/[-_]+/g, ' ');
  // Collapse the runs a separator sweep can leave behind, and trim the edges.
  return usable(spaced.replace(/\s+/g, ' '));
}

/**
 * The ONE priority rule over the raw naming facts, for callers that hold them
 * without a full `TemplateInfo` — R-028's fixed-row binding carries
 * `{ templateName, sourceFileName }` over the wire precisely so the label is
 * resolved HERE, never by a second bridge-side copy of this rule.
 * `undefined` when neither fact is usable (the caller picks its fallback).
 */
export function displayLabel(parts: {
  name?: string | undefined;
  sourceFileName?: string | undefined;
}): string | undefined {
  return cleanFileName(parts.sourceFileName) ?? usable(parts.name);
}

/**
 * What the operator reads for a registered template, on EVERY surface — the stack row, the Inspector
 * header, the audit row. Never returns the `templateId`: a template with no file and no usable name
 * is labelled in words.
 */
export function templateDisplayName(template: {
  name?: string | undefined;
  sourceFileName?: string | undefined;
}): string {
  return displayLabel(template) ?? 'Unnamed template';
}

/**
 * The minimum a caller must know about a layer to have it named. Structural rather than
 * a named wire type on purpose: the audit entry's slot carries a `server` too and the
 * emptied-air row's does not, and neither fact changes what this returns.
 */
export interface NameableSlot {
  channel: number;
  layer: number;
}

/**
 * What the operator calls the layer a record names.
 *
 * A layer inside the declared bank is the ROW the operator sees — its configured alias,
 * else the default `Layer N` / `Bed N`, through the SAME two functions the layer table
 * uses (never a second spelling of the naming rule). A layer outside every bank is named
 * as CasparCG names it, with the fact that it is not a row said out loud: the two items
 * on layers 60 and 61 on 2026-09-04 were exactly that, and every surface that called them
 * "stack items" sent the operator to look for rows that did not exist.
 */
export function placeName<S extends NameableSlot>(
  /*
    GENERIC over the slot rather than typed as `NameableSlot` flat, so a caller may pass
    a richer slot — the audit entry's carries a `server` — without TypeScript's
    excess-property check rejecting the literal. `S` is inferred from what is handed in;
    nothing here reads a field beyond the two named above.
  */
  slot: S | undefined,
  /**
   * `MULTI-CHANNEL-01` — one bank, the station's list, or none. A row is named from the bank
   * of ITS channel (`bankInSet`); with one bank the answer is exactly what it was.
   */
  bank: BankSet,
): string | null {
  if (slot === undefined) return null;
  const own = bankInSet(bank, slot.channel);
  if (own !== null && isFixedBankLayer(own, slot.channel, slot.layer)) {
    return layerAlias(own, slot.layer) ?? defaultLayerAlias(own, slot.layer);
  }
  // The channel is left out only where it cannot be mistaken: ONE declared bank, on this channel.
  const channel = bankSetSize(bank) <= 1 && own !== null ? '' : `${String(slot.channel)}-`;
  return `layer ${channel}${String(slot.layer)} (not a row)`;
}

/*
  🔴 `PLAYOUT-SOURCES-01` §1.E / §2.B — **A STREAM'S ADDRESS IS NEVER SHOWN IN THE CONSOLE.** The
  bridge publishes what it SENT — the ledger's producer, a refused command — with a stream URL's
  credentials already written `***` (§1.E). Redacted is not hidden: the address itself is still not
  an operator's word for a source (golden rule 11), so wherever a producer or a command is shown, a
  stream address reads `stream`. `route://…` is not an address of anything outside the server.
*/
const STREAM_ADDRESS = /"((?!route:)[a-z][a-z0-9+.-]*:\/\/[^"]*)"/gi;
/** Only a play's PRODUCER can be a stream; a `CG ADD`'s page URL is the bridge's own and stays. */
const PLAY_LINE = /^\s*(PLAY|LOAD|LOADBG)\s/i;

/** A producer argument as a surface may print it: a stream address reads `stream`. */
export function producerForDisplay(producer: string): string {
  return producer.replace(STREAM_ADDRESS, 'stream');
}

/** A refused AMCP line as a surface may print it: a play's stream address elided. */
export function commandForDisplay(command: string): string {
  return PLAY_LINE.test(command) ? command.replace(STREAM_ADDRESS, '"stream"') : command;
}

/**
 * 🔴 `TIMING-WIRE-22 · DELTA B · R3` — a `set-pass-timing` row's VALUE, as one clause.
 *
 * The entry stores DATA (`{ passes?, delayMs? }`) and this turns it into words, which is
 * `B-211`'s rule applied to a value rather than a name: the record keeps what cannot be
 * re-derived, the surface does the wording.
 *
 * ⚠ **`Until stop`, NOT `∞`.** The Inspector's two-state control says `Until stop`, and a log
 * answering in a different vocabulary from the control that set it is the label-in-two-places
 * defect one surface along.
 *
 * ⚠ `0` is a real answer and must survive: it is the instruction "out after the current pass".
 *
 * Returns `null` when there is nothing to state, so a caller renders no empty element.
 */
export function timingClause(
  timing: { passes?: number | 'infinite' | undefined; delayMs?: number | undefined } | undefined,
): string | null {
  if (timing === undefined) return null;
  const parts: string[] = [];
  if (timing.passes !== undefined) {
    parts.push(timing.passes === 'infinite' ? 'until stop' : `${String(timing.passes)} passes`);
  }
  if (timing.delayMs !== undefined) {
    parts.push(`gap ${String(Math.round(timing.delayMs / 100) / 10)} s`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

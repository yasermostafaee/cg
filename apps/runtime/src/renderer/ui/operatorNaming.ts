import {
  defaultLayerAlias,
  isFixedBankLayer,
  layerAlias,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { templateDisplayName } from '../features/library/templateName.js';

/**
 * 🔴 **AN OPERATOR-FACING SURFACE NAMES THINGS IN THE OPERATOR'S WORDS.**
 *
 * Internal ids — item ids, template UUIDs — live behind a tooltip or on a technical
 * surface. They never appear in the sentence the operator reads under pressure.
 *
 * ── WHY THIS IS A MODULE AND NOT A CONVENTION ───────────────────────────────
 *
 * The same defect has now been reported four times, from four different angles, and
 * each previous fix was made where it was found:
 *
 *   - **`B-210` / `B-211`** — the AUDIT LOG printed `item-e602d912-… · f00a5363-…`
 *     per row. The row's name was `Bed 1` and the template's was `3ghab`.
 *   - **`B-223`** — the program-output alarm put persistent ids, slot indexes and
 *     driver names in front of the operator; the engineering moved to
 *     `Station setup ▸ Outputs` (then `Server connection ▸ Outputs`) and the alarm kept one line.
 *   - **`useTemplateIndex`'s own header** — "the stack row and the Inspector kept
 *     printing the raw `templateId`", fixed by joining against the registry.
 *   - **`B-232`** — the emptied-air notice listed
 *     `1-9 · e506e319-6e68-4603-a5f4-290b21616250`, measured on the plant on
 *     2026-09-06. The operator knows those rows as «لوگوی اصلی» and «زیرنویس اصلی».
 *
 * Four surfaces, one rule, and until now no place that stated it. A rule nobody can
 * point at is re-learned per surface, which is exactly what happened — so the naming
 * lives HERE and every operator-facing surface calls it rather than composing its own
 * label. `features/audit/auditFormat.ts` re-exports the three primitives below so the
 * audit log keeps its import path; it is the same implementation, not a copy.
 *
 * ── WHAT IS DELIBERATELY *NOT* CHANGED ──────────────────────────────────────
 *
 * The RECORD keeps its ids. `B-211` settled that and it still holds: a name can be
 * renamed or repeated and an id cannot, so shortening a UUID for DISPLAY is fine while
 * deleting it would turn a forensic record into a story. The rule is about which of the
 * two is in the SENTENCE, never about discarding the id.
 *
 * React-free, so every clause above is unit-testable without a DOM.
 */

/**
 * A UUID-shaped id, shortened for display: an `item-` prefix is kept (it says what KIND
 * of id this is), then the first eight hex characters, then an ellipsis. Anything short
 * enough to read is left alone. The full id always travels beside it — see the header.
 */
export function shortId(id: string): string {
  const match = /^(item-)?([0-9a-f]{8})-[0-9a-f-]{20,}$/i.exec(id);
  if (match === null) return id.length > 20 ? `${id.slice(0, 19)}…` : id;
  return `${match[1] ?? ''}${match[2] ?? ''}…`;
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
  bank: FixedLayerBank | null,
): string | null {
  if (slot === undefined) return null;
  if (bank !== null && isFixedBankLayer(bank, slot.channel, slot.layer)) {
    return layerAlias(bank, slot.layer) ?? defaultLayerAlias(bank, slot.layer);
  }
  const channel = bank === null || bank.channel !== slot.channel ? `${String(slot.channel)}-` : '';
  return `layer ${channel}${String(slot.layer)} (not a row)`;
}

/** The template's display name — the one rule every surface uses — or null when unknown. */
export function templateName(
  templateId: string | undefined,
  templates: ReadonlyMap<string, TemplateInfo>,
): string | null {
  if (templateId === undefined) return null;
  const info = templates.get(templateId);
  return info === undefined ? null : templateDisplayName(info);
}

/** Whatever a surface knows about the thing it is about to name. Every field optional. */
export interface NameableRef {
  itemId?: string | undefined;
  templateId?: string | undefined;
  slot?: NameableSlot | undefined;
}

/** One row, ready to render: names for the sentence, a layer chip, ids for the title. */
export interface OperatorRowName {
  /**
   * In reading order: WHICH ROW, then WHAT IT WAS SHOWING. Render joined by ` · ` —
   * the same composition the audit log uses, so one surface's habits transfer to the
   * next. Never empty; see the last-resort clause in {@link operatorRowName}.
   */
  names: readonly string[];
  /**
   * `1-9` — the real CasparCG coordinate, kept as a QUIET SECONDARY and never dropped.
   *
   * `R-028`: _"an operator may need it to clear that layer by hand"_ — which is done
   * when the console is not helping, so it must be VISIBLE and not a tooltip. A hover
   * needs a working pointer and a dwell, and `operator-surface` §2 upheld exactly this
   * reasoning when it declined to hide the number behind one.
   *
   * `null` when there is no slot, and — the case worth naming — when `names` ALREADY
   * carries the coordinate, because an out-of-bank layer is named `layer 60 (not a
   * row)`. Printing `layer 60 (not a row)  1-60` would say the number twice.
   */
  layer: string | null;
  /** Every id this row has, for a `title`. Never for the visible line. */
  title: string;
}

/**
 * The one composition, for every operator-facing surface that names a row.
 *
 * ⚠ **The last resort is an id, and that is deliberate.** A row with no slot and an
 * unknown template can be named by nothing else, and a blank bullet is worse than an
 * ugly one — the operator at least has a handle to search the log with. It is
 * {@link shortId}, not the raw UUID, and it is reached only when both names are absent.
 */
export function operatorRowName(
  ref: NameableRef,
  bank: FixedLayerBank | null,
  templates: ReadonlyMap<string, TemplateInfo>,
): OperatorRowName {
  const place = placeName(ref.slot, bank);
  const template = templateName(ref.templateId, templates);
  const names = [place, template].filter((n): n is string => n !== null);

  /*
    The coordinate is a SECOND statement of the place, so it is suppressed exactly when
    `placeName` already made it — asked through `isFixedBankLayer`, the predicate
    `placeName` itself branches on, rather than by sniffing its output for the word
    "layer". A second derivation of that answer is how the two would drift apart.
  */
  const inBank =
    ref.slot !== undefined &&
    bank !== null &&
    isFixedBankLayer(bank, ref.slot.channel, ref.slot.layer);
  const layer =
    inBank && ref.slot !== undefined
      ? `${String(ref.slot.channel)}-${String(ref.slot.layer)}`
      : null;

  const ids = [
    ref.templateId !== undefined ? `template ${ref.templateId}` : null,
    ref.itemId !== undefined ? `item ${ref.itemId}` : null,
  ].filter((s): s is string => s !== null);

  return {
    names: names.length > 0 ? names : [shortId(ref.templateId ?? ref.itemId ?? 'unknown')],
    layer,
    title: ids.join(' · '),
  };
}

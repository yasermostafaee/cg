import { LAYER_BANDS, type FIXED_LAYERS_SET_CONFIG_REASONS } from '@cg/shared-ipc';

/**
 * R-021 stage 2b — operator wording for a refused `fixedLayers.set-config`,
 * keyed off the wire contract's OWN reason union so a new validator code
 * cannot ship without a sentence here (the record below fails typecheck if a
 * member of `FIXED_LAYERS_SET_CONFIG_REASONS` is missing).
 *
 * Deliberately BESIDE `errorCodeMessage.ts`, not inside it: that map explains
 * stack `errorCode`s (a different channel family with a different vocabulary),
 * and folding this union in would blur which codes belong to which contract.
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A5 — **ONE LINE, AND IT IS OURS.** These sentences used to
 * carry the rule while the bridge's `message` rode beneath as the "specifics", and the owner
 * read the result with no CasparCG running: a rule, then `cannot hide layer 99: its occupancy
 * is UNKNOWN (no healthy CasparCG link or no fresh OSC) … then untick` — two lines, and the
 * second in the bridge's words. The bridge's `message` is written for the record; the facts a
 * sentence needs come as DATA (`layer`), and the sentence is one line in the house refusal
 * shape: `Refused — …, so …`, in the words of the pane it answers (a row is SHOWN or HIDDEN).
 */
type FixedLayersSetConfigReason = (typeof FIXED_LAYERS_SET_CONFIG_REASONS)[number];

/** The facts a refusal carries as data — the layer an `untick-*` refusal is about. */
export interface FixedLayersRefusalFacts {
  readonly layer?: number | undefined;
}

const whichLayer = (facts: FixedLayersRefusalFacts): string =>
  facts.layer === undefined ? 'that layer' : `layer ${String(facts.layer)}`;

/** The two refusals that keep a row shown, named after the layer they are about. */
const occupiedRefusal = (facts: FixedLayersRefusalFacts): string =>
  `Refused — ${whichLayer(facts)} is not empty, so it stays shown.`;
const unknownRefusal = (facts: FixedLayersRefusalFacts): string =>
  `Refused — what is on ${whichLayer(facts)} cannot be verified right now, so it stays shown.`;
const HIDE_REFUSALS: Readonly<Record<string, (facts: FixedLayersRefusalFacts) => string>> = {
  'untick-occupied': occupiedRefusal,
  'untick-unknown': unknownRefusal,
};

const MESSAGES = {
  /*
   * 🔴 THE CEILING IS READ FROM THE LIVE MAP, NEVER RESTATED.
   *
   * This sentence said `layer 89` and the ceiling has been `LAYER_BANDS.template.end`
   * since the 2026-09-14 re-cut (`fixed-layers-store.ts`'s `MAX_FIXED_LAYER`) — so the
   * one surface that explains the refusal was quoting a boundary ten layers below the
   * one the bridge enforces, and the operator reading it would have concluded a legal
   * bank was illegal. A band bound written a second time cannot notice when the first
   * one moves, which is `layer-bands.ts`'s own warning about a coordinate in a message.
   */
  'exceeds-ceiling': `The bank would extend past layer ${String(LAYER_BANDS.template.end)} — the fixed-layer ceiling.`,
  'overlaps-policy':
    'The bank would overlap a dynamic template-type range — the two must stay disjoint.',
  'overlaps-reserved':
    'The candidate layers would overlap the reserved playout range — the two must stay disjoint.',
  'alias-out-of-bank': 'An alias names a layer outside the bank.',
  'visibility-out-of-bank': 'A visibility tick names a layer outside the bank.',
  'renumber-refused': 'The bank’s start layer cannot move mid-session — it is fixed at install.',
  'channel-change-refused':
    'The bank’s channel cannot change mid-session — it is fixed at install.',
  // R-028 — the ceiling is fixed at install; ticks + aliases are the live surface.
  'resize-refused':
    'The number of candidate layers cannot change mid-session — edit the bridge’s fixed-layers config and restart it.',
  // A5 — the layer-less spelling of the one sentence; it names the layer when the refusal does.
  'untick-occupied': occupiedRefusal({}),
  'untick-unknown': unknownRefusal({}),
  'banks-overlap':
    'The graphics-bed rows and the operator’s candidate layers claim a layer in common — a layer cannot be both, because one composites above the live plates and the other below them. Edit the bridge’s fixed-layers config and restart it.',
} satisfies Record<FixedLayersSetConfigReason, string>;

/**
 * The operator sentence for a refusal reason, or `null` when there is none to
 * explain. Unknown codes surface verbatim rather than being swallowed — a
 * quotable code beats a generic dead end (the B-070 stance).
 */
export function fixedLayersReasonMessage(
  reason: string | undefined,
  facts: FixedLayersRefusalFacts = {},
): string | null {
  if (reason === undefined || reason === '') return null;
  const hide = HIDE_REFUSALS[reason];
  if (hide !== undefined) return hide(facts);
  return (MESSAGES as Readonly<Record<string, string>>)[reason] ?? `Not accepted (${reason}).`;
}

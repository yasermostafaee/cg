import type { FIXED_LAYERS_SET_CONFIG_REASONS } from '@cg/shared-ipc';

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
 * These sentences carry the RULE; the bridge's `message` carries the SPECIFICS
 * (both ranges, or the occupied slot numbers) — the config modal shows both.
 */
type FixedLayersSetConfigReason = (typeof FIXED_LAYERS_SET_CONFIG_REASONS)[number];

const MESSAGES = {
  'exceeds-ceiling': 'The bank would extend past layer 89 — the fixed-layer ceiling.',
  'overlaps-policy':
    'The bank would overlap a dynamic template-type range — the two must stay disjoint.',
  'overlaps-reserved':
    'The bank would overlap a reserved (Live Source) layer — the two must stay disjoint.',
  'alias-out-of-bank': 'An alias names a layer outside the bank.',
  'renumber-refused': 'The bank’s start layer cannot move mid-session — it is fixed at install.',
  'channel-change-refused':
    'The bank’s channel cannot change mid-session — it is fixed at install.',
  'shrink-occupied':
    'The bank cannot shrink while the removed slots hold a resident item — clear them first.',
} satisfies Record<FixedLayersSetConfigReason, string>;

/**
 * The operator sentence for a refusal reason, or `null` when there is none to
 * explain. Unknown codes surface verbatim rather than being swallowed — a
 * quotable code beats a generic dead end (the B-070 stance).
 */
export function fixedLayersReasonMessage(reason: string | undefined): string | null {
  if (reason === undefined || reason === '') return null;
  return (MESSAGES as Readonly<Record<string, string>>)[reason] ?? `Not accepted (${reason}).`;
}

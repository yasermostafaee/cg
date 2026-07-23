import { z } from 'zod';

/**
 * R-021 stage 1 — the fixed operator layer BANK shape (config only).
 *
 * SCHEMA AND TYPES ONLY in this stage: the fixed-bank channels (config
 * read/update, per-slot state publish, exact-slot load, layer verbs) arrive
 * with the later stages — no `defineChannel` here yet.
 *
 * The bank declares a contiguous run of operator-designated layers on one
 * channel (default TEN at 70–79), each optionally aliased for display.
 * Numeric bounds that depend on OTHER config live in the VALIDATOR
 * (`tools/caspar-bridge/src/fixed-layers-store.ts`) — deliberately not here —
 * so refusals can name the ceiling and both offending ranges (design.md (a)/(e):
 * conflicts resolve loudly at config time). The schema carries only the
 * shape-local constraints.
 */
export const FixedLayerBankSchema = z.object({
  /** CasparCG channel the bank lives on (one channel per bank, v1). */
  channel: z.number().int().positive(),
  /** First layer of the bank. Immutable mid-session (validator-enforced). */
  start: z.number().int().positive().default(70),
  /** Bank size. Extendable ONLY at the end; the 89 layer ceiling is validator-enforced. */
  count: z.number().int().min(1).max(20).default(10),
  /** Optional display aliases, keyed by layer number (as a numeric string). */
  aliases: z.record(z.string().regex(/^\d+$/), z.string().min(1)).optional(),
});
export type FixedLayerBank = z.infer<typeof FixedLayerBankSchema>;

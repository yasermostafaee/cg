import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { LayerSlotSchema } from './item-state.js';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected sha256 hex');

/** One row of the always-on audit log. NDJSON on disk. */
export const AuditEntrySchema = z.object({
  ts: ISODateSchema,
  actor: z.string().min(1),
  action: z.enum([
    'load',
    'take',
    'update',
    'out',
    'remove',
    'failover',
    'reconnect',
    'import',
    'export',
    // C-012 — the graceful stop, distinct from `out`'s destroying CLEAR.
    'stop',
    // R-028 (5.4) — advancing a template's sequence (`CG NEXT`).
    'next',
    'lock-engage',
    'lock-release',
    /*
      🔴 `TIMING-WIRE-22 · DELTA B · R3` — the operator set a row's PASS TIMING.

      A CONFIGURATION verb, not a playout one (golden rule 10): it puts a value in force and
      seats nothing. It is here because the log could not answer "who set that count, and
      when" — and that question cost an afternoon on the plant when a logo played one pass and
      closed. Every other per-row verb the operator can press was already recorded; this one
      was the hole.
    */
    'set-pass-timing',
    'update-deferred',
    'update-installed',
  ]),
  itemId: IdSchema.optional(),
  templateId: IdSchema.optional(),
  templateHash: Sha256Schema.optional(),
  dataHash: Sha256Schema.optional(),
  server: z.enum(['primary', 'backup', 'both']).optional(),
  slot: LayerSlotSchema.optional(),
  ackMs: z.number().nonnegative().optional(),
  oscConfirmMs: z.number().nonnegative().optional(),
  outcome: z.enum(['ok', 'failed', 'timeout']),
  errorCode: z.string().optional(),
  /**
   * `B-209` — the AMCP line CasparCG answered with the code above, payload elided.
   *
   * `amcp-404` alone says the server refused SOMETHING; a take sends up to five
   * commands and the code is the same whichever one failed. Recorded beside the
   * code so the record can say WHICH verb on WHICH layer was refused — the one
   * fact the station could not produce for itself on 2026-09-04, when fourteen
   * takes in a row answered `amcp-404` and nothing anywhere had kept the line.
   * Absent on an accepted action and on a refusal that never reached the wire.
   */
  command: z.string().max(256).optional(),
  /**
   * 🔴 `TIMING-WIRE-22 · DELTA B · R3` — WHAT a `set-pass-timing` row carried.
   *
   * ── WHY THE RECORD HOLDS DATA AND NOT A SENTENCE ────────────────────────────
   *
   * The obvious shortcut is to store `"Until stop"` or `"3 passes · gap 1.5 s"` — the clause
   * the operator reads. It is the wrong half. `B-211` settled the same question for NAMES and
   * the reasoning carries: the record keeps what cannot be re-derived, and the SURFACE does the
   * wording. A stored sentence is a fourth copy of a vocabulary that already exists in the
   * console, it cannot be re-worded or translated later, and it cannot be filtered on.
   *
   * ⚠ It is what the operator ASKED FOR, not the row's resulting state. The two differ: a set
   * carrying only a gap leaves an earlier count in force, and a record of the merged result
   * would attribute that count to this press. An audit answers "what did this person do".
   *
   * ⚠ Absent on every other action, and absent on a `set-pass-timing` row is impossible —
   * the verb refuses a call that states neither member before it ever reaches the log.
   */
  timing: z
    .object({
      /** Passes as asked: a count (`0` legal — out after the current pass) or forever. */
      passes: z.union([z.number().int().min(0), z.literal('infinite')]).optional(),
      /** The gap BETWEEN passes, ms, as asked. `0` is legal and means no gap. */
      delayMs: z.number().min(0).optional(),
    })
    .optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

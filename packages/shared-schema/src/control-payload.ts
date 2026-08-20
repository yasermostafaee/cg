import type { FieldValues } from './fields.js';

/**
 * `multibox-layout-switch` `tasks.md` 6.7 — **the BRIDGE→PAGE control channel, carried inside
 * the field payload that already crosses the wire.**
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────
 *
 * Phase 3 made the bridge move each live plate's `MIXER FILL`/`CLIP` when a LOOK switches.
 * The PAGE punches the holes those fills sit behind, and it switches looks through its own
 * `setActiveLook` — but nothing carried the look id from one machine to the other, so on the
 * plant a switch moved the FILLS while the page kept punching the OUTGOING look's HOLES:
 * fill at the new geometry, hole at the old. The default look was fine (the page enters it at
 * build, the bridge seats it at take); the break was specific to a SWITCH.
 *
 * 🔴 **The point is not "a message" — it is that both halves are driven off the SAME look id.**
 * `design.md` §6/§12.2's rule is that the hole the page punches and the hole the bridge fills
 * must be ONE computation. This is that rule applied to the switch: one id, sent once, read by
 * one function on each side. Two sides that each decided which look was active would be the
 * second-spelling failure this repo keeps paying for, one machine apart.
 *
 * ── WHY IT RIDES THE FIELD PAYLOAD ───────────────────────────────────────────────
 *
 * `CG <ch>-<layer> UPDATE 0 "<json>"` is the ONE verb proven to deliver a JSON payload to the
 * page intact (ADR 0006, hardware-validated on 2.3.2 — the `CALL` / `CG INVOKE` alternatives
 * were measured and disproven). Inventing a second transport would mean re-earning that
 * proof; the escape chain, the quoting and the Persian round-trip are all already correct for
 * this one.
 *
 * ── THE RESERVED KEY, AND WHY IT CANNOT COLLIDE ──────────────────────────────────
 *
 * A field id is `z.string().min(1)` and the Designer only `trim()`s what the author types, so
 * there is NO character class that an author cannot reach. "Provably distinct" therefore has
 * to be MADE true rather than asserted, and it is made true in two places at once:
 *
 *  1. **The page STRIPS this key before anything applies field values** ({@link stripCgControl}),
 *     so a control payload can never be mistaken for a field value — whatever it is named.
 *  2. **The export preflight REFUSES a scene that declares a field id or a nested-composition
 *     namespace equal to it**, so a colliding template cannot be exported at all.
 *
 * Together those make the collision UNREPRESENTABLE in a shipped template rather than merely
 * unlikely — the same standard §14.2 sets for two looks disagreeing about a source.
 *
 * It is a NAMESPACE OBJECT rather than a flat `__cgLook` string on purpose: the next piece of
 * bridge→page control data extends this object instead of minting another top-level key that
 * every reader would have to learn (extend-the-list-forget-the-mutator).
 */
export const CG_CONTROL_KEY = '__cg';

/** Bridge→page control data. Every member optional: a payload may carry any subset. */
export interface CgControl {
  /**
   * The look the row is showing NOW. The page enters it through its own `setActiveLook`, so
   * the visibility flip and the re-punch happen exactly where they already happened.
   *
   * Absent means "this payload says nothing about looks" — never "the default look". A
   * non-LOOKS template's updates simply never carry it, and a page that receives no id
   * changes nothing.
   */
  look?: string;
}

/** Attach control data to a field payload. The ONE writer — the bridge calls this. */
export function withCgControl(fields: FieldValues, control: CgControl): FieldValues {
  // An EMPTY control object is not attached: it would put a reserved key on every update for
  // nothing, and a reader cannot tell "no control data" from "control data saying nothing".
  if (Object.keys(control).length === 0) return fields;
  return { ...fields, [CG_CONTROL_KEY]: { ...control } } as FieldValues;
}

/**
 * Read control data out of a received payload, or `undefined` when it carries none.
 *
 * Defensive about SHAPE rather than trusting it: this arrives over AMCP from a process that
 * may be a different version, and a malformed member must be ignored rather than thrown on —
 * a page that throws inside `update()` takes the whole graphic off air.
 */
export function readCgControl(payload: unknown): CgControl | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const raw = (payload as Record<string, unknown>)[CG_CONTROL_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const look = (raw as Record<string, unknown>)['look'];
  return typeof look === 'string' && look !== '' ? { look } : {};
}

/**
 * The payload with the reserved key REMOVED — what the field machinery is allowed to see.
 *
 * 🔴 Half of the collision proof above, and the half that holds even for a hand-edited scene
 * the preflight never saw: control data cannot reach `applyScopedFieldValues`, so it can never
 * be written into a field, and a field can never be silently fed a look id.
 */
export function stripCgControl(payload: Record<string, unknown>): Record<string, unknown> {
  if (!(CG_CONTROL_KEY in payload)) return payload;
  const { [CG_CONTROL_KEY]: _omit, ...rest } = payload;
  return rest;
}

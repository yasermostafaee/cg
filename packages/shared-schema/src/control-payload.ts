import type { FieldValues } from './fields.js';
import type { LiveFitMode } from './live-fit.js';

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

/**
 * ⭐ `C-028` — **the two INSTALLATION facts one plate's fit depends on.**
 *
 * The page cannot know either. `aspect` comes from the ASSIGNED source through `D-147`'s
 * chain (the source outranks the author, because the author cannot see the feed), and
 * `mode` comes from the operator's override over the author's declaration. Both are
 * resolved by the bridge at take time, from state the scene does not carry.
 */
export interface CgPlateFit {
  /**
   * The source's display aspect (width ÷ height), or `null` when NOTHING in the chain
   * states one — `resolvePlateAspect`'s `assumed` case. `null` means NO FIT: the hole
   * stays at the box, exactly as today.
   */
  aspect: number | null;
  /** `contain` or `cover`, already resolved. Never absent — the bridge resolved it. */
  mode: LiveFitMode;
}

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
  /*
    🔴 **`single-clock-look-switch` — `from` AND `plates` ARE GONE, and each for its own reason.**

    `from` (`SKEW-INTERSECT-01`) narrowed the page's holes to `outgoing ∩ entering` while the
    two clocks disagreed. There are no holes now — the page sits BELOW its plates — so there is
    nothing to narrow, and a member whose only effect was on a mask cannot survive the mask.

    `plates` (`C-028`) carried each plate's resolved aspect and mode so the PAGE could compute
    the same fit the bridge did. Only the mask consumed that; the fit that reaches air is the
    bridge's `MIXER FILL` / `CLIP`, computed from the same facts on its own side. The rule the
    member was built on — *"the facts cross the wire, never the rect"* — is unchanged and is
    now satisfied with ONE consumer instead of two, which is what it was always for.

    ⚠ A page from an older build receiving a payload without them punches the entering look's
    holes on its own clock, exactly as it did before either member existed — over plates that
    are now on top of it, so the punch has no visible effect. Degradation, not a new artefact.
  */
}

/** Attach control data to a field payload. The ONE writer — the bridge calls this. */
export function withCgControl(fields: FieldValues, control: CgControl): FieldValues {
  // An EMPTY control object is not attached: it would put a reserved key on every update for
  // nothing, and a reader cannot tell "no control data" from "control data saying nothing".
  if (Object.keys(control).length === 0) return fields;
  /*
    ⚠ THROUGH `unknown`, and that widening is honest rather than a silenced error.

    Control data is deliberately NOT a field value — it is JSON riding the same payload,
    lifted off by `stripCgControl` before anything treats the payload as fields, which is
    half of the reserved key's collision proof above. It therefore does not have to fit
    `FieldValues`'s value union, and `C-028`'s `plates` is the first member that visibly
    does not: `aspect` is `number | null`, and `null` is not a field value.

    A direct assertion compiled only while every control member HAPPENED to look like a
    field. Making the widening explicit says which of the two it is.
  */
  return { ...fields, [CG_CONTROL_KEY]: { ...control } } as unknown as FieldValues;
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
  // Unknown members are DROPPED rather than carried through, which is what lets a newer
  // bridge talk to an older page and the reverse: a payload from a build that still sends
  // `from` or `plates` is read for its `look` and the rest is ignored.
  return { ...(typeof look === 'string' && look !== '' ? { look } : {}) };
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

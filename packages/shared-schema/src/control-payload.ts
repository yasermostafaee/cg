import type { FieldValues } from './fields.js';
import { LIVE_FIT_MODES, type LiveFitMode } from './live-fit.js';

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
  /**
   * 🔴 `B-174` / `SKEW-INTERSECT-01` — **the look the row is switching AWAY FROM, sent only
   * while the two machines are still disagreeing about the geometry.**
   *
   * Present ⇒ the page punches `from ∩ look` — every open pixel is one BOTH looks punch, so
   * it is backed by a picture whether the bridge's `MIXER FILL` batch has landed yet or not.
   * Absent ⇒ the page punches `look`'s own holes, which is both the ordinary case and the
   * SETTLING half of a switch: the bridge sends a second payload without this member once
   * the fills are in place.
   *
   * ⚠ **It is an instruction about THIS payload, never a state the page stores.** A page
   * that kept it would keep showing a subset of the entering look's holes with nothing
   * scheduled to widen it. Every re-punch after this payload — including the settling one —
   * is a full one unless it too carries `from`.
   *
   * A page that does not understand this member drops it (`readCgControl` validates member
   * by member) and punches the entering look's holes immediately, which is exactly the
   * behaviour that shipped before this existed. That is why an older page paired with a
   * newer bridge degrades to the old artefact rather than to a new one.
   */
  from?: string;
  /**
   * ⭐ `C-028` — **each plate's resolved fit facts, keyed by PLATE ID** (the template's
   * declared `sourceId`, which is the element's `routeKey`).
   *
   * 🔴 **THE FACTS CROSS THE WIRE, NEVER THE RECT.** Each side then calls the SAME
   * `fitPictureToBox` on the box rect IT holds. That is deliberate and it is the shape
   * {@link CgControl.look} already has — *"one id, sent once, read by one function on
   * each side"*. Sending the fitted rect instead would fight a rule the page already
   * enforces: `liveArrangementView` reads the page's CURRENT layout back so the mask is
   * computed against where the nodes now ARE, and a plate moved by an arrangement has a
   * box the bridge's rect would be stale about. **The box is the page's fact; the
   * aspect and the mode are the bridge's; the fit is one function applied to both.**
   *
   * Absent means "this payload says nothing about fits" — never "no plates". A page that
   * receives none keeps whatever it was last told, and a page that has never been told
   * falls back to the scene's own statement.
   */
  plates?: Record<string, CgPlateFit>;
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
  const from = (raw as Record<string, unknown>)['from'];
  const plates = readPlateFits((raw as Record<string, unknown>)['plates']);
  return {
    ...(typeof look === 'string' && look !== '' ? { look } : {}),
    /*
      ⚠ `from` is meaningless without `look` — it names the state a switch is LEAVING, and
      there is no switch without the one it is entering. Dropping it in that case keeps the
      pair inseparable at the READER, so no downstream branch has to consider a half-payload.
    */
    ...(typeof look === 'string' && look !== '' && typeof from === 'string' && from !== ''
      ? { from }
      : {}),
    ...(plates === undefined ? {} : { plates }),
  };
}

/**
 * `C-028` — the plate fit map, validated MEMBER BY MEMBER.
 *
 * Same defensive standard as the rest of this module and for the same reason: this
 * arrives over AMCP from a process that may be a different version, and a page that
 * throws inside `update()` takes the whole graphic off air. A malformed entry is DROPPED
 * rather than thrown on or coerced — the page then falls back to the scene's own
 * statement for that plate, which is a worse picture than the truth but is still a
 * picture.
 *
 * ⚠ `aspect` accepts `null` and rejects a non-finite number. `null` is a MEANINGFUL
 * value here ("nothing states an aspect ⇒ no fit"), so it must survive the walk, while a
 * `NaN` arriving from a bad serialization must not: `NaN` would flow into the fit as a
 * legal-looking number and produce a rect of `NaN`, i.e. a hole nothing can see.
 */
function readPlateFits(raw: unknown): Record<string, CgPlateFit> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, CgPlateFit> = {};
  for (const [plateId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const mode = entry['mode'];
    if (typeof mode !== 'string' || !(LIVE_FIT_MODES as readonly string[]).includes(mode)) continue;
    const aspect = entry['aspect'];
    if (aspect !== null && (typeof aspect !== 'number' || !Number.isFinite(aspect))) continue;
    out[plateId] = { aspect: aspect as number | null, mode: mode as LiveFitMode };
  }
  return Object.keys(out).length === 0 ? undefined : out;
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

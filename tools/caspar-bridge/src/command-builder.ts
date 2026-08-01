import { quote } from '@cg/caspar-client';
import type { FieldValues } from '@cg/shared-schema';

/** A CasparCG `(channel, layer)` coordinate. */
export interface CommandSlot {
  readonly channel: number;
  readonly layer: number;
}

/**
 * The CG "flash layer" index inside the producer. HTML producers use a single
 * layer; `0` matches what `amcp-mock` and CasparCG expect for one template.
 */
const FLASH_LAYER = 0;

/**
 * AMCP command-construction **seam** (ADR 0006).
 *
 * This is the SINGLE place AMCP command lines are built for an HTML-producer
 * slot. Keeping construction here means the verified sequence is isolated from
 * `ServerSession` / `CommandQueue` / `Reconciler`.
 *
 * ✅ **`CG UPDATE` hardware-validated on CasparCG 2.3.2 (`4de6d18f` Dev) — ADR 0006.**
 * The C-001 Phase-3b harness (`tools/caspar-amcp-probe`) proved `CG UPDATE` delivers
 * a Persian-laden JSON payload to `window.update` intact. The verb sequence is:
 *
 *   load   → `CG <ch>-<layer> ADD 0 "<template>" 0 "<data>"`  (play-on-load OFF)
 *   take   → `CG <ch>-<layer> PLAY 0`
 *   update → `CG <ch>-<layer> UPDATE 0 "<data>"`
 *   out    → `CLEAR <ch>-<layer>`
 *
 * B-039 — the play-on-load flag is **`0`** (load does NOT auto-play): load only
 * ADDs the producer (loaded, not playing); the operator's take issues the `CG PLAY`.
 * The bridge (`CasparRuntime`) chooses the verb sequence prescriptively — a take
 * after an out re-issues this `load()` (re-ADD) before `take()` since the prior
 * `CLEAR` destroyed the producer. (The load/take/out/retake cycle with the flag OFF
 * is re-validated on real CasparCG before B-039 closes.)
 *
 * The disproven alternatives are NOT pending work: `CALL ... "update"` returned
 * `202` but never invoked `window.update`; `CG INVOKE ... "update" "<json>"`
 * delivered an EMPTY param; the inline `CG INVOKE ... "update(<json>)"` form
 * delivered `"[object Object]"`. `CG UPDATE` is the answer.
 *
 * All user values are escaped via `quote()` from `@cg/caspar-client` (the one
 * canonical AMCP quoter), applied EXACTLY ONCE per argument. The data argument is
 * already a `JSON.stringify` string; `quote()` applies the hardware-confirmed
 * two-layer escape (B-041 take 2: the JS-literal layer, then the AMCP layer — net
 * each JSON `\` → four wire backslashes, each `"` → `\"`, never a raw control
 * byte), so the payload survives BOTH of CasparCG's un-escapes (AMCP tokenizer,
 * then the html_cg_proxy `update("…")` V8 embed) byte-exact at the template's
 * `JSON.parse`. See `packages/caspar-client/src/amcp/escape.ts` for the rule and
 * its provenance. A raw value never reaches the wire unquoted.
 */
export class CommandBuilder {
  /** Load a template onto a slot — `CG ADD` with play-on-load OFF (loaded, NOT playing). */
  load(slot: CommandSlot, template: string, fields: FieldValues): string {
    return `CG ${target(slot)} ADD ${String(FLASH_LAYER)} ${quote(template)} 0 ${quote(serialize(fields))}`;
  }

  /** Play (take to air) the loaded template on a slot. */
  take(slot: CommandSlot): string {
    return `CG ${target(slot)} PLAY ${String(FLASH_LAYER)}`;
  }

  /** Push updated field values to the playing template on a slot. */
  update(slot: CommandSlot, fields: FieldValues): string {
    return `CG ${target(slot)} UPDATE ${String(FLASH_LAYER)} ${quote(serialize(fields))}`;
  }

  /**
   * C-012 — GRACEFUL stop: tell the template to run its own outro and leave the
   * producer RESIDENT on the layer.
   *
   * The fifth verb, and the one that makes `out()` a genuine choice rather than
   * the only way off air. Hardware-verified on CasparCG 2.3.2 (`4de6d18f`, PR
   * #353's probe):
   *
   *   CG <ch>-<layer> STOP 0  -> 202 CG OK; OSC still reports `html`;
   *                              the template's `window.stop` FIRED
   *   CG <ch>-<layer> PLAY 0  -> 202 CG OK, resumed — with NO re-ADD
   *   CLEAR <ch>-<layer>      -> OSC goes SILENT; the producer is DESTROYED
   *
   * So STOP and CLEAR reach genuinely different end states, and both are legible
   * to the occupancy tap: stopped reads OCCUPIED (the producer is there),
   * cleared reads silent.
   */
  stop(slot: CommandSlot): string {
    return `CG ${target(slot)} STOP ${String(FLASH_LAYER)}`;
  }

  /**
   * R-028 (owner call o2) — advance the template's sequence: `CG NEXT`.
   *
   * The capability has existed template-side all along — the exporter sets
   * `window.next`, `next()` is a CasparCG global, and `runtime.next()`
   * dispatches to the sequence drivers — but the bridge could never SEND it:
   * this builder had no NEXT verb, so the wire gap made the whole feature
   * unreachable. The verb lands here (the single AMCP construction seam);
   * the channel/UI wiring is R-028 part B, gated on the import-derived
   * `hasNext` bit so an enabled control can never be a no-op.
   */
  next(slot: CommandSlot): string {
    return `CG ${target(slot)} NEXT ${String(FLASH_LAYER)}`;
  }

  /** Hard-out: clear the slot. DESTROYS the producer — contrast `stop()`. */
  out(slot: CommandSlot): string {
    return `CLEAR ${target(slot)}`;
  }

  /**
   * R-022 — set a layer's audio volume: `MIXER <ch>-<layer> VOLUME <value>`.
   *
   * The sixth verb, and the one REHEARSE is built on. Rehearse leaves the
   * CasparCG producer RESIDENT and mutes the layer, rather than
   * CLEAR-then-re-ADD: that cycle is exactly the sequence that failed in the
   * field — an adopt-`CLEAR` succeeded, the `CG ADD` after it returned 404, and
   * the layer was left empty on air. Rehearse must not depend on a path with a
   * known failure mode. (This is also R-029's recorded containment option 2.)
   *
   * WHY A MUTE IS NEEDED AT ALL. On 2.3.2 a resident, unplayed template is
   * already silent (issue #669 — zero across all 10,339 OSC samples) and
   * invisible (`cg-pending` hides the stage), so on today's plant this is
   * belt-and-braces. On 2.5.0 `CG ADD` alone puts audio on air 0.24 s later with
   * the stage still hidden — so the mute is what makes rehearse survive the
   * upgrade instead of becoming a landmine on it.
   *
   * MIXER STATE IS NOT PRODUCER STATE. It belongs to the channel's mixer, so it
   * survives a `CLEAR` and a `CG REMOVE` of the producer on the layer. Nothing
   * restores it implicitly — which is why {@link CommandBuilder.mixerVolume} is
   * called from the PLAY path unconditionally, on every take, rather than only
   * from a "leave rehearse" step: the failure mode of a missed restore is a
   * graphic that airs SILENT, and no crash, reload or missed transition may be
   * able to cause it.
   *
   * Not hardware-validated. `MIXER … VOLUME` is long-standing, documented AMCP
   * and the 2.3.2 plant is the reference, but this verb has not been exercised on
   * it by this project — recorded in `DEBT.md`.
   */
  mixerVolume(slot: CommandSlot, volume: number): string {
    return `MIXER ${target(slot)} VOLUME ${String(volume)}`;
  }
}

/** `<channel>-<layer>` per AMCP. */
function target(slot: CommandSlot): string {
  return `${String(slot.channel)}-${String(slot.layer)}`;
}

/** Field values as the JSON string the HTML producer's `window.update` expects. */
function serialize(fields: FieldValues): string {
  return JSON.stringify(fields);
}

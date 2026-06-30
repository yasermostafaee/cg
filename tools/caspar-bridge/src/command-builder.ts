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
 * already a `JSON.stringify` string, so `quote()` only makes it survive CasparCG's
 * quoted-string parsing (escapes `"` → `\"`; backslashes stay literal) — it does NOT
 * re-escape what JSON already handled (B-041: the old backslash-doubling corrupted
 * `"` / `\` / newline values). A raw value never reaches the wire unquoted.
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

  /** Hard-out: clear the slot. */
  out(slot: CommandSlot): string {
    return `CLEAR ${target(slot)}`;
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

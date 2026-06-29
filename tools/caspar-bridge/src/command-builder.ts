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
 * slot. Keeping construction here means the on-hardware-verified sequence can be
 * slotted in at **Phase 3** without touching `ServerSession` / `CommandQueue` /
 * `Reconciler`.
 *
 * ⚠️ The Phase-2 sequence below is **`amcp-mock`-VALIDATED, NOT
 * hardware-VALIDATED.** It is exactly what `tools/amcp-mock` acknowledges:
 *
 *   load   → `CG <ch>-<layer> ADD 0 "<template>" 1 "<data>"`
 *   take   → `CG <ch>-<layer> PLAY 0`
 *   update → `CG <ch>-<layer> UPDATE 0 "<data>"`
 *   out    → `CLEAR <ch>-<layer>`
 *
 * ADR 0006 found that on real CasparCG 2.3.2, `CG INVOKE 1 "update"` delivered an
 * EMPTY payload and `CALL ... "update"` returned `202 CALL OK` but never invoked
 * `window.update`. The correct update verb is therefore **unresolved on
 * hardware**. `amcp-mock` does not implement `CALL` and acks `CG UPDATE`, so
 * Phase 2 uses `CG UPDATE`. Phase 3 replaces the verb HERE with the verified one
 * (and updates ADR 0006) — no other code changes.
 *
 * All user values are escaped via `quote()` from `@cg/caspar-client` (the one
 * canonical AMCP quoter); a raw value never reaches the wire unquoted.
 */
export class CommandBuilder {
  /** Load a template onto a slot (primed to play). */
  load(slot: CommandSlot, template: string, fields: FieldValues): string {
    return `CG ${target(slot)} ADD ${String(FLASH_LAYER)} ${quote(template)} 1 ${quote(serialize(fields))}`;
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

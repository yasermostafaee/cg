import type { TemplateInfo } from '@cg/shared-ipc';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import { importSuccessMessage, importVcgFile } from '../library/importVcgFile.js';
import { newItemFields, newItemId } from '../library/newItemFields.js';
import { reportCommandSuccess } from '../status/commandFeedback.js';

/**
 * R-021 stage 3 — the fixed row's load path, React-free so the chain (rather than
 * the button that runs it) is what gets unit-tested.
 *
 * ⭐ `RUNTIME-REPAIR-05` — THIS WAS ONE CHAIN AND IS NOW TWO STEPS. Importing a
 * `.vcg` registers it to the SHARED library (the library's own flow, reused
 * verbatim via `importVcgFile`, never a fixed-layers-only fork) and stops there;
 * loading creates an item bound to the row's EXACT slot, from a template already
 * in the library. The operator performs them as two presses in two dialogs.
 *
 * The binding happens on the bridge through `LayerManager.bindFixed`; nothing here
 * can reach dynamic allocation, because `fixedLayers.load` is the only channel it
 * calls and that channel refuses any coordinate outside the declared bank
 * (`not-fixed`).
 *
 * ⚠ IT DOES NOT PRE-ROLL. A fixed-row LOAD is LIST-ONLY on the bridge (`loadFixed`
 * → `#loadOnto(listOnly)`): no adopt-`CLEAR`, no `CG ADD`, no AMCP of any kind. The
 * first wire contact for a row is its PLAY, which re-ADDs on the way to air
 * (B-039). This comment said "pre-roll it" for a while after that stopped being
 * true, and `RUNTIME-FIX-0904` spent its first section establishing the fact
 * from the code — a stale sentence here is one more place the next reader would
 * have believed a `load … ok` audit row proved the template had reached
 * CasparCG. It proves nothing about the wire.
 *
 * A cancelled file picker resolves `null` — nothing ran, so no success flash and
 * no error toast. The dialog that called it decides what that means for its own
 * busy state; this module never invents an outcome for an act the operator declined.
 */
export interface FixedSlotCoord {
  channel: number;
  layer: number;
}

/**
 * Load a template ALREADY in the library onto the exact slot.
 *
 * Since `RUNTIME-REPAIR-05` this is the ONLY way a row is loaded: the Templates
 * dialog commits a SELECTION through here, and a freshly imported package reaches
 * it the same way as one that has been on the station for a month — selected in
 * the list, then committed. One path, so there is no second one to disagree.
 */
export function loadTemplateOntoFixedSlot(
  slot: FixedSlotCoord,
  template: TemplateInfo,
): Promise<AsyncResult> {
  return window.cg.fixedLayers.load({
    channel: slot.channel,
    layer: slot.layer,
    itemId: newItemId(),
    templateId: template.templateId,
    fields: newItemFields(template),
  });
}

/**
 * 🔴 IMPORT A PACKAGE INTO THE STATION, AND LOAD NOTHING.
 *
 * `pick` is injected (the caller supplies its hidden input's picker, or a file
 * already in hand from a drop) so this module stays DOM-free and testable.
 * Resolves the REGISTERED template — the caller decides what, if anything, to
 * do with it — or `null` when the operator dismissed the OS dialog.
 *
 * ── WHY THIS NO LONGER ENDS IN A LOAD (`RUNTIME-REPAIR-05`, owner, 2026-09-09) ──
 *
 * It used to be `importAndLoadOntoFixedSlot`: one gesture that imported a
 * package AND bound it to the row that started it. The owner has split the
 * picker into two dialogs — Templates, and a station-level Import — and importing
 * is now a station act with no row in it: the package is registered, the operator
 * is returned to Templates with it SELECTED, and the load is the next, separate
 * press. So the chain lost its tail, not its head.
 *
 * ⚠ EVERY REFUSAL IS THE SAME ONE. `importVcgFile` still runs
 * `verify → unpack → the B-196 runtime-contract guard → render`, still throws the
 * operator-facing message naming the file, and still registers NOTHING on a bad
 * package (R-001). Nothing about what is refused, or on what grounds, moved with
 * the control.
 *
 * The success is reported as it happens because it is a real, separately-durable
 * outcome: the template is in the library for reuse whatever the operator does
 * next — including closing the dialog without loading anything.
 */
export async function importVcgToStation(
  pick: () => Promise<File | null>,
): Promise<TemplateInfo | null> {
  const file = await pick();
  // The operator dismissed the OS file dialog — their own "no".
  if (file === null) return null;

  // Throws the operator-facing message (naming the file) and registers nothing
  // on a bad package — the R-001 invariant, inherited from the shared flow.
  const imported = await importVcgFile(file);
  reportCommandSuccess(importSuccessMessage(imported));

  // The registry is the authority on the registered template's shape; read the
  // seed from THERE rather than from anything reconstructed here, so an import
  // and a re-use of an existing template seed identical fields for identical
  // bytes.
  const template = await window.cg.templates.get({ templateId: imported.templateId });
  if (template === null) {
    // §6 — no "library": it named a deleted panel, and worse, the remedy it gave
    // pointed at that panel. The import DID land, so the honest remedy is to pick
    // the template that is now in the list.
    throw new Error(
      `“${imported.displayName}” imported, but the registry could not read it back — close this and pick it from the list.`,
    );
  }
  return template;
}

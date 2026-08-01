import type { TemplateInfo } from '@cg/shared-ipc';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import { importSuccessMessage, importVcgFile } from '../library/importVcgFile.js';
import { newItemFields, newItemId } from '../library/newItemFields.js';
import { reportCommandSuccess } from '../status/commandFeedback.js';

/**
 * R-021 stage 3 — the fixed row's ONE-ACTION import+load chain, React-free so
 * the chain (rather than the button that runs it) is what gets unit-tested.
 *
 * The chain is, in order: pick a `.vcg` → import it into the SHARED library
 * (where it STAYS, for reuse — this is the library's own import flow, reused
 * verbatim via `importVcgFile`, never a fixed-layers-only fork) → create an
 * item bound to the row's EXACT slot → pre-roll it. The binding happens on the
 * bridge through `LayerManager.bindFixed`; nothing here can reach dynamic
 * allocation, because `fixedLayers.load` is the only channel it calls and that
 * channel refuses any coordinate outside the declared bank (`not-fixed`).
 *
 * A cancelled file picker returns `{ accepted: false, cancelled: true }` — the
 * `withConfirm` contract: nothing ran, so no success flash and no error toast.
 */
export interface FixedSlotCoord {
  channel: number;
  layer: number;
}

/**
 * Load a template ALREADY in the library onto the exact slot — the
 * Load-from-library variant. Same binding, same channel, same item seed as the
 * import chain below; it just skips the import step.
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
 * The full chain from a picked file. `pick` is injected (the row supplies its
 * hidden input's picker) so this module stays DOM-free and testable.
 *
 * The import step's success is reported as it happens, because it is a real,
 * separately-durable outcome: the template is in the library for reuse even if
 * the load that follows is refused. Reporting only at the end would leave the
 * operator believing a refused load meant nothing was imported.
 */
export async function importAndLoadOntoFixedSlot(
  slot: FixedSlotCoord,
  pick: () => Promise<File | null>,
): Promise<AsyncResult> {
  const file = await pick();
  // The operator dismissed the OS file dialog — their own "no".
  if (file === null) return { accepted: false, cancelled: true };

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
    // pointed at that panel. The import DID land, so the honest remedy is to press
    // LOAD again and pick the template that is now in the list.
    throw new Error(
      `“${imported.displayName}” imported, but the registry could not read it back — press LOAD again and pick it from the list.`,
    );
  }
  return loadTemplateOntoFixedSlot(slot, template);
}

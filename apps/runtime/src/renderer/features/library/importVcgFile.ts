import type { Position } from '@cg/shared-schema';
import { importTemplateFromBytes } from './templateDelivery.js';
import { notifyLibraryChanged } from './libraryChanged.js';
import { recordDefaultPosition } from '../stack/defaultPositionStore.js';
import { recordListFieldTargets } from '../inspector/fieldTargetStore.js';
import type { ListFieldTargets } from '../inspector/listFieldTargets.js';
// B-038 Phase 3 — the bundled app @font-face CSS (Vazirmatn / Exo 2) as a raw
// string. Passed to the single-file export so the bundled faces inline as base64
// and the template HTML CasparCG loads renders Persian with the correct face.
import appFontsCss from '../../fonts.css?inline';

/**
 * R-001 — the ONE `.vcg` → library import step: read the picked file, verify +
 * unpack + render it (`importTemplateFromBytes`), register it, and record the
 * two per-template side facts the Inspector needs (R-011 default position,
 * R-018 list-field targets) at the one moment the app holds the unpacked scene.
 *
 * R-021 stage 3 — extracted from `LibraryPanel` so the fixed row's one-action
 * import+load chain REUSES this flow rather than forking it. The extraction is
 * behaviour-preserving for the Library: the panel keeps its own refresh and its
 * success toast, which are panel concerns, and everything that decides WHAT
 * gets registered lives here, once. A second copy of this sequence is how the
 * two import paths would come to register different things from the same bytes.
 *
 * **Throws** with the operator-facing message, registering nothing — the R-001
 * "bad input → clear error, nothing registered" invariant. The thrown text
 * already names the file, so callers surface it verbatim.
 */
export interface ImportedVcg {
  templateId: string;
  /** R-004 — what the operator should be told they imported. */
  displayName: string;
  warnings: string[];
  defaultPosition?: Position;
  listFieldTargets: ListFieldTargets;
}

export async function importVcgFile(file: File): Promise<ImportedVcg> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    throw new Error(
      `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let imported: ImportedVcg;
  try {
    // B-038 Phase 2 — produce the self-contained standalone HTML from the
    // unpacked `.vcg` and deliver it with the `TemplateInfo` over
    // `templates.import`. A package that fails verification / unpack / export
    // throws → nothing is registered. Thrown messages are pre-formatted (e.g.
    // "failed verification: …"); the file name is added here.
    // R-004 — `file.name` is the label the operator recognises, and this is the
    // only place it exists (the bytes cannot carry it).
    imported = await importTemplateFromBytes(window.cg, bytes, {
      fontsCss: appFontsCss,
      sourceFileName: file.name,
    });
  } catch (err) {
    throw new Error(`“${file.name}” ${err instanceof Error ? err.message : String(err)}`);
  }

  // R-011 — record the manifest default position (the one moment the app holds
  // the unpacked scene) so the Inspector's picker seeds from it.
  recordDefaultPosition(imported.templateId, imported.defaultPosition);
  // R-018 — record each list field's consuming element kind (same one moment)
  // so the from-file control can default SPLIT per target.
  recordListFieldTargets(imported.templateId, imported.listFieldTargets);
  // The library gained a template — whichever entry point ran. Emitted HERE so
  // every import path announces it, never only the one that remembered to.
  notifyLibraryChanged();
  return imported;
}

/** The success wording for an import, shared so both entry points say the same thing. */
export function importSuccessMessage(imported: ImportedVcg): string {
  return imported.warnings.length > 0
    ? `Imported “${imported.displayName}” (${String(imported.warnings.length)} warning(s): ${imported.warnings.join('; ')}).`
    : `Imported “${imported.displayName}”.`;
}

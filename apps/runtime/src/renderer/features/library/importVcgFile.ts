import type { Position } from '@cg/shared-schema';
import { importTemplateFromBytes } from './templateDelivery.js';
import { notifyLibraryChanged } from './libraryChanged.js';
import { recordDefaultPosition } from '../stack/defaultPositionStore.js';
import { recordListFieldTargets } from '../inspector/fieldTargetStore.js';
import { noteAssignmentsCarriedOver } from '../sources/sourceStore.js';
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
  /** A9 — the plate ids this version declares (empty for a template with none). */
  declaredPlateIds: readonly string[];
}

/**
 * `CHANNEL-TEMPLATES-01` — `channel` is the channel whose list the package joins (the picker's
 * row's); no other channel's list changes. Absent, the station-wide import a caller that names no
 * channel always made.
 */
export async function importVcgFile(file: File, channel?: number): Promise<ImportedVcg> {
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
      ...(channel !== undefined && { channel }),
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
  // A9 / D-137 — a re-import KEEPS this channel's Source defaults for every plate that still
  // exists, and one for a plate the new version no longer declares is ignored, never deleted
  // (`CHANNEL-TEMPLATES-01` decision 2): nothing is written. What is noted is whether any were
  // carried over, so the Inspector can say so.
  noteAssignmentsCarriedOver(imported.templateId, imported.declaredPlateIds, channel);
  // The library gained a template — whichever entry point ran. Emitted HERE so
  // every import path announces it, never only the one that remembered to.
  notifyLibraryChanged();
  return imported;
}

/** The success wording for an import, shared so both entry points say the same thing. */
export function importSuccessMessage(imported: ImportedVcg): string {
  /*
    🔴 `CONSOLE-LOOK-06` DELTA D3 — THE SUBJECT AND ITS VALUE, and the reference's own
    separator. Its example toast is three words (`Channel 2 · Sports`) and this one used to
    open with a verb phrase, quote the name, parenthesise a count and then inline every
    warning text — 34 characters before the name on a surface that lives 3.2 seconds.

    ⚠ THE WARNING COUNT SURVIVES AND THE WARNING TEXTS DO NOT — that is the one thing here
    that is a judgement rather than typography. A semicolon-joined list of warnings inside a
    toast was never readable at this dwell; the count is what tells the operator to go and
    look, and the warnings themselves are on the template's own record.
  */
  const warned =
    imported.warnings.length > 0
      ? ` · ${String(imported.warnings.length)} warning${imported.warnings.length === 1 ? '' : 's'}`
      : '';
  return `Imported · ${imported.displayName}${warned}`;
}

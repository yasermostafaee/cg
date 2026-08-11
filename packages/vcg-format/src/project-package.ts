import {
  ProjectPackageManifestSchema,
  PROJECT_PACKAGE_MANIFEST_PATH,
  PROJECT_PACKAGE_SCENE_PATH,
  SceneSchema,
  type ProjectAssetEntry,
  type ProjectPackageManifest,
  type Scene,
} from '@cg/shared-schema';
import { utf8ToBytes } from '@noble/hashes/utils';
import { readZip, writeZip } from './zip.js';

/**
 * D-150 / B-104 — the PROJECT PACKAGE: `pack`/`unpack` for the Designer's own
 * working document, built on the SAME zip primitives as the `.vcg` exporter.
 *
 * ```
 * <name>.cgproj
 * ├── manifest.json                 ProjectPackageManifest (format: 'cgproj')
 * ├── project.json                  the FULL authoring Scene
 * └── assets/<kind>/<sha256>.<ext>  the bytes
 * ```
 *
 * **Why this is not `pack()`** — three reasons, each of which would be a defect if
 * a project were saved through the export path:
 *
 * 1. 🔴 `pack()` runs `withoutEditorBackdrop(scene)` (B-129). That is right for a
 *    broadcast artifact and catastrophic for a save: it would delete the author's
 *    canvas backdrop every single time they pressed Ctrl+S.
 * 2. `pack()` requires `indexHtml` + `cgJs` + `cgCss` — a `.vcg` embeds the runtime
 *    so it plays standalone. A project has no use for hundreds of KB of runtime in
 *    every save.
 * 3. `ManifestSchema` is a broadcast contract: Merkle integrity root, optional
 *    Ed25519 signature. A working save is not a signed distribution artifact.
 *
 * **What IS shared** — and this is the whole of the "no second packaging
 * implementation" rule: `writeZip` / `readZip` (one zip library, one determinism
 * policy, one STORE/DEFLATE table) and `sha256Hex` for content addressing. Only the
 * file map and the manifest differ, which is what "a different document" means.
 */

/** The zip local-file-header magic: `PK\x03\x04`. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

const decoder = new TextDecoder();

export interface PackProjectInput {
  /** The authoring scene, saved VERBATIM (see the note on `editorBackdrop` above). */
  scene: Scene;
  /**
   * The asset index. Each entry's `sha256` is REUSED from import time — a save
   * never re-hashes bytes it already has a hash for. Measured: the hashing pass
   * costs more than the zip write, and it buys nothing here.
   */
  index: readonly ProjectAssetEntry[];
  /** In-package path → bytes. Must contain an entry for every `index[i].path`. */
  files: ReadonlyMap<string, Uint8Array>;
  /** ISO-8601 save instant. Injected so the caller owns the clock (and tests are deterministic). */
  savedAt: string;
}

export interface ProjectDocument {
  scene: Scene;
  /** In-package path → bytes. */
  files: Map<string, Uint8Array>;
  index: ProjectAssetEntry[];
  manifest: ProjectPackageManifest;
}

/**
 * Write a project package. Deterministic for a fixed `savedAt`: the same input
 * produces byte-identical output, because `writeZip` sorts paths and pins dates.
 */
export async function packProject(input: PackProjectInput): Promise<Uint8Array> {
  // Validate the scene at the door, exactly as `pack()` does — a project file that
  // cannot be parsed back is worse than a failed save.
  SceneSchema.parse(input.scene);

  const files = new Map<string, Uint8Array>();

  // 🔴 The scene is written WHOLE. Do NOT "align this with pack()" by routing it
  // through `withoutEditorBackdrop` — see the header. The editor's backdrop is part
  // of the document the author is editing; stripping it here is silent data loss on
  // every save, which is the class of bug this whole change exists to end.
  files.set(PROJECT_PACKAGE_SCENE_PATH, utf8ToBytes(JSON.stringify(input.scene, null, 2)));

  for (const entry of input.index) {
    const bytes = input.files.get(entry.path);
    if (bytes === undefined) {
      throw new Error(`Project package is missing bytes for indexed asset: ${entry.path}`);
    }
    if (files.has(entry.path)) {
      throw new Error(`Duplicate path in .cgproj: ${entry.path}`);
    }
    files.set(entry.path, bytes);
  }

  const manifest: ProjectPackageManifest = {
    format: 'cgproj',
    formatVersion: '1.0',
    projectId: input.scene.id,
    name: input.scene.name,
    savedAt: input.savedAt,
    assets: [...input.index],
  };
  files.set(PROJECT_PACKAGE_MANIFEST_PATH, utf8ToBytes(JSON.stringify(manifest, null, 2)));

  return writeZip(files);
}

/**
 * Read a project package. Throws with a NAMED reason when the bytes are a zip but
 * not a project package — most usefully when they are a `.vcg`, which an operator
 * will absolutely try to open as a project one day.
 */
export async function unpackProject(buf: Uint8Array): Promise<ProjectDocument> {
  const files = await readZip(buf);

  const manifestBuf = files.get(PROJECT_PACKAGE_MANIFEST_PATH);
  if (manifestBuf === undefined) {
    throw new Error('Not a project package: manifest.json is missing');
  }

  const rawManifest: unknown = JSON.parse(decoder.decode(manifestBuf));
  const format = (rawManifest as { format?: unknown }).format;
  if (format === 'vcg') {
    throw new Error(
      'That is an exported .vcg template, not a project. Use the Runtime to play it, or keep the .cgproj the Designer saved.',
    );
  }
  const manifest = ProjectPackageManifestSchema.parse(rawManifest);

  const sceneBuf = files.get(PROJECT_PACKAGE_SCENE_PATH);
  if (sceneBuf === undefined) {
    throw new Error(`Not a project package: ${PROJECT_PACKAGE_SCENE_PATH} is missing`);
  }
  const scene = SceneSchema.parse(JSON.parse(decoder.decode(sceneBuf)) as unknown);

  const assetFiles = new Map<string, Uint8Array>();
  for (const entry of manifest.assets) {
    const bytes = files.get(entry.path);
    if (bytes !== undefined) assetFiles.set(entry.path, bytes);
  }

  return {
    scene,
    files: assetFiles,
    // An entry whose bytes are absent is dropped rather than kept as a dangling
    // reference: the index IS the claim "these bytes are here", and a claim that is
    // false is worse than an omission the operator can see in the assets panel.
    index: manifest.assets.filter((a) => assetFiles.has(a.path)),
    manifest,
  };
}

/** True iff the bytes start with the zip local-file-header magic. */
export function looksLikeZip(buf: Uint8Array): boolean {
  return buf.length >= 4 && ZIP_MAGIC.every((b, i) => buf[i] === b);
}

/**
 * 🔴 **THE ONE ENTRY POINT for reading a project document.**
 *
 * A project is a `.cgproj` zip. There is exactly ONE form, and this is where that is
 * enforced — on BYTES (zip magic), before anything is parsed.
 *
 * **P-031 — the pre-package `.cg.json` read path is GONE, deliberately.** It existed
 * to open documents written before D-150 made a project a package. Nothing has shipped
 * to a client, so no such document needs to keep opening, and the owner's
 * compatibility-floor decision retires the shim rather than carrying it forever (see
 * `P-031` in `docs/prd/platform.md`). A conversion nobody needs is debt that reads as
 * safety — and it was a second, weaker document shape that every downstream consumer
 * had to branch on.
 *
 * What replaced it is ONE loud, readable failure, which is the whole point: an author
 * handed a bare `.cg.json` is told what the file is and what to do about it, instead of
 * getting a half-populated project with no assets. **The reversal is written down too:**
 * the first shipped release becomes the compatibility floor, and after it a removal like
 * this one stops being free — see `P-031`.
 */
export async function readProjectDocument(buf: Uint8Array): Promise<ProjectDocument> {
  if (looksLikeZip(buf)) return unpackProject(buf);

  throw new Error(
    'That file is not a cg project package. Pre-package projects (a bare .cg.json) are no ' +
      'longer supported — re-create the project and save it as .cgproj.',
  );
}

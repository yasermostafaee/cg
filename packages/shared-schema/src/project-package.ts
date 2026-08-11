import { z } from 'zod';
import { AssetMetaSchema } from './assets.js';

/**
 * D-150 / B-104 — the PROJECT PACKAGE manifest.
 *
 * A project's durable form is a self-contained package (`.cgproj`) that carries
 * its own asset bytes. Before this, a project was a bare `.cg.json` holding a
 * `Scene` and a set of `assetId` strings, while the bytes lived under
 * `projects/<scene.id>/assets/...` in whatever storage root happened to be active.
 * A full browser restart drops a directory handle's permission grant, the root
 * silently changes, and the bytes are orphaned — that is B-104, a data-loss bug.
 *
 * 🔴 **This is NOT `ManifestSchema`, and the distinction is load-bearing.**
 * `ManifestSchema` describes a `.vcg`: a BROADCAST artifact with a Merkle
 * integrity root, an optional Ed25519 signature, and — via `pack()` —
 * `withoutEditorBackdrop()` applied to the scene (B-129). Saving a project
 * through that path would delete the author's canvas backdrop on every save. A
 * project package round-trips the AUTHORING scene exactly; an export deliberately
 * does not. Same zip primitives, different document.
 */

/**
 * One asset inside a project package.
 *
 * 🔴 **DERIVED from {@link AssetMetaSchema}, never re-declared.** A hand-written
 * copy of the asset shape is how the two descriptions of one thing drift; this
 * cannot drift, because it is the same object with one field swapped.
 *
 * `workingPath` is dropped and `path` takes its place, and that swap IS the fix:
 * `workingPath` is workspace-relative (`projects/<projectId>/assets/...`), so it
 * encodes a dependency on a mutable storage root. `path` is package-internal
 * (`assets/<kind>/<sha>.<ext>`) and means the same thing in every copy of the
 * file, on every machine, forever.
 */
export const ProjectAssetEntrySchema = AssetMetaSchema.omit({ workingPath: true }).extend({
  /** Package-internal path, e.g. `assets/image/<sha256>.png`. */
  path: z.string().min(1),
});
export type ProjectAssetEntry = z.infer<typeof ProjectAssetEntrySchema>;

/** The in-package path of the authoring scene. */
export const PROJECT_PACKAGE_SCENE_PATH = 'project.json';
/** The in-package path of the manifest. */
export const PROJECT_PACKAGE_MANIFEST_PATH = 'manifest.json';
/** The project package's file extension, including the dot. */
export const PROJECT_PACKAGE_EXT = '.cgproj';

export const ProjectPackageManifestSchema = z.object({
  /**
   * The document TYPE, checked by name. A `.vcg` says `'vcg'` here; opening one
   * as a project is refused by this literal rather than by a confusing failure
   * deeper in.
   */
  format: z.literal('cgproj'),
  formatVersion: z.literal('1.0'),
  /** The `Scene.id` this package holds — the same id the assets were scoped by. */
  projectId: z.string().min(1),
  name: z.string(),
  /** ISO-8601 instant the package was written. */
  savedAt: z.string().min(1),
  /**
   * Every asset in the package. The bytes are at `entry.path` inside the zip;
   * this index is what rebuilds the Designer's asset store on open, so it must
   * carry everything the importing session recorded — including `provenance`,
   * which cannot be reconstructed from bytes.
   */
  assets: z.array(ProjectAssetEntrySchema),
});
export type ProjectPackageManifest = z.infer<typeof ProjectPackageManifestSchema>;

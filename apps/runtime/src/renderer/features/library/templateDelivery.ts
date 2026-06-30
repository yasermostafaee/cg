import type {
  AssetMeta,
  ChannelRequest,
  ChannelResponse,
  TemplateInfo,
  TemplatesImportChannel,
} from '@cg/shared-ipc';
import type { Manifest } from '@cg/shared-schema';
import { unpack, verify } from '@cg/vcg-format';
import { ExporterSingleFile, cgCss, cgJsIife, type ImageAssetSource } from '@cg/single-file-export';

/**
 * B-038 Phase 2 — produce the rendered template HTML in the browser and deliver
 * it to the bridge over the extended `templates.import` channel (content delivery
 * only; the bridge retains it, nothing renders yet).
 *
 * The heavy scene→HTML work stays browser-side (the bridge stays thin): at import
 * we already `verify` + `unpack` the `.vcg`; we now also render its scene to the
 * D-019 self-contained single-file HTML via `@cg/single-file-export` and ship that
 * string alongside the `TemplateInfo`.
 *
 * Kept React-free so it is unit testable on its own.
 */

/** What the import delivers: the registry metadata + the rendered page + warnings. */
export interface TemplateDelivery {
  template: TemplateInfo;
  /** The self-contained standalone HTML: runtime + scene + images inlined as base64. */
  html: string;
  /** Non-blocking export preflight messages (e.g. an image whose bytes didn't resolve). */
  warnings: string[];
}

/** The minimal `window.cg` surface this module needs (the extended import channel). */
export interface TemplateImportBridge {
  templates: {
    import(
      req: ChannelRequest<typeof TemplatesImportChannel>,
    ): Promise<ChannelResponse<typeof TemplatesImportChannel>>;
  };
}

/**
 * An {@link ImageAssetSource} backed by a `.vcg`'s unpacked contents — the
 * design's "asset-bytes source (the `files` map) rather than an AssetStore". The
 * manifest's `assetIndex` maps each `assetId → { path, … }`; the unpacked `files`
 * map holds the bytes at that path. Only image elements are resolved by the
 * exporter, but the lookup is asset-kind agnostic.
 */
function vcgImageAssetSource(
  manifest: Manifest,
  files: ReadonlyMap<string, Uint8Array>,
): ImageAssetSource {
  const byId = new Map(manifest.assetIndex.map((e) => [e.id, e] as const));
  return {
    get: (assetId) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      const meta: AssetMeta = {
        assetId: entry.id,
        // `assetIndex` allows `'audio'`; `AssetMeta` does not. Image assets are
        // never audio, so the narrowing is safe (the exporter only resolves images).
        kind: entry.kind === 'audio' ? 'image' : entry.kind,
        filename: entry.path.slice(entry.path.lastIndexOf('/') + 1),
        sha256: entry.sha256,
        byteSize: entry.bytes,
        workingPath: entry.path,
      };
      return Promise.resolve(meta);
    },
    bytes: (assetId) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      return Promise.resolve(files.get(entry.path) ?? null);
    },
  };
}

/**
 * Verify + unpack a `.vcg` and render its scene to the self-contained standalone
 * HTML. Returns the `TemplateInfo`, the produced HTML, and any non-blocking export
 * warnings. **Throws** a clear message — registering nothing — when the package
 * fails verification, cannot be unpacked, or the export yields an error-severity
 * issue (the R-001 "bad input → clear error, nothing registered" invariant).
 *
 * `fontsCss` is intentionally empty this phase: the Runtime ships no bundled
 * Vazirmatn / Exo 2 faces and serves no `/fonts/…`, so a real `fontsCss` would
 * leave broken external font refs and break self-containment. Operator `asset-*`
 * fonts and images carried in the `.vcg` still inline. Inlining the bundled
 * Persian faces is a REQUIRED Phase 3 item (see the change docs) — until then a
 * template relying on Vazirmatn / Exo 2 renders with a fallback face on air.
 */
export async function produceTemplateDelivery(bytes: Uint8Array): Promise<TemplateDelivery> {
  const result = await verify(bytes);
  if (!result.ok) {
    throw new Error(`failed verification: ${result.errors.join('; ')}`);
  }

  let scene, manifest, files;
  try {
    ({ scene, manifest, files } = await unpack(bytes));
  } catch (err) {
    throw new Error(`could not be unpacked: ${err instanceof Error ? err.message : String(err)}`);
  }

  const template: TemplateInfo = {
    templateId: manifest.id,
    templateType: scene.templateType,
    fields: scene.fields ?? [],
  };

  try {
    const exporter = new ExporterSingleFile({
      cgJsIife,
      cgCss,
      fontsCss: '',
      assets: vcgImageAssetSource(manifest, files),
    });
    const produced = await exporter.produce(scene);
    const errors = produced.issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((i) => i.message).join('; '));
    }
    return { template, html: produced.html, warnings: produced.issues.map((i) => i.message) };
  } catch (err) {
    throw new Error(`could not be rendered: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Produce the standalone HTML from a `.vcg` and deliver it to the bridge over the
 * extended `templates.import` channel (`{ template, html }`). Returns the
 * registered id + any warnings; throws (registering nothing) on a bad package.
 */
export async function importTemplateFromBytes(
  bridge: TemplateImportBridge,
  bytes: Uint8Array,
): Promise<{ templateId: string; warnings: string[] }> {
  const { template, html, warnings } = await produceTemplateDelivery(bytes);
  await bridge.templates.import({ template, html });
  return { templateId: template.templateId, warnings };
}

import type {
  AssetMeta,
  ChannelRequest,
  ChannelResponse,
  TemplateInfo,
  TemplatesImportChannel,
} from '@cg/shared-ipc';
import { aggregateCompositionFields, type Manifest, type Position } from '@cg/shared-schema';
import { unpack, verify } from '@cg/vcg-format';
import {
  ExporterSingleFile,
  cgCss,
  cgJsIife,
  cgJsLottieIife,
  type ImageAssetSource,
} from '@cg/single-file-export';
import { pickTemplateName, templateDisplayName } from './templateName.js';

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
  /**
   * R-011 — the scene's manifest default on-air position, surfaced at the
   * ONE moment the app holds the unpacked scene (import). The Library
   * records it so the Inspector's position picker can seed from it;
   * `TemplateInfo` deliberately does NOT carry it (the runtime applies the
   * default from the scene inside the served HTML regardless).
   */
  defaultPosition?: Position;
}

/** Inputs that vary by caller/environment (kept out of this React-free module). */
export interface ProduceOptions {
  /**
   * B-038 Phase 3 — the bundled app `@font-face` CSS (Vazirmatn / Exo 2). The
   * exporter fetches its `/fonts/…` URLs and inlines them as base64, so the
   * produced HTML stays self-contained AND Persian renders with the right face.
   * `LibraryPanel` passes the SPA's `fonts.css?inline`; default `''` (no bundled
   * faces) keeps the module usable without a Vite/`?inline` dependency.
   */
  fontsCss?: string;
  /**
   * Fetch a `/fonts/…` URL's bytes. Defaults to the browser `fetch` (resolves
   * against the SPA). Tests inject a node-fs reader so they can run off-DOM.
   */
  fetchUrl?: (url: string) => Promise<ArrayBuffer>;
  /**
   * R-004 — the name of the `.vcg` file the operator picked (`File.name`), verbatim. It is
   * the label they recognise, and it outranks the manifest name at display. The bytes alone
   * cannot tell us this, so the caller that HAS the `File` must pass it; omitted for a
   * bundled starter or a byte-only import (those keep their manifest name).
   */
  sourceFileName?: string;
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
 * B-038 Phase 3 — `fontsCss` (the bundled Vazirmatn / Exo 2 faces) is now inlined
 * as base64, so the produced HTML stays self-contained AND Persian renders with
 * the correct face on air. Operator `asset-*` fonts and images carried in the
 * `.vcg` also inline.
 */
export async function produceTemplateDelivery(
  bytes: Uint8Array,
  opts: ProduceOptions = {},
): Promise<TemplateDelivery> {
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

  // B-067 — the operator's field form must be the template's FULL field closure, not the
  // entry composition's flat fields. A D-119 starter is a graphic composition nested in a
  // full-frame positioning composition, and the authored fields live on the NESTED comp:
  // `migrateGlobalFieldsToCompositions` relocates each field to the comp that owns its
  // bound element, and the Designer exports the ENTRY comp scoped — so `scene.fields` is
  // `[]` and the Inspector rendered "No fields." This is the same collector the GDD
  // exporter already uses (`gdd.ts`), so `TemplateInfo` and the package's own GDD manifest
  // finally agree on which fields exist and how they are addressed.
  const aggregate = aggregateCompositionFields(scene, scene);
  // R-004 — carry BOTH labels the package can offer, and let the display rule choose.
  //
  // `name` is the manifest's (the Designer's exporter writes `scene.name` into it). It is
  // the entry COMPOSITION's name, which for a real operator package is often a
  // Designer-internal label — or blank, since `ManifestSchema.name` has no `.min(1)`.
  //
  // `sourceFileName` is the file the operator actually picked. It outranks the manifest at
  // display (see `templateName.ts`), and this is the one hop where it is still in hand.
  const name = pickTemplateName(manifest.name, scene.name);
  const template: TemplateInfo = {
    templateId: manifest.id,
    ...(name !== undefined ? { name } : {}),
    ...(opts.sourceFileName !== undefined ? { sourceFileName: opts.sourceFileName } : {}),
    templateType: scene.templateType,
    fields: [...aggregate.fields],
    groups: [...aggregate.groups],
  };

  try {
    const exporter = new ExporterSingleFile({
      cgJsIife,
      cgJsLottieIife,
      cgCss,
      fontsCss: opts.fontsCss ?? '',
      assets: vcgImageAssetSource(manifest, files),
      ...(opts.fetchUrl !== undefined ? { fetchUrl: opts.fetchUrl } : {}),
    });
    const produced = await exporter.produce(scene);
    const errors = produced.issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((i) => i.message).join('; '));
    }
    return {
      template,
      html: produced.html,
      warnings: produced.issues.map((i) => i.message),
      ...(scene.defaultPosition !== undefined ? { defaultPosition: scene.defaultPosition } : {}),
    };
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
  opts: ProduceOptions = {},
): Promise<{
  templateId: string;
  /** R-004 — what the operator should be told they imported (falls back to the id). */
  displayName: string;
  warnings: string[];
  defaultPosition?: Position;
}> {
  const { template, html, warnings, defaultPosition } = await produceTemplateDelivery(bytes, opts);
  await bridge.templates.import({ template, html });
  return {
    templateId: template.templateId,
    displayName: templateDisplayName(template),
    warnings,
    ...(defaultPosition !== undefined ? { defaultPosition } : {}),
  };
}

import { pack, sha256Hex } from '@cg/vcg-format';
import {
  isPathKeyframeValue,
  type AnchorPoint,
  type AssetEntry,
  type BindingTransform,
  type DynamicField,
  type Element,
  type Scene,
} from '@cg/shared-schema';
import type { ExportIssue, ExportProgress } from '@cg/shared-ipc';
import type { AssetStore } from './AssetStore.js';
import {
  collectImageElements,
  collectLottieElements,
  compositeImageSource,
  resolveImageAsset,
  type ImageAssetLibrary,
} from '@cg/single-file-export';
import { Emitter } from './emitter.js';

export interface ExporterOptions {
  assets: AssetStore;
  /**
   * D-040 — the device-level shared image library. When present, an image
   * element's bytes resolve from its source-indicated store first (shared for
   * `source: 'shared'`) and the other store as a fallback. Optional so callers /
   * tests without a library resolve from the project store only.
   */
  sharedImages?: ImageAssetLibrary;
  /** Bundled @cg/template-runtime JS injected as cg.js. */
  cgJs: string;
  /**
   * D-125 §D5(c) — the SEPARATE minified `lottie_light` player ESM bundle
   * (`cgJsLottie`), packaged as `cg-lottie.js` and imported by the index.html BEFORE
   * `cg.js` ONLY when the scene has a Lottie element (it installs `globalThis.__cgLottie`).
   * Absent ⇒ a Lottie-bearing `.vcg` still packs the JSON but the player is omitted.
   */
  cgJsLottie?: string;
  /** Runtime baseline stylesheet injected as cg.css. */
  cgCss: string;
}

/**
 * Browser port of the Electron ExportService (Phase 4 §7 pipeline). The
 * validation + HTML-emit logic is identical; the file output is replaced
 * with a browser download, and crypto/zip run through the isomorphic
 * @cg/vcg-format.
 */
export class Exporter {
  readonly progress = new Emitter<ExportProgress>();
  readonly #assets: AssetStore;
  readonly #sharedImages: ImageAssetLibrary | undefined;
  readonly #cgJs: string;
  readonly #cgJsLottie: string | undefined;
  readonly #cgCss: string;

  constructor(options: ExporterOptions) {
    this.#assets = options.assets;
    this.#sharedImages = options.sharedImages;
    this.#cgJs = options.cgJs;
    this.#cgJsLottie = options.cgJsLottie;
    this.#cgCss = options.cgCss;
  }

  /** Phase 4 §7 step 1 — validate without producing a file. */
  async preflight(scene: Scene): Promise<ExportIssue[]> {
    const issues: ExportIssue[] = [];

    if (scene.layers.length === 0) {
      issues.push({
        severity: 'info',
        code: 'empty-scene',
        message: 'Scene has no layers — export will render a blank frame.',
      });
    }

    // D-040 — an image reference is "known" if it resolves in EITHER the project
    // store OR the shared library, so a `source: 'shared'` logo isn't falsely
    // flagged missing and blocked.
    const knownAssetIds = new Set((await this.#assets.list()).map((a) => a.assetId));
    if (this.#sharedImages !== undefined) {
      for (const a of await this.#sharedImages.list()) knownAssetIds.add(a.assetId);
    }
    // Collect every element across the whole project — the main scene AND every
    // composition, recursing into containers — so binding targets resolve no
    // matter which composition is currently open (bindings are scene-level but
    // their target elements may live in another comp). Deduped by id.
    const elementsById = new Map<string, Element>();
    const walk = (children: readonly Element[]): void => {
      for (const el of children) {
        if (!elementsById.has(el.id)) elementsById.set(el.id, el);
        if (el.type === 'container') walk(el.children);
      }
    };
    for (const layer of scene.layers) walk(layer.children);
    for (const comp of scene.compositions ?? []) {
      for (const layer of comp.layers) walk(layer.children);
    }
    const allElementIds = new Set(elementsById.keys());
    for (const el of elementsById.values()) {
      if (el.type === 'image' && !knownAssetIds.has(el.assetId)) {
        issues.push({
          severity: 'error',
          code: 'missing-asset',
          message: `Image element references unknown asset ${el.assetId}.`,
          elementId: el.id,
        });
      }
      // D-039ext — a ticker IMAGE separator needs the same missing-asset check as an
      // image element (collectImageElements already inlines it), else it silently drops.
      if (
        el.type === 'ticker' &&
        typeof el.separator === 'object' &&
        el.separator !== null &&
        !knownAssetIds.has(el.separator.assetId)
      ) {
        issues.push({
          severity: 'error',
          code: 'missing-asset',
          message: `Ticker separator references unknown asset ${el.separator.assetId}.`,
          elementId: el.id,
        });
      }
    }

    for (const font of scene.fonts) {
      if (font.source === 'bundled' && font.bundledPath === undefined) {
        issues.push({
          severity: 'warning',
          code: 'font-no-path',
          message: `Bundled font ${font.family} is missing its bundled-path resource.`,
        });
      }
    }

    // D-121 — the .vcg now SHIPS the fonts it can (see `#gatherFonts`), so this
    // warning no longer fires merely because the scene has a ticker. It fires only
    // for a ticker whose face we genuinely cannot put in the package: a
    // system/licensed font (no shippable bytes), or an `asset-*` font whose project
    // asset is gone. Those still measure fallback glyphs on air, and a ticker's
    // measured width is what ends its content-driven hold.
    const bundleableFamilies = new Set(
      scene.fonts
        .filter((f) => bundleableAssetId(f.family, knownAssetIds) !== null)
        .map((f) => f.family),
    );
    // Ticker family → the first ticker using it, so one message per offending font.
    const unbundled = new Map<string, string>();
    for (const el of elementsById.values()) {
      if (el.type !== 'ticker') continue;
      const family = el.font.family;
      if (bundleableFamilies.has(family)) continue;
      // The Runtime app ships these faces itself and inlines its `fonts.css` when it
      // imports a package, so they ARE present on air — no drift, nothing to warn about.
      if (RUNTIME_SELF_HOSTED_FAMILIES.has(family)) continue;
      if (!unbundled.has(family)) unbundled.set(family, el.id);
    }
    for (const [family, elementId] of unbundled) {
      issues.push({
        severity: 'warning',
        code: 'vcg-ticker-fonts-not-bundled',
        message: `Ticker font "${family}" can't be bundled into the .vcg — a system/licensed face has no shippable bytes (and an imported font needs its asset still in the project). On a machine without it the crawl measures fallback glyphs, so its content-driven duration will be wrong. Import the font as a project asset so the package can ship it.`,
        elementId,
      });
    }

    // D-110 — adjacent path keyframes whose anchor-id sets differ: the morph
    // HOLDS/POPS the unmatched anchors across that segment (the defined Phase-1
    // fallback, never an error) — warn so the operator knows which segment
    // won't tween smoothly.
    for (const el of elementsById.values()) {
      if (el.type !== 'path') continue;
      const track = el.animation?.tracks['path'];
      if (track === undefined) continue;
      for (let i = 1; i < track.keyframes.length; i++) {
        const a = track.keyframes[i - 1];
        const b = track.keyframes[i];
        if (a === undefined || b === undefined) continue;
        if (!isPathKeyframeValue(a.value) || !isPathKeyframeValue(b.value)) continue;
        if (!sameAnchorIdSet(a.value.points, b.value.points)) {
          issues.push({
            severity: 'warning',
            code: 'path-morph-anchor-mismatch',
            message: `Path "${el.name}" has different anchor sets on the keyframes at frames ${String(a.frame)} and ${String(b.frame)} — unmatched anchors hold/pop across that segment instead of tweening (matching anchors still morph).`,
            elementId: el.id,
          });
        }
      }
    }

    const fieldsById = new Map(scene.fields.map((f) => [f.id, f]));

    for (const field of scene.fields) {
      if (field.required !== true) continue;
      const hasBinding = scene.bindings.some((b) => b.fieldId === field.id);
      if (!fieldHasMeaningfulDefault(field) && !hasBinding) {
        issues.push({
          severity: 'error',
          code: 'unbound-required-field',
          message: `Required field "${field.label}" has no default value and no binding.`,
          fieldId: field.id,
        });
      }
    }

    for (let i = 0; i < scene.bindings.length; i++) {
      const b = scene.bindings[i];
      if (b === undefined) continue;
      const field = fieldsById.get(b.fieldId);
      if (field === undefined) {
        issues.push({
          severity: 'error',
          code: 'unknown-binding-field',
          message: `Binding #${String(i)} references unknown field "${b.fieldId}".`,
        });
        continue;
      }
      if (b.target.kind !== 'scene-background' && !allElementIds.has(b.target.elementId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-binding-element',
          message: `Binding from "${b.fieldId}" targets unknown element "${b.target.elementId}".`,
          fieldId: b.fieldId,
        });
        continue;
      }
      if (b.transform !== undefined && !isFormatterApplicable(b.transform, field)) {
        issues.push({
          severity: 'warning',
          code: 'formatter-mismatch',
          message: `Formatter "${b.transform}" doesn't usefully apply to ${field.type} field "${b.fieldId}".`,
          fieldId: b.fieldId,
        });
      }
    }

    return issues;
  }

  /**
   * Run validation + pack and return the resulting `.vcg` bytes. Used
   * by both `run` (browser download) and the bridge's `runDisk`
   * (native save dialog → file handle write). Throws when preflight
   * surfaces an error-severity issue.
   */
  async produce(
    scene: Scene,
  ): Promise<{ vcg: Uint8Array; sha256: string; defaultFilename: string }> {
    this.progress.emit({ step: 'validate', progress: 0.05 });
    const fatal = (await this.preflight(scene)).filter((i) => i.severity === 'error');
    if (fatal.length > 0) {
      const first = fatal[0];
      throw new Error(
        `export blocked by validation: ${first?.code ?? 'unknown'} — ${first?.message ?? ''}`,
      );
    }

    this.progress.emit({ step: 'manifest', progress: 0.2 });
    this.progress.emit({ step: 'assets', progress: 0.4 });
    const { assetsMap, assetIndex } = await this.#gatherBinaries(scene);
    // D-121 — the fonts ride the same content-addressed shape as the images, but in
    // `fonts/` via the packer's dedicated `fonts` seam.
    const { fontsMap, fontIndex } = await this.#gatherFonts(scene);

    // D-125 §D5(c) — pack the Lottie player as `cg-lottie.js` ONLY when the scene has
    // a Lottie AND a player bundle was provided; the index.html imports it before
    // `cg.js` to install `globalThis.__cgLottie`. No Lottie ⇒ the package is unchanged.
    const hasLottie = assetIndex.some((e) => e.kind === 'lottie');
    const includePlayer = hasLottie && this.#cgJsLottie !== undefined;
    if (includePlayer) {
      assetsMap.set('cg-lottie.js', new TextEncoder().encode(this.#cgJsLottie as string));
    }

    this.progress.emit({ step: 'template', progress: 0.6 });
    const indexHtml = buildIndexHtml(scene, assetIndex, fontIndex, includePlayer);

    const nowIso = new Date().toISOString();
    this.progress.emit({ step: 'pack', progress: 0.8 });
    const vcg = await pack({
      scene,
      manifestExtras: {
        id: scene.id,
        name: scene.name,
        authoring: {
          designerVersion: '0.0.0',
          createdAt: scene.metadata.createdAt,
          exportedAt: nowIso,
          ...(scene.metadata.author !== undefined ? { author: scene.metadata.author } : {}),
        },
        compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
        fontDeps: scene.fonts,
        // Fonts join the asset index so a host re-rendering the package resolves a
        // face BY ASSET ID — the lookup the Runtime's re-render already performs.
        // Bytes without an index entry would render a standalone package but still
        // mis-measure on air, which is the whole bug.
        assetIndex: [...assetIndex, ...fontIndex],
      },
      indexHtml,
      cgJs: this.#cgJs,
      cgCss: this.#cgCss,
      assets: assetsMap,
      fonts: fontsMap,
    });

    this.progress.emit({ step: 'sign', progress: 0.95 });
    return { vcg, sha256: sha256Hex(vcg), defaultFilename: downloadName('', scene.name) };
  }

  /**
   * Run the full pipeline and trigger a browser download of the `.vcg`.
   * `outputPath`'s basename becomes the download filename.
   */
  async run(
    scene: Scene,
    outputPath: string,
  ): Promise<{ path: string; sha256: string; bytes: number }> {
    const { vcg, sha256 } = await this.produce(scene);
    const filename = downloadName(outputPath, scene.name);
    triggerDownload(vcg, filename);
    this.progress.emit({ step: 'done', progress: 1 });
    return { path: filename, sha256, bytes: vcg.byteLength };
  }

  async #gatherBinaries(
    scene: Scene,
  ): Promise<{ assetsMap: Map<string, Uint8Array>; assetIndex: AssetEntry[] }> {
    const assetsMap = new Map<string, Uint8Array>();
    const assetIndex: AssetEntry[] = [];
    const seen = new Set<string>();
    // D-062 — every image element, recursing compositions/containers (was
    // top-level layers only), resolved through the shared source-aware seam.
    // D-040 — each image resolves from its source-indicated store first (shared
    // library for a logo) and the other store as a fallback.
    for (const { assetId, source } of collectImageElements(scene)) {
      if (seen.has(assetId)) continue;
      seen.add(assetId);
      const imageSource = compositeImageSource(source, this.#sharedImages, this.#assets);
      const resolved = await resolveImageAsset(imageSource, assetId);
      if (resolved === null) continue;
      const { meta, bytes } = resolved;
      const ext = meta.filename.slice(meta.filename.lastIndexOf('.'));
      const relativePath = `assets/${meta.kind}/${meta.sha256}${ext}`;
      assetsMap.set(relativePath, bytes);
      assetIndex.push({
        id: meta.assetId,
        path: relativePath,
        kind: meta.kind,
        bytes: bytes.byteLength,
        sha256: meta.sha256,
        mime: mimeFor(ext),
      });
    }
    // D-125 — pack each Lottie element's JSON as `assets/lottie/<sha>.json` bytes +
    // an index entry (kind 'lottie'), mirroring images. The index.html boot resolves
    // these into the `lottieAssets` map (a same-origin fetch under the .vcg's 'self'
    // CSP — not an external request). A missing asset is skipped (preflight covers it).
    for (const { assetId } of collectLottieElements(scene)) {
      if (seen.has(assetId)) continue;
      seen.add(assetId);
      const meta = await this.#assets.get(assetId);
      if (meta === null) continue;
      const bytes = await this.#assets.bytes(assetId);
      if (bytes === null) continue;
      const ext = meta.filename.slice(meta.filename.lastIndexOf('.')) || '.json';
      const relativePath = `assets/lottie/${meta.sha256}${ext}`;
      assetsMap.set(relativePath, bytes);
      assetIndex.push({
        id: meta.assetId,
        path: relativePath,
        kind: 'lottie',
        bytes: bytes.byteLength,
        sha256: meta.sha256,
        mime: mimeFor(ext),
      });
    }
    return { assetsMap, assetIndex };
  }

  /**
   * D-121 — resolve the bytes of every font the scene declares that we can legally
   * and physically ship, and key them into the packer's `fonts` map.
   *
   * "Can ship" means an operator-imported / starter-seeded font, which the scene
   * expresses as `family: 'asset-<assetId>'` — the same convention the single-file
   * exporter has always resolved by. A `system` (licensed/OS-installed) face has no
   * shippable bytes, and an `asset-*` font whose asset was deleted has none either:
   * both are SKIPPED, never fatal — an export must not fail because the author
   * picked Arial. Preflight names each skipped font instead.
   */
  async #gatherFonts(
    scene: Scene,
  ): Promise<{ fontsMap: Map<string, Uint8Array>; fontIndex: AssetEntry[] }> {
    const fontsMap = new Map<string, Uint8Array>();
    const fontIndex: AssetEntry[] = [];
    const seen = new Set<string>();
    for (const font of scene.fonts) {
      const assetId = assetIdOfFamily(font.family);
      if (assetId === null || seen.has(assetId)) continue;
      seen.add(assetId);
      const meta = await this.#assets.get(assetId);
      if (meta === null) continue;
      const bytes = await this.#assets.bytes(assetId);
      if (bytes === null) continue;
      const ext = meta.filename.slice(meta.filename.lastIndexOf('.'));
      // Content-addressed, mirroring D-062's `assets/<kind>/<sha><ext>`: re-exporting
      // is deterministic, and a face shared by two families is stored once.
      const relativePath = `fonts/${meta.sha256}${ext}`;
      fontsMap.set(relativePath, bytes);
      fontIndex.push({
        id: meta.assetId,
        path: relativePath,
        kind: 'font',
        bytes: bytes.byteLength,
        sha256: meta.sha256,
        mime: mimeFor(ext),
      });
    }
    return { fontsMap, fontIndex };
  }
}

/**
 * The `asset-<assetId>` family convention — the ONLY way a scene names a font whose
 * bytes we hold. (`FontReference.source`/`bundledPath` are not the mechanism: no code
 * has ever dereferenced `bundledPath`, and the starters set it to a family label.)
 */
function assetIdOfFamily(family: string): string | null {
  const prefix = 'asset-';
  return family.startsWith(prefix) ? family.slice(prefix.length) : null;
}

/** An `asset-*` family whose asset is actually present → we can ship its bytes. */
function bundleableAssetId(family: string, knownAssetIds: ReadonlySet<string>): string | null {
  const assetId = assetIdOfFamily(family);
  return assetId !== null && knownAssetIds.has(assetId) ? assetId : null;
}

/**
 * Faces the RUNTIME app bundles itself (`apps/runtime/public/fonts`) and base64-inlines
 * from its own `fonts.css` when it imports a package. They are present on air without
 * riding in the `.vcg`, so a ticker using one measures real glyphs and needs no warning.
 */
const RUNTIME_SELF_HOSTED_FAMILIES: ReadonlySet<string> = new Set(['Vazirmatn', 'Exo 2']);

/** The `@font-face` `format(…)` hint matching a packaged font's extension. */
function fontFormatFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.woff2':
      return 'woff2';
    case '.woff':
      return 'woff';
    case '.ttf':
      return 'truetype';
    case '.otf':
      return 'opentype';
    default:
      return 'woff2';
  }
}

function downloadName(outputPath: string, sceneName: string): string {
  const base = outputPath.split(/[\\/]/).pop() ?? '';
  const name = base.length > 0 ? base : `${sceneName || 'template'}.vcg`;
  return name.endsWith('.vcg') ? name : `${name}.vcg`;
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

function buildIndexHtml(
  scene: Scene,
  assetIndex: AssetEntry[],
  fontIndex: AssetEntry[],
  includePlayer: boolean,
): string {
  // D-062 — bake the image assetId → packaged relative path map so the served
  // runtime sets each `<img>` src to its packaged bytes (no external/file:// ref;
  // the .vcg is http-served, so a relative path resolves to the bundled file).
  // Escape `<` for safety though sha-based paths never contain it.
  // D-125 — the Lottie JSON assets are resolved separately (fetched + parsed into
  // `lottieAssets`), so exclude them from the `<img>` src map.
  const assetUrls = Object.fromEntries(
    assetIndex.filter((e) => e.kind !== 'lottie').map((e) => [e.id, e.path]),
  );
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, '\\u003c');
  // D-125 — Lottie assetId → packaged JSON path; the boot fetches + parses each into
  // the `lottieAssets` map (a SAME-ORIGIN fetch under the .vcg's strict 'self' CSP —
  // not an external request). `includePlayer` gates the `cg-lottie.js` import.
  const lottiePaths = Object.fromEntries(
    assetIndex.filter((e) => e.kind === 'lottie').map((e) => [e.id, e.path]),
  );
  const lottiePathsJson = JSON.stringify(lottiePaths).replace(/</g, '\\u003c');
  const playerImport = includePlayer ? "      import './cg-lottie.js';\n" : '';
  // D-121 — declare each packaged font PACKAGE-RELATIVE, so an unzipped-and-served
  // `.vcg` renders with the real face and issues no external / `file://` request
  // (it has to run under CasparCG's CEF). The family is the `asset-<id>` name the
  // scene's elements already reference.
  const fontFaces = fontIndex
    .map((e) => {
      const ext = e.path.slice(e.path.lastIndexOf('.'));
      return `      @font-face { font-family: "asset-${e.id}"; font-display: swap; src: url('./${e.path}') format('${fontFormatFor(ext)}'); }`;
    })
    .join('\n');
  const fontStyle = fontFaces === '' ? '' : `\n    <style>\n${fontFaces}\n    </style>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${String(scene.resolution.width)}, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <link rel="stylesheet" href="./cg.css" />${fontStyle}
  </head>
  <body class="cg-pending">
    <script type="module">
${playerImport}      import { createRuntime, installCasparGlobals } from './cg.js';
      (async () => {
        const res = await fetch('./template.json');
        const scene = await res.json();
        // D-125 — resolve the packaged Lottie JSON into animationData (same-origin
        // fetch; the strict 'self' CSP allows it — no external request).
        const lottiePaths = ${lottiePathsJson};
        const lottieAssets = {};
        for (const id of Object.keys(lottiePaths)) {
          lottieAssets[id] = await (await fetch('./' + lottiePaths[id])).json();
        }
        const runtime = createRuntime(scene, { assetUrls: ${assetUrlsJson}, lottieAssets });
        installCasparGlobals(runtime);
        await runtime.ready;
      })();
    </script>
  </body>
</html>
`;
}

/** D-110 — same anchor ids on both snapshots (order-insensitive)? */
function sameAnchorIdSet(a: readonly AnchorPoint[], b: readonly AnchorPoint[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
}

function fieldHasMeaningfulDefault(field: DynamicField): boolean {
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'color':
      return field.default !== '';
    case 'image':
      return field.defaultAssetId !== undefined && field.defaultAssetId !== '';
    case 'select':
      return field.default !== '' && field.options.some((o) => o.value === field.default);
    case 'number':
    case 'boolean':
      return true;
    case 'list':
      return field.default.length > 0;
  }
}

function isFormatterApplicable(transform: BindingTransform, field: DynamicField): boolean {
  if (transform === 'identity') return true;
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'number':
      return true;
    case 'select':
      return transform === 'uppercase' || transform === 'lowercase' || transform === 'truncate';
    case 'color':
    case 'boolean':
    case 'image':
      return false;
    case 'list':
      // Formatters are string transforms; a list is structured data — items
      // are rendered verbatim by the ticker, so no formatter applies.
      return false;
  }
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

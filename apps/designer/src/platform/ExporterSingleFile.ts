import { playoutOf, type Element, type Scene, type TickerElement } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import {
  buildGddSchema,
  buildPlayoutMetadata,
  type GddSchema,
  type PlayoutMetadata,
} from '@cg/vcg-format';
import type { AssetStore } from './AssetStore.js';
import {
  collectImageElements,
  compositeImageSource,
  imageMimeOf,
  resolveImageAsset,
  type ImageAssetLibrary,
  type ImageRef,
} from './image-export.js';

export interface SingleFileExportOptions {
  /** IIFE runtime bundle (`var CG = …`) — see `cg-runtime.ts` `cgJsIife`. */
  cgJsIife: string;
  /** Minimal broadcast baseline CSS (transparent stage, hide-until-play). */
  cgCss: string;
  /** App `@font-face` CSS (Vazirmatn / Exo 2) with `/fonts/…` URLs to inline. */
  fontsCss: string;
  assets: AssetStore;
  /**
   * D-040 — the device-level shared image library. When present, a logo
   * (`source: 'shared'`) base64-inlines from the library; absent ⇒ project-only.
   */
  sharedImages?: ImageAssetLibrary;
  /** Fetch a same-origin URL's bytes (the bundled font files). Defaults to `fetch`. */
  fetchUrl?: (url: string) => Promise<ArrayBuffer>;
}

export interface SingleFileResult {
  html: string;
  filename: string;
  issues: ExportIssue[];
}

/**
 * D-019 — export a composition as ONE self-contained, `file://`-safe `.html` to
 * drop into CasparCG's `templates/`: scene inlined as a JS literal (no `fetch`),
 * CSS + base64 `@font-face` inlined, the runtime as a classic IIFE (no ES
 * modules — the reason it runs over `file://`), and an embedded GDD schema.
 *
 * Shares the one `@cg/template-runtime` source with the preview and the `.vcg`,
 * so preview behaviour equals on-air behaviour.
 *
 * D-062 — per-project image elements ARE base64-inlined: their bytes resolve to
 * `data:` URIs baked into the `assetUrls` map passed to `createRuntime`, which
 * wires each `<img>` src — so the standalone file renders images offline. An image
 * whose bytes don't resolve is reported as a preflight warning (the HTML export
 * never blocks). Image *fields* (dynamic) are still flagged separately.
 */
export class ExporterSingleFile {
  readonly #cgJsIife: string;
  readonly #cgCss: string;
  readonly #fontsCss: string;
  readonly #assets: AssetStore;
  readonly #sharedImages: ImageAssetLibrary | undefined;
  readonly #fetchUrl: (url: string) => Promise<ArrayBuffer>;

  constructor(options: SingleFileExportOptions) {
    this.#cgJsIife = options.cgJsIife;
    this.#cgCss = options.cgCss;
    this.#fontsCss = options.fontsCss;
    this.#assets = options.assets;
    this.#sharedImages = options.sharedImages;
    this.#fetchUrl = options.fetchUrl ?? ((url) => fetch(url).then((r) => r.arrayBuffer()));
  }

  /** Build the HTML (and any preflight issues) without downloading. */
  async produce(scene: Scene): Promise<SingleFileResult> {
    const issues = preflight(scene);
    const gdd = buildGddSchema(scene);
    const playout = buildPlayoutMetadata(scene);
    const fontCss = await this.#inlineFonts(scene);
    // D-062 — resolve + base64-inline each image element's bytes; an unresolved
    // one is reported (warning — HTML export never blocks), never silently broken.
    const { assetUrls, missing } = await this.#inlineImages(scene);
    for (const ref of missing) {
      issues.push({
        code: 'missing-asset',
        severity: 'warning',
        message: `Image element "${ref.elementId}" references an asset whose bytes could not be resolved; it will not render in the exported HTML.`,
        elementId: ref.elementId,
      });
    }
    const html = buildSingleFileHtml({
      scene,
      gdd,
      playout,
      cgCss: this.#cgCss,
      fontCss,
      cgJsIife: this.#cgJsIife,
      assetUrls,
    });
    return { html, filename: downloadName(scene.name), issues };
  }

  /** Produce + trigger a browser download of the `.html`. */
  async run(scene: Scene): Promise<{ filename: string; bytes: number; issues: ExportIssue[] }> {
    const { html, filename, issues } = await this.produce(scene);
    const bytes = new TextEncoder().encode(html);
    triggerDownload(bytes, filename);
    return { filename, bytes: bytes.byteLength, issues };
  }

  /**
   * Inline every font as base64: the bundled app faces (Vazirmatn / Exo 2) by
   * fetching their `/fonts/…` files and rewriting `url(…)` to data URIs, plus a
   * `@font-face` per operator-imported (`asset-*`) font from the AssetStore.
   */
  async #inlineFonts(scene: Scene): Promise<string> {
    let css = await inlineFontUrls(this.#fontsCss, this.#fetchUrl);
    for (const font of scene.fonts) {
      if (!font.family.startsWith('asset-')) continue;
      const assetId = font.family.slice('asset-'.length);
      const bytes = await this.#assets.bytes(assetId);
      if (bytes === null) continue;
      css += `\n@font-face{font-family:"${font.family}";font-display:swap;src:url(${toDataUri('font/woff2', bytes)}) format("woff2")}`;
    }
    return css;
  }

  /**
   * D-062 — base64-inline every image element's bytes as a `data:` URI, mirroring
   * `#inlineFonts`. Returns the `assetId → dataUri` map (baked into `assetUrls` for
   * `createRuntime`) plus the image elements whose bytes did not resolve (reported
   * as preflight warnings by `produce`). Resolution goes through the shared
   * source-aware seam (`resolveImageAsset`) so D-040/PR-2 adds the shared library.
   */
  async #inlineImages(scene: Scene): Promise<{
    assetUrls: Record<string, string>;
    missing: ImageRef[];
  }> {
    const assetUrls: Record<string, string> = {};
    const failed = new Set<string>();
    const missing: ImageRef[] = [];
    for (const ref of collectImageElements(scene)) {
      if (assetUrls[ref.assetId] !== undefined) continue; // asset already inlined
      if (failed.has(ref.assetId)) {
        missing.push(ref);
        continue;
      }
      // D-040 — resolve from the logo's source-indicated store first, the other
      // store as a fallback.
      const imageSource = compositeImageSource(ref.source, this.#sharedImages, this.#assets);
      const resolved = await resolveImageAsset(imageSource, ref.assetId);
      if (resolved === null) {
        failed.add(ref.assetId);
        missing.push(ref);
        continue;
      }
      assetUrls[ref.assetId] = toDataUri(imageMimeOf(resolved.meta.filename), resolved.bytes);
    }
    return { assetUrls, missing };
  }
}

/** Preflight: warn (don't block) for cases a third-party GDD client can't honour. */
function preflight(scene: Scene): ExportIssue[] {
  const issues: ExportIssue[] = [];
  for (const field of scene.fields) {
    if (field.type === 'image') {
      issues.push({
        code: 'gdd-image-field-not-portable',
        severity: 'warning',
        message: `Image field "${field.id}" exports as a string id; a third-party GDD client can't resolve the project's assets.`,
        fieldId: field.id,
      });
    }
    if (field.type === 'list') {
      // D-028 — GDD v1 has no array gddType, so the list exports as a plain
      // typed array; third-party clients may not render an editor for it, and
      // list values travel as JSON only (the legacy CasparCG XML template-data
      // payload can't carry an array).
      issues.push({
        code: 'gdd-list-field-limited-clients',
        severity: 'warning',
        message: `List field "${field.id}" exports as a plain GDD array (no array gddType exists); third-party GDD clients may not offer an items editor, and values must be sent as JSON (not CasparCG XML).`,
        fieldId: field.id,
      });
    }
  }

  // D-028 — a TIMED hold with a FINITE ticker is authored intent, but worth a
  // heads-up: the crawl drains after its passes and the band sits empty until
  // the timer ends the hold.
  const docs: { layers: Scene['layers']; playout?: Scene['playout'] }[] = [
    scene,
    ...(scene.compositions ?? []),
  ];
  for (const doc of docs) {
    const playout = playoutOf(doc);
    if (playout.mode === 'manual' || playout.holdSource === 'content-driven') continue;
    const finiteTicker = findFiniteTicker(doc.layers);
    if (finiteTicker !== null) {
      issues.push({
        code: 'ticker-finite-with-timed-hold',
        severity: 'info',
        message: `Ticker "${finiteTicker.name || finiteTicker.id}" runs ${String(finiteTicker.repeat)} pass(es) under a TIMED hold — after its passes the band sits empty until the timer ends the hold. Use a content-driven hold to exit when the crawl completes.`,
        elementId: finiteTicker.id,
      });
    }
  }
  return issues;
}

/** The first finite-repeat ticker in a doc's layers (recursing containers). */
function findFiniteTicker(layers: Scene['layers']): TickerElement | null {
  const walk = (children: readonly Element[]): TickerElement | null => {
    for (const el of children) {
      if (el.type === 'ticker' && el.repeat !== 'infinite') return el;
      if (el.type === 'container') {
        const found = walk(el.children);
        if (found !== null) return found;
      }
    }
    return null;
  };
  for (const layer of layers) {
    const found = walk(layer.children);
    if (found !== null) return found;
  }
  return null;
}

interface HtmlParts {
  scene: Scene;
  gdd: GddSchema;
  playout: PlayoutMetadata;
  cgCss: string;
  fontCss: string;
  cgJsIife: string;
  /** D-062 — image `assetId` → base64 `data:` URI, baked for `createRuntime`. */
  assetUrls: Record<string, string>;
}

function buildSingleFileHtml(parts: HtmlParts): string {
  const { scene, gdd, playout, cgCss, fontCss, cgJsIife, assetUrls } = parts;
  // Escape `</` so scene text / GDD strings can't close the <script>/<style>.
  const sceneLiteral = JSON.stringify(scene).replace(/</g, '\\u003c');
  const gddJson = JSON.stringify(gdd).replace(/</g, '\\u003c');
  const playoutJson = JSON.stringify(playout).replace(/</g, '\\u003c');
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, '\\u003c');
  const w = String(scene.resolution.width);
  const h = String(scene.resolution.height);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${w}, initial-scale=1" />
    <!-- Permissive CSP: a single self-contained file needs inline script/style
         and data: fonts. The .vcg keeps a strict 'self' CSP (it's http-served);
         this file is loaded over file:// by CasparCG, where that would block
         everything inlined. -->
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:;" />
    <title>${escapeHtml(scene.name)}</title>
    <!-- CEF-compat: keep CSS within common CasparCG builds (CEF 63=2.2,
         71=2.3.x, 117=2.4.x) — avoid bleeding-edge properties. -->
    <style>${fontCss}</style>
    <style>${cgCss}
html,body{width:${w}px;height:${h}px;background:transparent;overflow:hidden}</style>
    <script name="graphics-data-definition" type="application/json+gdd">
${gddJson}
    </script>
    <!-- D-020 — lifecycle phases + playout timing + outro duration (ms) for a
         control layer to schedule precise timed auto-out / looped playout. -->
    <script name="cg-playout" type="application/json">
${playoutJson}
    </script>
  </head>
  <body class="cg-pending">
    <script>${cgJsIife}</script>
    <script>
      (function () {
        var scene = ${sceneLiteral};
        var runtime = CG.createRuntime(scene, { assetUrls: ${assetUrlsJson} });
        CG.installCasparGlobals(runtime);
        // No auto-play — the operator / AMCP drives play(). Mark readiness for
        // hosts that poll for it.
        if (runtime.ready && runtime.ready.then) {
          runtime.ready.then(function () { document.documentElement.setAttribute('data-cg-ready', '1'); });
        }
      })();
    </script>
  </body>
</html>
`;
}

/** Rewrite every `url('/fonts/…')` in the CSS to a base64 data URI. */
async function inlineFontUrls(
  css: string,
  fetchUrl: (url: string) => Promise<ArrayBuffer>,
): Promise<string> {
  const urlRe = /url\(\s*['"]?(\/fonts\/[^'")]+)['"]?\s*\)/g;
  const urls = new Set<string>();
  for (const m of css.matchAll(urlRe)) if (m[1] !== undefined) urls.add(m[1]);
  const dataUris = new Map<string, string>();
  for (const url of urls) {
    try {
      const buf = await fetchUrl(url);
      dataUris.set(url, toDataUri('font/woff2', new Uint8Array(buf)));
    } catch {
      /* leave the original URL if a font can't be fetched — better than failing the whole export */
    }
  }
  return css.replace(urlRe, (whole, url: string) => {
    const data = dataUris.get(url);
    return data !== undefined ? `url(${data})` : whole;
  });
}

function toDataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadName(sceneName: string): string {
  const slug = (sceneName || 'template')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'template'}.html`;
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice()], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

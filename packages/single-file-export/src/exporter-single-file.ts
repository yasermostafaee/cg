import {
  playoutOf,
  withoutEditorBackdrop,
  type Element,
  type Scene,
  type TickerElement,
} from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import {
  buildGddSchema,
  buildPlayoutMetadata,
  type GddSchema,
  type PlayoutMetadata,
} from '@cg/vcg-format';
import {
  collectImageElements,
  compositeImageSource,
  imageMimeOf,
  resolveImageAsset,
  type ImageAssetLibrary,
  type ImageAssetSource,
  type ImageRef,
} from './image-export.js';
import { collectLottieElements, resolveLottieAsset, type LottieRef } from './lottie-export.js';
import {
  collectVideoElements,
  resolveVideoAsset,
  videoMimeOf,
  type VideoRef,
} from './video-export.js';

export interface SingleFileExportOptions {
  /** IIFE runtime bundle (`var CG = …`) — see `cg-runtime.ts` `cgJsIife`. */
  cgJsIife: string;
  /**
   * D-125 §D5(c) — the SEPARATE minified `lottie_light` player IIFE bundle
   * (`cgJsLottieIife`), installing `globalThis.__cgLottie`. APPENDED before the
   * runtime script ONLY when the scene contains a Lottie element, so a no-Lottie
   * export never carries the ~168 KB player. Absent ⇒ a Lottie element is reported
   * as a preflight warning (it won't render) rather than throwing.
   */
  cgJsLottieIife?: string;
  /** Minimal broadcast baseline CSS (transparent stage, hide-until-play). */
  cgCss: string;
  /** App `@font-face` CSS (Vazirmatn / Exo 2) with `/fonts/…` URLs to inline. */
  fontsCss: string;
  /**
   * Image-byte source for inlining (project `AssetStore` satisfies it
   * structurally — `get` + `bytes`).
   */
  assets: ImageAssetSource;
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
  readonly #cgJsLottieIife: string | undefined;
  readonly #cgCss: string;
  readonly #fontsCss: string;
  readonly #assets: ImageAssetSource;
  readonly #sharedImages: ImageAssetLibrary | undefined;
  readonly #fetchUrl: (url: string) => Promise<ArrayBuffer>;

  constructor(options: SingleFileExportOptions) {
    this.#cgJsIife = options.cgJsIife;
    this.#cgJsLottieIife = options.cgJsLottieIife;
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
    // D-128 Phase 5 — resolve + base64-inline each video element's STORED WebM
    // bytes into the same `assetUrls` map (`data:video/webm;base64,…`), exactly
    // like images: the runtime's asset-src walk sets `<video src>` from it, so
    // the standalone file plays with ZERO external requests under CEF `file://`.
    // The bytes are the canonical converted form, never re-encoded here. An
    // unresolved video is a warning on this never-blocking path — the Designer's
    // live preflight (Exporter.preflight) raises the ERROR-severity issue.
    const { missing: missingVideo } = await this.#inlineVideos(scene, assetUrls);
    for (const ref of missingVideo) {
      issues.push({
        code: 'missing-asset',
        severity: 'warning',
        message: `Video element "${ref.elementId}" references an asset whose bytes could not be resolved; it will not render in the exported HTML.`,
        elementId: ref.elementId,
      });
    }
    // D-125 — resolve + inline each Lottie element's JSON (as parsed `animationData`
    // in the `lottieAssets` map, baked into the boot script). An unresolved / corrupt
    // asset, or a missing player bundle, is a warning — never a thrown export.
    const { lottieAssets, missing: missingLottie } = await this.#inlineLottie(scene);
    for (const ref of missingLottie) {
      issues.push({
        code: 'missing-asset',
        severity: 'warning',
        message: `Lottie element "${ref.elementId}" references an asset whose JSON could not be resolved; it will not render in the exported HTML.`,
        elementId: ref.elementId,
      });
    }
    const hasLottie = Object.keys(lottieAssets).length > 0;
    if (hasLottie && this.#cgJsLottieIife === undefined) {
      issues.push({
        code: 'missing-asset',
        severity: 'warning',
        message:
          'Scene contains a Lottie element but no player bundle was provided (cgJsLottieIife); Lottie elements will not render in the exported HTML.',
      });
    }
    const html = buildSingleFileHtml({
      scene,
      gdd,
      playout,
      cgCss: this.#cgCss,
      fontCss,
      cgJsIife: this.#cgJsIife,
      // Only ship the player bundle when the scene actually uses a Lottie (§D5(c)).
      cgJsLottieIife: hasLottie ? this.#cgJsLottieIife : undefined,
      assetUrls,
      lottieAssets,
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

  /**
   * D-128 Phase 5 — base64-inline every video element's stored bytes as a
   * `data:video/webm` URI INTO the shared `assetUrls` map (mutated in place so
   * images and videos ride the one map `createRuntime` already takes). Mirrors
   * `#inlineImages`; videos resolve from the project store only.
   */
  async #inlineVideos(
    scene: Scene,
    assetUrls: Record<string, string>,
  ): Promise<{ missing: VideoRef[] }> {
    const failed = new Set<string>();
    const missing: VideoRef[] = [];
    for (const ref of collectVideoElements(scene)) {
      if (assetUrls[ref.assetId] !== undefined) continue; // asset already inlined
      if (failed.has(ref.assetId)) {
        missing.push(ref);
        continue;
      }
      const resolved = await resolveVideoAsset(this.#assets, ref.assetId);
      if (resolved === null) {
        failed.add(ref.assetId);
        missing.push(ref);
        continue;
      }
      assetUrls[ref.assetId] = toDataUri(videoMimeOf(resolved.meta.filename), resolved.bytes);
    }
    return { missing };
  }

  /**
   * D-125 — resolve each Lottie element's JSON into the `assetId → animationData`
   * map baked into `createRuntime` (inlined as a JS literal in the boot script — no
   * fetch, so it runs under CEF from `file://`). Mirrors `#inlineImages`. An
   * unresolved / corrupt asset is reported (warning) via `missing`. Resolution goes
   * through the project asset source (`#assets` satisfies `LottieAssetSource`).
   */
  async #inlineLottie(scene: Scene): Promise<{
    lottieAssets: Record<string, unknown>;
    missing: LottieRef[];
  }> {
    const lottieAssets: Record<string, unknown> = {};
    const failed = new Set<string>();
    const missing: LottieRef[] = [];
    for (const ref of collectLottieElements(scene)) {
      if (lottieAssets[ref.assetId] !== undefined) continue; // asset already inlined
      if (failed.has(ref.assetId)) {
        missing.push(ref);
        continue;
      }
      const resolved = await resolveLottieAsset(this.#assets, ref.assetId);
      if (resolved === null) {
        failed.add(ref.assetId);
        missing.push(ref);
        continue;
      }
      lottieAssets[ref.assetId] = resolved.animationData;
    }
    return { lottieAssets, missing };
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

/** The first VISIBLE finite-repeat ticker in a doc's layers (recursing containers). */
function findFiniteTicker(layers: Scene['layers']): TickerElement | null {
  const walk = (children: readonly Element[]): TickerElement | null => {
    for (const el of children) {
      // B-034 — a HIDDEN ticker (`visible: false`) is fully inert (not rendered, never a hold
      // driver), so it must not raise the finite-ticker-under-timed-hold export diagnostic either.
      if (el.type === 'ticker' && el.repeat !== 'infinite' && el.visible !== false) return el;
      // B-034 — a HIDDEN container's whole subtree is inert: don't descend (mirrors render), so a
      // finite ticker inside a hidden container raises no preflight either.
      if (el.type === 'container' && el.visible !== false) {
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
  /**
   * D-125 §D5(c) — the minified player bundle, present ONLY when the scene uses a
   * Lottie (and a player was provided). Emitted as a `<script>` BEFORE the runtime
   * so `globalThis.__cgLottie` is installed before `createRuntime` mounts.
   */
  cgJsLottieIife: string | undefined;
  /** D-062 — image `assetId` → base64 `data:` URI, baked for `createRuntime`. */
  assetUrls: Record<string, string>;
  /** D-125 — Lottie `assetId` → parsed `animationData`, baked for `createRuntime`. */
  lottieAssets: Record<string, unknown>;
}

function buildSingleFileHtml(parts: HtmlParts): string {
  const { scene, gdd, playout, cgCss, fontCss, cgJsIife, cgJsLottieIife, assetUrls, lottieAssets } =
    parts;
  // Escape `</` so scene text / GDD strings can't close the <script>/<style>.
  // B-129 — same rule as the `.vcg` exporter, same ONE helper: the embedded scene
  // carries no editor backdrop, so the artifact cannot paint one even if a renderer
  // forgot the mode check.
  const sceneLiteral = JSON.stringify(withoutEditorBackdrop(scene)).replace(/</g, '\\u003c');
  const gddJson = JSON.stringify(gdd).replace(/</g, '\\u003c');
  const playoutJson = JSON.stringify(playout).replace(/</g, '\\u003c');
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, '\\u003c');
  const lottieAssetsJson = JSON.stringify(lottieAssets).replace(/</g, '\\u003c');
  // The player bundle (installs `__cgLottie`) — a leading `<script>` when present.
  const lottieScript =
    cgJsLottieIife !== undefined ? `<script>${cgJsLottieIife}</script>\n    ` : '';
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
    <!-- D-128 Phase 5 — media-src data: admits the base64-inlined <video> bytes;
         without it the artifact's own CSP would block the video it carries. -->
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; media-src data:;" />
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
    ${lottieScript}<script>${cgJsIife}</script>
    <script>
      (function () {
        var scene = ${sceneLiteral};
        try {
          /* D-137 §9 — 'output': zero painted pixels for a Live Source, and no
             zone rule that could fill its hole. Named, never inferred. */
          var runtime = CG.createRuntime(scene, { mode: 'output', assetUrls: ${assetUrlsJson}, lottieAssets: ${lottieAssetsJson} });
          CG.installCasparGlobals(runtime);
          // R-011 — output-only placement: operator query override (appended by
          // the bridge onto the served URL) ?? scene.defaultPosition ?? centered.
          // This boot script is the ONE page CasparCG loads; the Designer
          // preview never calls applyOutputPosition, so authoring is untouched.
          CG.applyOutputPosition(scene, { search: location.search });
          // No auto-play — the operator / AMCP drives play(). Mark readiness for
          // hosts that poll for it.
          if (runtime.ready && runtime.ready.then) {
            runtime.ready.then(function () { document.documentElement.setAttribute('data-cg-ready', '1'); });
          }
        } catch (e) {
          // B-066 — surface a boot failure ON THE OUTPUT (the fixtures' proven
          // pattern): without this, a boot throw dies silent — a blank page
          // whose only trace is a mystifying "update is not defined" in the
          // CEF log (createRuntime threw before installCasparGlobals could
          // define the CasparCG entrypoints). Positioning boots INSIDE the
          // guard: a mis-placed graphic is still a boot failure, and on air it
          // must be seen, not guessed at.
          var pre = document.createElement('pre');
          pre.style.cssText = 'color:#F87171;background:#000;padding:16px;font:14px monospace;white-space:pre-wrap;';
          pre.textContent = 'cg boot error: ' + (e && e.message ? e.message : String(e));
          document.body.appendChild(pre);
          document.body.classList.remove('cg-pending');
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

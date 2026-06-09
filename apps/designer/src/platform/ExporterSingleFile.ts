import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import {
  buildGddSchema,
  buildPlayoutMetadata,
  type GddSchema,
  type PlayoutMetadata,
} from '@cg/vcg-format';
import type { AssetStore } from './AssetStore.js';

export interface SingleFileExportOptions {
  /** IIFE runtime bundle (`var CG = …`) — see `cg-runtime.ts` `cgJsIife`. */
  cgJsIife: string;
  /** Minimal broadcast baseline CSS (transparent stage, hide-until-play). */
  cgCss: string;
  /** App `@font-face` CSS (Vazirmatn / Exo 2) with `/fonts/…` URLs to inline. */
  fontsCss: string;
  assets: AssetStore;
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
 * so preview behaviour equals on-air behaviour. The existing `.vcg` exporter is
 * untouched (it targets http serving by the project's own Runtime).
 *
 * Scope note: image elements are not yet base64-inlined — the runtime's image
 * resolution is still a stub (static images don't render in the preview/`.vcg`
 * either), so this stays at parity. Image *fields* are flagged in preflight.
 */
export class ExporterSingleFile {
  readonly #cgJsIife: string;
  readonly #cgCss: string;
  readonly #fontsCss: string;
  readonly #assets: AssetStore;
  readonly #fetchUrl: (url: string) => Promise<ArrayBuffer>;

  constructor(options: SingleFileExportOptions) {
    this.#cgJsIife = options.cgJsIife;
    this.#cgCss = options.cgCss;
    this.#fontsCss = options.fontsCss;
    this.#assets = options.assets;
    this.#fetchUrl = options.fetchUrl ?? ((url) => fetch(url).then((r) => r.arrayBuffer()));
  }

  /** Build the HTML (and any preflight issues) without downloading. */
  async produce(scene: Scene): Promise<SingleFileResult> {
    const issues = preflight(scene);
    const gdd = buildGddSchema(scene);
    const playout = buildPlayoutMetadata(scene);
    const fontCss = await this.#inlineFonts(scene);
    const html = buildSingleFileHtml({
      scene,
      gdd,
      playout,
      cgCss: this.#cgCss,
      fontCss,
      cgJsIife: this.#cgJsIife,
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
  }
  return issues;
}

interface HtmlParts {
  scene: Scene;
  gdd: GddSchema;
  playout: PlayoutMetadata;
  cgCss: string;
  fontCss: string;
  cgJsIife: string;
}

function buildSingleFileHtml(parts: HtmlParts): string {
  const { scene, gdd, playout, cgCss, fontCss, cgJsIife } = parts;
  // Escape `</` so scene text / GDD strings can't close the <script>/<style>.
  const sceneLiteral = JSON.stringify(scene).replace(/</g, '\\u003c');
  const gddJson = JSON.stringify(gdd).replace(/</g, '\\u003c');
  const playoutJson = JSON.stringify(playout).replace(/</g, '\\u003c');
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
        var runtime = CG.createRuntime(scene);
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

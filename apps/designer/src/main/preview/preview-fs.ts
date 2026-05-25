import type { Scene } from '@cg/shared-schema';
import type { AssetService } from '../services/AssetService.js';
import * as fs from 'node:fs';

/**
 * Virtual filesystem for `cgpreview://` URLs.
 *
 * For each active scene, the Designer builds a synthetic FS:
 *
 *   cgpreview://<sceneId>/index.html
 *   cgpreview://<sceneId>/cg.js
 *   cgpreview://<sceneId>/cg.css
 *   cgpreview://<sceneId>/template.json
 *   cgpreview://<sceneId>/assets/<kind>/<sha>.<ext>
 *
 * The protocol handler (registered in Electron main) consults this
 * registry to resolve a request URL into bytes + a MIME type. The
 * Designer renderer's preview iframe points at the index.html URL.
 *
 * Sandbox property: paths outside the scene's working set 404. The
 * iframe cannot reach arbitrary disk paths — only the working-dir
 * files we've explicitly opted in for this scene (Phase 4 §5).
 */

export interface PreviewFsEntry {
  contentType: string;
  bytes: Buffer;
}

export interface PreviewFsOptions {
  /** Pre-bundled @cg/template-runtime cg.js content. */
  cgJs: string;
  /** Optional CSS override; falls back to the same default ExportService uses. */
  cgCss?: string;
  /** Asset service the FS reads image bytes from. */
  assets: AssetService;
}

const DEFAULT_CG_CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;color:#FFF;font-family:Inter,Vazirmatn,"Noto Sans Arabic",system-ui,sans-serif}
.cg-pending{opacity:0}`;

/**
 * Per-Designer preview registry. There's at most one active scene at a
 * time in the v1 Designer; we keep a single slot rather than a map.
 */
export class PreviewFs {
  private active: { sceneId: string; scene: Scene } | null = null;
  private readonly cgJs: string;
  private readonly cgCss: string;
  private readonly assets: AssetService;

  constructor(options: PreviewFsOptions) {
    this.cgJs = options.cgJs;
    this.cgCss = options.cgCss ?? DEFAULT_CG_CSS;
    this.assets = options.assets;
  }

  /** Install / replace the active scene. */
  setActive(scene: Scene): void {
    this.active = { sceneId: scene.id, scene };
  }

  /** Clear the active scene — subsequent resolves return null. */
  clear(): void {
    this.active = null;
  }

  /**
   * Resolve a `cgpreview://<sceneId>/<rest>` URL to bytes. Returns null
   * for unknown sceneIds or paths outside the scene's working set.
   */
  async resolve(url: string): Promise<PreviewFsEntry | null> {
    const parsed = parseCgPreviewUrl(url);
    if (parsed === null) return null;
    if (this.active === null || this.active.sceneId !== parsed.sceneId) return null;

    const { rest } = parsed;
    if (rest === 'index.html' || rest === '') {
      return {
        contentType: 'text/html; charset=utf-8',
        bytes: Buffer.from(this.buildIndexHtml(this.active.scene), 'utf-8'),
      };
    }
    if (rest === 'cg.js') {
      return {
        contentType: 'application/javascript; charset=utf-8',
        bytes: Buffer.from(this.cgJs, 'utf-8'),
      };
    }
    if (rest === 'cg.css') {
      return {
        contentType: 'text/css; charset=utf-8',
        bytes: Buffer.from(this.cgCss, 'utf-8'),
      };
    }
    if (rest === 'template.json') {
      return {
        contentType: 'application/json; charset=utf-8',
        bytes: Buffer.from(JSON.stringify(this.active.scene), 'utf-8'),
      };
    }

    // assets/<kind>/<sha256>.<ext> — look up by sha256 prefix.
    const assetMatch = /^assets\/[^/]+\/([0-9a-f]{64})\.[a-z0-9]+$/i.exec(rest);
    if (assetMatch !== null) {
      const sha = assetMatch[1] ?? '';
      const meta = this.assets.list().find((a) => a.sha256 === sha);
      if (meta === null || meta === undefined) return null;
      try {
        const bytes = await fs.promises.readFile(meta.workingPath);
        return { contentType: mimeFor(meta.filename), bytes };
      } catch {
        return null;
      }
    }

    return null;
  }

  get activeSceneId(): string | null {
    return this.active?.sceneId ?? null;
  }

  private buildIndexHtml(scene: Scene): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${String(scene.resolution.width)}, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <link rel="stylesheet" href="./cg.css" />
  </head>
  <body class="cg-pending">
    <script type="module">
      import { createRuntime, installCasparGlobals } from './cg.js';
      (async () => {
        const res = await fetch('./template.json');
        const scene = await res.json();
        const runtime = createRuntime(scene);
        installCasparGlobals(runtime);
        await runtime.ready;
        document.body.classList.remove('cg-pending');
        // Designer preview bridge — accept postMessage commands from the
        // parent window (Designer's Inspector) without going through AMCP.
        window.addEventListener('message', (evt) => {
          const msg = evt.data;
          if (!msg || typeof msg !== 'object' || msg.kind !== 'cg-preview') return;
          if (msg.action === 'update' && typeof window.update === 'function') {
            try { window.update(JSON.stringify(msg.fields ?? {})); } catch (e) { /* swallow */ }
          } else if (msg.action === 'play' && typeof window.play === 'function') {
            try { window.play(JSON.stringify(msg.fields ?? {})); } catch (e) { /* swallow */ }
          } else if (msg.action === 'stop' && typeof window.stop === 'function') {
            try { window.stop(); } catch (e) { /* swallow */ }
          }
        });
        // Signal parent that the preview is ready.
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ kind: 'cg-preview-ready', sceneId: scene.id }, '*');
        }
        // Auto-play so the static render shows the entry animation.
        setTimeout(() => {
          if (typeof window.play === 'function') {
            try { window.play(JSON.stringify({})); } catch (e) { /* swallow */ }
          }
        }, 100);
      })();
    </script>
  </body>
</html>
`;
  }
}

export interface ParsedCgPreviewUrl {
  sceneId: string;
  rest: string;
}

/**
 * Parse a `cgpreview://<sceneId>/<rest>` URL into its components. Returns
 * null for malformed input (wrong scheme, no host, etc.).
 */
export function parseCgPreviewUrl(url: string): ParsedCgPreviewUrl | null {
  // Strip query string + fragment before matching — the CanvasArea
  // cache-busts the iframe src with `?t=<epoch>` to force a re-fetch,
  // and that query string used to leak into `rest` and break the
  // path-equality checks below.
  const beforeQuery = url.split(/[?#]/, 1)[0] ?? url;
  const match = /^cgpreview:\/\/([^/]+)(?:\/(.*))?$/i.exec(beforeQuery);
  if (match === null) return null;
  const sceneId = match[1] ?? '';
  if (sceneId === '') return null;
  return { sceneId, rest: match[2] ?? '' };
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

function mimeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
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
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

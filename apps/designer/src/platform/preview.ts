import type { Scene } from '@cg/shared-schema';

export interface PreviewOptions {
  cgJs: string;
  cgCss: string;
  /**
   * The app's bundled @font-face CSS (Vazirmatn / Exo 2). Injected into the
   * preview document so built-in fonts render on the canvas — without it the
   * iframe only has the operator-imported (`asset-*`) faces and built-in fonts
   * fall back to a system face. Optional so existing callers/tests still build.
   */
  fontsCss?: string;
}

/**
 * Browser port of the Electron cgpreview:// protocol + PreviewFs. Instead of
 * a custom protocol, the preview is a self-contained HTML document served
 * from a Blob URL. The document imports the bundled template-runtime from a
 * second Blob URL (kept stable across loads) and inlines the scene JSON, so
 * no relative `fetch()` is needed — Blob documents have an opaque base.
 *
 * Field updates reach the iframe via `postMessage`, mirroring the
 * `cg-preview` bridge the runtime understood in the Electron build.
 */
export class Preview {
  readonly #cgCss: string;
  readonly #fontsCss: string;
  #cgJsUrl: string | null = null;
  #docUrl: string | null = null;

  constructor(options: PreviewOptions) {
    this.#cgCss = options.cgCss;
    this.#fontsCss = options.fontsCss ?? '';
    // The runtime bundle never changes during a session — make one Blob URL.
    this.#cgJsUrl = URL.createObjectURL(new Blob([options.cgJs], { type: 'text/javascript' }));
  }

  /**
   * Build a fresh preview document for `scene`. Returns BOTH the HTML
   * (for `iframe srcdoc`, which avoids blob-URL/cross-document quirks)
   * and a Blob URL fallback (still useful for export paths). Callers
   * prefer `html` when they can set it on srcdoc.
   */
  load(scene: Scene): { src: string; html: string } {
    if (this.#docUrl !== null) URL.revokeObjectURL(this.#docUrl);
    const html = this.#buildHtml(scene);
    this.#docUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    return { src: this.#docUrl, html };
  }

  /**
   * Push a live field update to the canvas preview iframe(s). (Transport —
   * play/stop/next/reset — is driven by the Preview modal posting straight to
   * its own dedicated iframe; the iframe message handler understands those
   * actions either way.)
   */
  update(fields: Readonly<Record<string, unknown>>): { ok: boolean } {
    const frames = document.querySelectorAll<HTMLIFrameElement>('iframe[title="cgpreview"]');
    let delivered = false;
    frames.forEach((frame) => {
      frame.contentWindow?.postMessage({ kind: 'cg-preview', action: 'update', fields }, '*');
      delivered = true;
    });
    return { ok: delivered };
  }

  reload(): { ok: boolean } {
    return { ok: true };
  }

  #buildHtml(scene: Scene): string {
    const cgJsUrl = this.#cgJsUrl ?? '';
    // Escape `<` so scene text containing "</script>" can't break out.
    const sceneJson = JSON.stringify(scene).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${String(scene.resolution.width)}, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <!-- App-bundled fonts (Vazirmatn / Exo 2). The srcdoc iframe is same-origin
         as the host, so these /fonts/… URLs resolve exactly as they do in the
         editor; without this, built-in fonts fall back to a system face. -->
    <style>${this.#fontsCss}</style>
    <style>${this.#cgCss}</style>
    <!--
      Authoring override: the broadcast runtime hides the stage while
      \`body.cg-pending\` is set (.cg-pending{opacity:0} and
      .cg-pending .cg-stage{visibility:hidden}). In the Designer the
      operator must see what they're building before play() is ever
      called, so we lift those rules with !important. The exported
      .vcg keeps the original CSS — this override lives only in the
      preview document.
    -->
    <style>
      .cg-pending { opacity: 1 !important; }
      .cg-pending .cg-stage { visibility: visible !important; }
      /* The 'scene-replace' path calls runtime.remove() then
         createRuntime(newScene). remove() leaves body marked
         cg-removed, which the baseline CSS turns into
         display:none on the new stage. Keep the stage visible
         across that tear-down/rebuild. */
      .cg-removed .cg-stage { display: block !important; }
      /* D-011 — transparency checkerboard inside the preview iframe so
         the operator can see "transparent" as a pattern, not as a flat
         colour. Authoring-only: the exported .vcg uses the baseline
         cgCss (html,body { background: transparent }) without this. */
      html, body {
        background-color: #3d4253 !important;
        background-image:
          linear-gradient(45deg, #5b6075 25%, transparent 25%),
          linear-gradient(-45deg, #5b6075 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #5b6075 75%),
          linear-gradient(-45deg, transparent 75%, #5b6075 75%) !important;
        background-size: 48px 48px !important;
        background-position: 0 0, 0 24px, 24px -24px, -24px 0 !important;
      }
    </style>
  </head>
  <body>
    <script>
      // Surface uncaught preview-side errors up to the parent console.
      // Without this, a throw inside the runtime would only land in the
      // (invisible) iframe console — exactly the silent failure that
      // hid the blob-URL module-import bug for the better part of a
      // session.
      (function () {
        function post(label, payload) {
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(
                { kind: 'cg-preview-error', label: label, payload: String(payload) },
                '*',
              );
            }
          } catch (e) {}
        }
        window.addEventListener('error', function (e) {
          post('window.error', (e && e.message) + ' @ ' + (e && e.filename) + ':' + (e && e.lineno));
        });
        window.addEventListener('unhandledrejection', function (e) {
          post('unhandledrejection', (e && (e.reason && (e.reason.message || e.reason))) || '?');
        });
      })();
    </script>
    <script type="module">
      import { createRuntime, installCasparGlobals } from '${cgJsUrl}';
      (async () => {
        // Mutable bookkeeping — the iframe document stays alive across
        // edits; only the runtime (its DOM tree) is rebuilt by
        // applyScene(). This avoids reloading the whole HTML on every
        // drag tick, which was causing the "screen flashing" the
        // operator reported.
        let runtime = null;
        let currentFields = {};
        let currentFrame = 0;
        let busy = false;
        let pendingScene = null;
        // D-011 — assetId → blob URL map, posted by the host. After
        // every scene rebuild we walk the iframe DOM and assign src
        // for every <img data-cg-asset-id="…">.
        let assetUrls = {};
        let currentScene = null;
        let editingTextId = null;
        // D-020 — non-persistent playout override (mode / holdMs / repeat).
        // Set by 'scene-replace' so the preview can test timing without touching
        // the stored template; passed straight to createRuntime on every rebuild.
        let playoutOverride = undefined;
        // D-026 — PER-SCOPE overrides keyed by instance-name path ('' = root). Lets
        // the preview time each nested child independently (session-only).
        let scopeOverrides = undefined;
        // Families we've already loaded into this iframe's
        // document.fonts. Keyed by family name; the value is the
        // assetUrl we loaded from, so we can re-fetch when a font
        // asset's URL changes (e.g. project switch revokes the blob).
        const loadedFonts = new Map();
        let fontLoadSeq = 0;

        function applyAssetUrls() {
          const nodes = document.querySelectorAll('[data-cg-asset-id]');
          nodes.forEach((node) => {
            const id = node.dataset && node.dataset.cgAssetId;
            if (!id) return;
            const url = assetUrls[id];
            if (url && node.tagName === 'IMG' && node.src !== url) {
              node.src = url;
            }
          });
        }

        // Fetch the parent's blob URL, hand the bytes to a FontFace
        // built inside the iframe document, then add it to that
        // document.fonts set. Going through ArrayBuffer (instead of
        // src: url(blob:…) in CSS, or FontFace(url) directly) bypasses
        // every subtle restriction Chromium applies to cross-document
        // blob URLs in srcDoc iframes — the parent's URL only has to
        // survive a fetch, and from then on the font lives inside the
        // iframe. Each call processes families that don't yet have a
        // loaded face (or whose URL has changed).
        async function applyFontFaces() {
          if (!currentScene || !Array.isArray(currentScene.fonts)) return;
          const mySeq = ++fontLoadSeq;
          for (const font of currentScene.fonts) {
            if (typeof font.family !== 'string' || font.family.indexOf('asset-') !== 0) continue;
            const assetId = font.family.slice('asset-'.length);
            const url = assetUrls[assetId];
            if (!url) continue;
            if (loadedFonts.get(font.family) === url) continue;
            try {
              const buffer = await (await fetch(url)).arrayBuffer();
              // Another, newer applyFontFaces call may have superseded
              // us while we were fetching; bail before adding stale
              // faces.
              if (mySeq !== fontLoadSeq) return;
              const face = new FontFace(font.family, buffer);
              await face.load();
              document.fonts.add(face);
              loadedFonts.set(font.family, url);
            } catch (err) {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage(
                  {
                    kind: 'cg-preview-error',
                    label: 'font.load',
                    payload: font.family + ': ' + (err && err.message ? err.message : String(err)),
                  },
                  '*',
                );
              }
            }
          }
        }

        function applyEditingHide() {
          // Restore anything we previously hid.
          document.querySelectorAll('[data-cg-editing-hidden="1"]').forEach((node) => {
            node.style.visibility = '';
            delete node.dataset.cgEditingHidden;
          });
          if (!editingTextId) return;
          const target = document.querySelector(
            '[data-cg-element-id="' + cssEscape(editingTextId) + '"]',
          );
          if (target) {
            target.style.visibility = 'hidden';
            target.dataset.cgEditingHidden = '1';
          }
        }

        function cssEscape(s) {
          if (window.CSS && CSS.escape) return CSS.escape(s);
          return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\\\' + c);
        }

        async function applyScene(scene) {
          if (busy) {
            // Coalesce: only keep the latest pending scene; drop the
            // intermediate ones (a 60 Hz drag would otherwise queue
            // dozens of rebuilds).
            pendingScene = scene;
            return;
          }
          busy = true;
          try {
            currentScene = scene;
            if (runtime) runtime.remove();
            // remove() leaves body.cg-removed / pending state; clear
            // both so the next createRuntime starts clean.
            document.body.classList.remove('cg-removed');
            document.body.classList.remove('cg-pending');
            // D-028 — operator (asset-*) faces load BEFORE the runtime exists,
            // so runtime.ready (document.fonts.ready) and the ticker's
            // first-pass width measurement see final glyphs. Failures degrade
            // gracefully (applyFontFaces posts cg-preview-error itself) — a
            // broken font must not brick the preview.
            await applyFontFaces().catch(() => {});
            runtime = createRuntime(scene, {
              playoutOverride: playoutOverride,
              scopeOverrides: scopeOverrides,
            });
            installCasparGlobals(runtime);
            await runtime.ready;
            document.body.classList.remove('cg-pending');
            await runtime.update(currentFields);
            runtime.tick(currentFrame);
            applyAssetUrls();
            applyEditingHide();
          } finally {
            busy = false;
          }
          if (pendingScene !== null) {
            const next = pendingScene;
            pendingScene = null;
            await applyScene(next);
          }
        }

        await applyScene(${sceneJson});

        window.addEventListener('message', (evt) => {
          const msg = evt.data;
          if (!msg || typeof msg !== 'object' || msg.kind !== 'cg-preview') return;
          (async () => {
            try {
              if (msg.action === 'scene-replace' && msg.scene) {
                if (msg.assetUrls && typeof msg.assetUrls === 'object') {
                  assetUrls = msg.assetUrls;
                }
                if (typeof msg.editingTextId === 'string' || msg.editingTextId === null) {
                  editingTextId = msg.editingTextId;
                }
                // D-020 — session-only timing override travels with the scene so
                // the rebuilt runtime applies it (undefined ⇒ stored defaults).
                playoutOverride =
                  msg.playoutOverride && typeof msg.playoutOverride === 'object'
                    ? msg.playoutOverride
                    : undefined;
                // D-026 — per-scope overrides (path → {mode/holdMs/repeat}).
                scopeOverrides =
                  msg.scopeOverrides && typeof msg.scopeOverrides === 'object'
                    ? msg.scopeOverrides
                    : undefined;
                await applyScene(msg.scene);
              } else if (msg.action === 'asset-urls' && msg.assetUrls) {
                assetUrls = msg.assetUrls;
                applyAssetUrls();
                applyFontFaces().catch(() => {});
              } else if (msg.action === 'editing-text') {
                editingTextId = typeof msg.elementId === 'string' ? msg.elementId : null;
                applyEditingHide();
              } else if (msg.action === 'update' && typeof window.update === 'function') {
                currentFields = msg.fields ?? {};
                window.update(JSON.stringify(currentFields));
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'scrub' && typeof msg.frame === 'number') {
                currentFrame = msg.frame;
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'play' && typeof window.play === 'function') {
                currentFields = msg.fields ?? {};
                // D-028 — asset fonts may have arrived after the scene build;
                // await them so the first pass a user ever sees measures with
                // final glyphs (no-op when already loaded).
                await applyFontFaces().catch(() => {});
                window.play(JSON.stringify(currentFields));
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'stop' && typeof window.stop === 'function') {
                window.stop();
              } else if (msg.action === 'next' && typeof window.next === 'function') {
                window.next();
              } else if (msg.action === 'pause') {
                // D-020 — freeze the lifecycle (intro / hold countdown / outro).
                if (runtime && typeof runtime.pause === 'function') runtime.pause();
              } else if (msg.action === 'resume') {
                if (runtime && typeof runtime.resume === 'function') runtime.resume();
              } else if (msg.action === 'reset') {
                // Re-seed every field to its declared default. update() merges, so
                // a replace-mode update is what clears omitted keys back to default.
                currentFields = {};
                if (runtime) {
                  runtime.update({}, { mode: 'replace' });
                  runtime.tick(currentFrame);
                }
              }
            } catch (e) {
              /* swallow preview-side errors */
            }
          })();
        });
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { kind: 'cg-preview-ready', sceneId: ${JSON.stringify(scene.id)} },
            '*',
          );
        }
      })();
    </script>
  </body>
</html>`;
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

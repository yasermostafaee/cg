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
   *
   * D-087 — `broadcast` renders like the on-air/export runtime: the stage
   * stays in its native `cg-pending` (blank) state until `play()`, instead of
   * revealing frame 0 on load. The Preview modal sets it (open blank, paint on
   * Play); the editor canvas omits it (`false` — keep the static authoring
   * frame visible for editing).
   *
   * D-071 Phase B — `authoring` turns on the off-frame PASTEBOARD for the CANVAS
   * iframe only: lift `.cg-stage { overflow: hidden }` + a dark margin so off-frame
   * shapes paint beyond the frame (the iframe element size — the pasteboard extent —
   * comes from CanvasArea, with a `device-width` viewport). `frameOffset` (scene px)
   * insets the frame into the symmetric pasteboard, so off-frame content is visible on
   * ALL sides (left/top too); scene (0,0) sits at that offset, matching the canvas
   * overlay. INDEPENDENT of `broadcast` — the modal/export leave it off (native clip,
   * UNCHANGED).
   */
  load(
    scene: Scene,
    broadcast = false,
    authoring = false,
    frameOffset: { x: number; y: number } = { x: 0, y: 0 },
  ): { src: string; html: string } {
    if (this.#docUrl !== null) URL.revokeObjectURL(this.#docUrl);
    const html = this.#buildHtml(scene, broadcast, authoring, frameOffset);
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

  #buildHtml(
    scene: Scene,
    broadcast: boolean,
    authoring: boolean,
    frameOffset: { x: number; y: number },
  ): string {
    const cgJsUrl = this.#cgJsUrl ?? '';
    // Escape `<` so scene text containing "</script>" can't break out.
    const sceneJson = JSON.stringify(scene).replace(/</g, '\\u003c');
    // D-087 — one flag drives both the CSS override and the boot-time reveal.
    // Authoring (canvas): reveal frame 0 on load. Broadcast (Preview modal):
    // keep the runtime's native `cg-pending` (blank) state until play().
    const revealOnLoad = !broadcast;
    const pendingOverrideCss = revealOnLoad
      ? `.cg-pending { opacity: 1 !important; }
      .cg-pending .cg-stage { visibility: visible !important; }`
      : `/* D-087 — broadcast preview: the stage stays blank (cg-pending) until play(). */`;
    // D-071 Phase B — the off-frame PASTEBOARD (CANVAS iframe only). When on, the
    // frame (`.cg-stage`) stays at the iframe top-left with its clip lifted
    // (`overflow: visible`) so off-frame shapes paint into the dark margin, and
    // outlined so the author sees frame (exports) vs pasteboard (won't export). The
    // iframe ELEMENT size is the pasteboard extent (set by CanvasArea) and a
    // `device-width` viewport (below) makes the content fill that changing size with
    // no stretch. The broadcast modal / export omit `authoring` → native clip + the
    // Phase-A filter, UNCHANGED.
    const pasteboard = authoring;
    const w = scene.resolution.width;
    const h = scene.resolution.height;
    // The frame is inset into the symmetric pasteboard by this scene-px offset, so
    // off-frame content paints into the dark margin on every side. scene (0,0) sits
    // here — the canvas overlay measures from the same offset.
    const ox = Math.round(frameOffset.x);
    const oy = Math.round(frameOffset.y);
    const checkerImage =
      `linear-gradient(45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(-45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(45deg, transparent 75%, #5b6075 75%),` +
      `linear-gradient(-45deg, transparent 75%, #5b6075 75%)`;
    const checkerPos = `0 0, 0 24px, 24px -24px, -24px 0`;
    // The authoring frame page reuses the SAME checker as the broadcast modal (darker
    // #5b6075 squares on a #3d4253 page) so the editing surface matches the preview
    // exactly — the prior near-white authoring checker read too bright (operator request).
    const surfaceCss = pasteboard
      ? `/* D-071 Phase B — authoring pasteboard, TWO-TONE by region:
           - the SURROUND (html/body, the scrollable area beyond the frame) is the
             dark #161927 — matches CanvasArea's \`s.outer\`;
           - the FRAME-SIZED PAGE backdrop is #3d4253 (\`.cg-stage\`'s background-color)
             with the #5b6075 broadcast checker, inset by the frame offset + outlined, so
             the editing surface matches the preview modal exactly.
           CSS paints background-color (#a7a7a7 page) → background-image (the
           checkerboard) → children (shapes), so the page is a BACKDROP behind every
           shape — on-frame shapes over the page paint on top and stay visible;
           off-frame shapes over the #161927 surround likewise (clip lifted). */
      html, body { background: #161927 !important; }
      .cg-stage {
        position: absolute !important;
        /* D-071 — the frame inset is a CSS VARIABLE on :root (which createRuntime never
           recreates), so a content-grown offset updates LIVE via postMessage without an
           iframe reload; the baked value is the load-time fallback. */
        top: var(--cg-frame-y, ${String(oy)}px) !important;
        left: var(--cg-frame-x, ${String(ox)}px) !important;
        /* D-071 / B-0xx — the frame SIZE is a CSS variable too (like the offset), so a
           scene-size change (inspector W/H) re-sizes the frame page LIVE on the
           scene-replace path — no iframe reload. The baked value is the load-time
           fallback; without the var the !important literal would pin the frame to the
           load-time resolution and the page would stop tracking the scene size. */
        width: var(--cg-frame-w, ${String(w)}px) !important;
        height: var(--cg-frame-h, ${String(h)}px) !important;
        overflow: visible !important;
        background-color: #3d4253;
        background-image: ${checkerImage};
        background-size: 48px 48px;
        background-position: ${checkerPos};
        box-shadow: 0 0 0 1px rgba(120,170,255,0.5), 0 10px 36px rgba(0,0,0,0.55);
      }`
      : `/* D-011 — transparency checkerboard (broadcast modal). Authoring-only; the
         exported .vcg uses the baseline cgCss (transparent) without it. */
      html, body {
        background-color: #3d4253 !important;
        background-image: ${checkerImage} !important;
        background-size: 48px 48px !important;
        background-position: ${checkerPos} !important;
      }`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <!-- App-bundled fonts (Vazirmatn / Exo 2). The srcdoc iframe is same-origin
         as the host, so these /fonts/… URLs resolve exactly as they do in the
         editor; without this, built-in fonts fall back to a system face. -->
    <style>${this.#fontsCss}</style>
    <style>${this.#cgCss}</style>
    <!--
      Authoring override: the broadcast runtime hides the stage while
      \`body.cg-pending\` is set (.cg-pending{opacity:0} and
      .cg-pending .cg-stage{visibility:hidden}). On the editor CANVAS the
      operator must see what they're building before play() is ever
      called, so we lift those rules with !important. D-087 — the Preview
      MODAL passes broadcast=true and OMITS this lift, so it opens blank
      (loaded but unpainted) and paints only on play(), matching the
      exported .vcg (which keeps the original CSS).
    -->
    <style>
      ${pendingOverrideCss}
      /* The 'scene-replace' path calls runtime.remove() then
         createRuntime(newScene). remove() leaves body marked
         cg-removed, which the baseline CSS turns into
         display:none on the new stage. Keep the stage visible
         across that tear-down/rebuild. */
      .cg-removed .cg-stage { display: block !important; }
      ${surfaceCss}
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
        // D-087 — false in a broadcast (Preview-modal) document: keep the
        // runtime's native cg-pending (blank) state on load and reveal only on
        // play(). True on the editor canvas: reveal frame 0 immediately so the
        // operator can edit. createRuntime always sets cg-pending; this only
        // decides whether applyScene clears it on load.
        const REVEAL_ON_LOAD = ${String(revealOnLoad)};
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

        // D-040 — visible placeholder for an image whose bytes don't resolve, so
        // the operator sees a clear missing-asset frame instead of the browser's
        // broken-image glyph. The host warns (once) for genuinely-missing ids.
        var MISSING_IMG =
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">' +
              '<rect width="160" height="120" fill="#2a2f45"/>' +
              '<rect x="8" y="8" width="144" height="104" rx="6" fill="none" stroke="#6b7390" stroke-width="2" stroke-dasharray="6 5"/>' +
              '<path d="M40 88l28-30 22 24 14-14 22 20" fill="none" stroke="#6b7390" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<circle cx="58" cy="46" r="8" fill="#6b7390"/>' +
              '<text x="80" y="112" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#9aa3c0">missing image</text>' +
              '</svg>',
          );

        function applyAssetUrls() {
          const nodes = document.querySelectorAll('[data-cg-asset-id]');
          nodes.forEach((node) => {
            if (node.tagName !== 'IMG') return;
            const id = node.dataset && node.dataset.cgAssetId;
            if (!id) return;
            const url = assetUrls[id];
            if (url) {
              if (node.src !== url) node.src = url;
              node.removeAttribute('data-cg-missing');
            } else if (node.getAttribute('data-cg-missing') !== '1') {
              // Unresolved (missing OR not-yet-primed). The host re-posts the map
              // as URLs resolve, which overwrites this with the real image.
              node.src = MISSING_IMG;
              node.setAttribute('data-cg-missing', '1');
            }
          });
        }

        // D-039ext — image nodes created DURING playback (a ticker image separator the
        // crawl feeds, repeater rows) are added AFTER the one-time walk, and the host only
        // re-posts asset-urls on its own events — so a freshly-fed <img data-cg-asset-id>
        // would stay unresolved. Re-run applyAssetUrls when nodes are added (rAF-coalesced,
        // so a busy crawl can't thrash); the assetUrls map already merges project + shared.
        let assetWalkScheduled = false;
        const assetObserver = new MutationObserver(() => {
          if (assetWalkScheduled) return;
          assetWalkScheduled = true;
          requestAnimationFrame(() => {
            assetWalkScheduled = false;
            applyAssetUrls();
          });
        });
        assetObserver.observe(document.body, { childList: true, subtree: true });

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
            // D-028 — operator (asset-*) faces load BEFORE the old stage is
            // torn down (no blank-checkerboard flash while a font fetches)
            // and before the runtime exists, so runtime.ready
            // (document.fonts.ready) and the ticker's first-pass width
            // measurement see final glyphs. Failures degrade gracefully
            // (applyFontFaces posts cg-preview-error itself) — a broken font
            // must not brick the preview.
            await applyFontFaces().catch(() => {});
            if (runtime) runtime.remove();
            // remove() leaves body.cg-removed / pending state; clear
            // both so the next createRuntime starts clean.
            document.body.classList.remove('cg-removed');
            document.body.classList.remove('cg-pending');
            runtime = createRuntime(scene, {
              playoutOverride: playoutOverride,
              scopeOverrides: scopeOverrides,
              // D-039ext — give the runtime the current asset URLs so the ticker driver can
              // resolve an image separator's src on the nodes it FEEDS during the live crawl
              // (the host DOM walk below still wires the static tree + late-arriving URLs).
              assetUrls: assetUrls,
            });
            installCasparGlobals(runtime);
            await runtime.ready;
            // D-087 — a broadcast preview leaves cg-pending in place so the
            // stage stays blank until play(); the canvas reveals frame 0 now.
            if (REVEAL_ON_LOAD) document.body.classList.remove('cg-pending');
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

        // D-071 — the content-grown frame inset is a CSS variable on :root (which
        // createRuntime never recreates), so a moving offset re-insets .cg-stage live.
        function applyFrameOffset(o) {
          if (o && typeof o === 'object') {
            var root = document.documentElement;
            root.style.setProperty('--cg-frame-x', (o.x || 0) + 'px');
            root.style.setProperty('--cg-frame-y', (o.y || 0) + 'px');
          }
        }
        // B-0xx — the frame PAGE size tracks scene.resolution live: a scene-size change
        // (inspector W/H) arrives on the scene-replace path with no iframe reload, so set
        // the size CSS vars from the scene's resolution (the baked CSS value is only the
        // load-time fallback). Without this the !important frame width/height stay pinned
        // to the load-time resolution and the page stops matching the scene size.
        function applyFrameSize(res) {
          if (res && typeof res === 'object') {
            var root = document.documentElement;
            if (typeof res.width === 'number') root.style.setProperty('--cg-frame-w', res.width + 'px');
            if (typeof res.height === 'number') root.style.setProperty('--cg-frame-h', res.height + 'px');
          }
        }
        applyFrameSize({ width: ${String(w)}, height: ${String(h)} });

        window.addEventListener('message', (evt) => {
          const msg = evt.data;
          if (!msg || typeof msg !== 'object' || msg.kind !== 'cg-preview') return;
          (async () => {
            try {
              if (msg.action === 'scene-replace' && msg.scene) {
                // D-071 — the content-grown frame inset rides the scene-replace message
                // (same rAF-throttled channel); update the CSS vars on :root so the
                // recreated .cg-stage picks up the new offset with no reload.
                applyFrameOffset(msg.frameOffset);
                // B-0xx — and the new frame SIZE (a scene-size edit travels here too).
                applyFrameSize(msg.scene.resolution);
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
                // D-071 — the offset is current-frame derived, so it can shift as the
                // playhead moves an animated shape off-frame; re-inset .cg-stage live.
                applyFrameOffset(msg.frameOffset);
                currentFrame = msg.frame;
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'play' && typeof window.play === 'function') {
                currentFields = msg.fields ?? {};
                // D-028 — asset fonts may have arrived after the scene build;
                // await them so the first pass a user ever sees measures with
                // final glyphs (no-op when already loaded).
                await applyFontFaces().catch(() => {});
                window.play(JSON.stringify(currentFields));
                // B-029 — do NOT re-tick currentFrame here. During playback the
                // controller owns the frame (its per-frame applyFrame now drives the
                // lifespan gate too); a static re-tick at the scrubbed frame could
                // re-hide a start-trimmed (lifespan.in > 0) element at frame 0 just
                // before play restores it. The prior scrub already painted currentFrame.
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

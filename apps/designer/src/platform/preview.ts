import type { Scene } from '@cg/shared-schema';
import { attachRobustVideoPoster } from '../shared/video-poster.js';

export interface PreviewOptions {
  cgJs: string;
  cgCss: string;
  /**
   * D-125 — the ESM Lottie PLAYER bundle (installs `globalThis.__cgLottie`). Imported
   * for its side effect in the preview document BEFORE the runtime, so a Lottie element
   * mounts its player. Optional so existing callers/tests still build (Lottie elements
   * just won't render without it).
   */
  cgJsLottie?: string;
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
  #cgJsLottieUrl: string | null = null;
  #docUrl: string | null = null;

  constructor(options: PreviewOptions) {
    this.#cgCss = options.cgCss;
    this.#fontsCss = options.fontsCss ?? '';
    // The runtime bundle never changes during a session — make one Blob URL.
    this.#cgJsUrl = URL.createObjectURL(new Blob([options.cgJs], { type: 'text/javascript' }));
    // D-125 — the ESM Lottie player bundle (side-effecting: installs `globalThis.__cgLottie`).
    // One stable Blob URL, imported first in the preview document. Absent ⇒ no import line.
    if (options.cgJsLottie !== undefined) {
      this.#cgJsLottieUrl = URL.createObjectURL(
        new Blob([options.cgJsLottie], { type: 'text/javascript' }),
      );
    }
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
    const cgJsLottieUrl = this.#cgJsLottieUrl;
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
           CSS paints background-color (#3d4253 page) → background-image (the
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
        /* D-071 / B-028 — the frame SIZE is a CSS variable too (like the offset), so a
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
      ${
        cgJsLottieUrl !== null
          ? `// D-125 — the Lottie player bundle installs globalThis.__cgLottie (side-effect
      // import) BEFORE the runtime, so a Lottie element can mount its player.
      import '${cgJsLottieUrl}';`
          : ''
      }
      import { createRuntime, installCasparGlobals } from '${cgJsUrl}';
      (async () => {
        // D-087 — false in a broadcast (Preview-modal) document: keep the
        // runtime's native cg-pending (blank) state on load and reveal only on
        // play(). True on the editor canvas: reveal frame 0 immediately so the
        // operator can edit. createRuntime always sets cg-pending; this only
        // decides whether applyScene clears it on load.
        const REVEAL_ON_LOAD = ${String(revealOnLoad)};
        // B-134 — the EDITOR BACKDROP paints on the editing canvas ONLY. The Preview
        // modal is a preview of AIR, and the backdrop never reaches air (B-129), so it
        // must show what air shows. A SEPARATE axis from the render mode, which stays
        // 'author' on both surfaces because neither can show real live video.
        // (No backticks in this block: it lives inside a template literal.)
        const PAINT_EDITOR_BACKDROP = ${String(authoring)};
        // Mutable bookkeeping — the iframe document stays alive across
        // edits; only the runtime (its DOM tree) is rebuilt by
        // applyScene(). This avoids reloading the whole HTML on every
        // drag tick, which was causing the "screen flashing" the
        // operator reported.
        let runtime = null;
        let currentFields = {};
        let currentFrame = 0;
        // D-106 — true while the preview is on-air (play → stop/out). A field UPDATE must
        // not re-tick the controller-owned held frame during playback — that would slam
        // the animated/background elements back to the scrubbed frame (0). The canvas
        // never plays, so it keeps re-ticking after an update.
        let playing = false;
        let busy = false;
        let pendingScene = null;
        // B-091 — a 'lottie-assets' map that arrived DURING playback. Mounting a Lottie
        // player requires a full scene rebuild (createRuntime owns the mount), which would
        // tear the live graphic down under the operator — exactly what the 'update'
        // handler's !playing guard exists to prevent. We DEFER rather than drop, and
        // flush before the next play(), where a rebuild is free (nothing is on air yet).
        let pendingLottieRebuild = false;
        // D-011 — assetId → blob URL map, posted by the host. After
        // every scene rebuild we walk the iframe DOM and assign src
        // for every <img data-cg-asset-id="…">.
        let assetUrls = {};
        // D-128 Phase 3 — LIVE <video> nodes kept ACROSS scene rebuilds, keyed by
        // element id. A transform-only change (drag/resize/rotate/opacity) posts a
        // full 'scene-replace' → the runtime DOM is torn down + rebuilt, which for
        // a <video> would mean re-loading its blob + re-seeking the poster (blank
        // for a beat, and a burst of rebuilds during a 60 Hz drag keeps it blank
        // the whole time). Instead we HARVEST the live media nodes before the
        // teardown and TRANSPLANT them into the freshly-built tree, copying only
        // the new transform/style — the media (src + currentTime) never resets.
        let videoPool = {};
        // D-125 — assetId → parsed Lottie animationData, posted by the host. Passed to
        // createRuntime so each Lottie element resolves + mounts its player. Populated on
        // scene-replace and via the dedicated 'lottie-assets' message (mirrors assetUrls).
        let lottieAssets = {};
        let currentScene = null;
        let editingTextId = null;
        // D-020 — non-persistent playout override (mode / holdMs / repeat).
        // Set by 'scene-replace' so the preview can test timing without touching
        // the stored template; passed straight to createRuntime on every rebuild.
        let playoutOverride = undefined;
        // D-026 — PER-SCOPE overrides keyed by instance-name path ('' = root). Lets
        // the preview time each nested child independently (session-only).
        let scopeOverrides = undefined;
        // multibox-layout-switch C2 — the ACTIVE ARRANGEMENT's view, retained across
        // rebuilds so a fresh runtime is re-told which arrangement the author is on.
        let arrangementView = undefined;
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

        // D-128 — show a video's MID-CLIP poster frame at rest (frame 0 is often
        // transparent) via the ONE robust poster routine, injected from
        // src/shared/video-poster.ts so the iframe executes the SAME code the
        // parent thumbnails and the import modal's post-store verification use.
        // WHY not a plain cold seek (the canvas-blank field bug, proven
        // 2026-07-25): the WebM alpha side-stream's keyframes need not align
        // with the main stream's, and a cold seek into a misaligned GOP is a
        // TERMINAL Chromium PIPELINE_ERROR_DECODE — while sequential playback
        // (what the import modal verifies, and what playout does) always works.
        // The routine seeks on the eager-load path and falls back to sequential
        // 16x decode; see the shared module header for the mechanism.
        const attachRobustVideoPoster = ${attachRobustVideoPoster.toString()};
        function wireVideoPoster(video, url) {
          const ms = Number(video.dataset && video.dataset.cgPosterMs);
          attachRobustVideoPoster(video, url, isFinite(ms) && ms > 0 ? ms : undefined).then(
            (outcome) => {
              // Honest surfacing (Phase-2 error principle): a media load/decode
              // failure reaches the console rather than leaving a silently blank box.
              if (!outcome.ok && outcome.error !== 'superseded') {
                // eslint-disable-next-line no-console
                console.error(
                  '[cg-preview] video failed to load its poster:',
                  outcome.error || 'unknown media error',
                  url,
                );
              }
              // D-135 §5 — the poster is SUBORDINATE to the tick: it stays as the
              // load path + the sequential-decode recovery for seek-fragile assets
              // (and paints only as a PRE-TICK transient), but the playhead owns the
              // at-rest frame. The routine settles ASYNC — after applyScene's own
              // tick — so without this chained re-tick the poster's seek would land
              // LAST and the canvas would rest on a mid-clip poster, disagreeing
              // with the Lottie beside it (the §9.5 consistency debt). Never while
              // playing: the controller owns the frame then (B-029's rule).
              if (runtime && !playing) runtime.tick(currentFrame);
            },
          );
        }

        // D-128 Phase 3 — collect the live <video> nodes just BEFORE a rebuild so
        // their references survive the teardown (a detached node keeps its media
        // state alive as long as it is referenced).
        function harvestVideos() {
          const nodes = document.querySelectorAll('video[data-cg-element-id]');
          for (let i = 0; i < nodes.length; i++) {
            const id = nodes[i].dataset && nodes[i].dataset.cgElementId;
            if (id) videoPool[id] = nodes[i];
          }
        }

        // After a rebuild, put the harvested LIVE media nodes back where the
        // freshly-built (src-less) placeholders are — same element id AND same
        // asset — copying only the new transform/style. The media never reloads.
        // A genuinely new element (or one whose asset changed) keeps its fresh
        // node and gets a normal src+seek from applyAssetUrls. Pooled entries no
        // longer in the scene are dropped.
        function reconcileVideos() {
          const seen = {};
          const nodes = document.querySelectorAll('video[data-cg-element-id]');
          for (let i = 0; i < nodes.length; i++) {
            const fresh = nodes[i];
            const id = fresh.dataset.cgElementId;
            const assetId = fresh.dataset.cgAssetId;
            if (!id) continue;
            seen[id] = true;
            const pooled = videoPool[id];
            if (pooled && pooled !== fresh && pooled.dataset.cgAssetId === assetId) {
              pooled.style.cssText = fresh.style.cssText; // the new transform/geometry
              pooled.className = fresh.className;
              pooled.dataset.cgPosterMs = fresh.dataset.cgPosterMs || '';
              fresh.replaceWith(pooled);
              videoPool[id] = pooled;
            } else {
              videoPool[id] = fresh;
            }
          }
          for (const id in videoPool) if (!seen[id]) delete videoPool[id];
        }

        function applyAssetUrls() {
          // Transplant preserved media nodes first, so the walk below sees the
          // pooled <video> already carrying its (unchanged) blob src and skips it.
          reconcileVideos();
          const nodes = document.querySelectorAll('[data-cg-asset-id]');
          nodes.forEach((node) => {
            const tag = node.tagName;
            if (tag !== 'IMG' && tag !== 'VIDEO') return;
            const id = node.dataset && node.dataset.cgAssetId;
            if (!id) return;
            const url = assetUrls[id];
            if (url) {
              if (tag === 'VIDEO') {
                // D-128 Phase 5 — the runtime's export-side walk now sets
                // <video src> whenever createRuntime receives assetUrls (which
                // the canvas passes for the ticker separator), so a src
                // comparison can NO LONGER gate the poster: the src may already
                // be correct while the poster was never armed (the exact
                // regression the Phase-5 E2E caught — blank canvas again). Arm
                // the robust routine ONCE PER NODE via an explicit marker: a
                // pooled/transplanted node keeps its marker (never re-armed on
                // a drag), a genuinely fresh node is wired exactly once, and
                // the routine still owns the (re-)src write so preload turns
                // eager before the decisive load (the cold-seek trap above).
                if (node.getAttribute('data-cg-poster-armed') !== '1') {
                  node.setAttribute('data-cg-poster-armed', '1');
                  wireVideoPoster(node, url);
                }
              } else if (node.src !== url) {
                node.src = url;
              }
              node.removeAttribute('data-cg-missing');
            } else if (tag === 'IMG' && node.getAttribute('data-cg-missing') !== '1') {
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
              postPreviewError(
                'font.load',
                font.family + ': ' + (err && err.message ? err.message : String(err)),
              );
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

        // ── Session Z — AN INERT CONTROL MUST EXPLAIN ITSELF ──────────────────────
        // Every diagnostic this document produces travels ONE channel: a
        // 'cg-preview-error' postMessage the host logs as console.error('[cg-preview]',…).
        // (No backticks in this block: it lives inside a template literal.)
        function postPreviewError(label, payload) {
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(
                { kind: 'cg-preview-error', label: label, payload: String(payload) },
                '*',
              );
            }
          } catch (e) {
            /* a diagnostic must never throw over the thing it is reporting */
          }
        }
        // play / update / stop / out / next are delivered through the CasparCG globals
        // installCasparGlobals(runtime) installs at the end of every applyScene. Those
        // branches used to be GATED on 'typeof window.<name> === "function"', a guard that
        // fails silently in both directions: a missing global dropped the command with no
        // diagnostic anywhere, and window.stop is worse still — lib.dom ALWAYS defines it
        // (the page-load canceller), so the guard reads "installed" and the click cancels
        // nothing at all. The truthful test is whether window.cg is the runtime THIS
        // document currently has; anything else is a stale or absent install.
        function controlFn(name) {
          if (runtime === null) return null;
          if (window.cg !== runtime) return null;
          if (typeof window[name] !== 'function') return null;
          return window[name];
        }
        function reportDroppedControl(name) {
          var why =
            runtime === null
              ? 'no runtime — the last scene build failed'
              : window.cg !== runtime
                ? 'the CasparCG globals point at a stale runtime'
                : 'window.' + name + ' is not installed';
          postPreviewError('control.dropped', name + ' — ' + why);
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
            // D-128 Phase 3 — keep live <video> media across the teardown so a
            // transform-only change never reloads it (see reconcileVideos).
            harvestVideos();
            if (runtime) runtime.remove();
            // remove() leaves body.cg-removed / pending state; clear
            // both so the next createRuntime starts clean.
            document.body.classList.remove('cg-removed');
            document.body.classList.remove('cg-pending');
            runtime = createRuntime(scene, {
              // D-137 §9 — this ONE document serves BOTH authoring surfaces: the
              // editor canvas (authoring=true) and the Preview modal
              // (broadcast=true). Both are 'author': the modal previews what the
              // AUTHOR is building, not what the exporter will emit, so a Live
              // Source shows its bars in both and an invisible box in neither.
              // The exports name 'output' at their own boot sites.
              //
              // B-134 — the two surfaces do NOT agree about the editor backdrop, which
              // is why that is its own option below rather than another render-mode
              // value: the modal needs 'author' (bars) and no backdrop at once.
              mode: 'author',
              // B-134 — canvas paints the editor backdrop; the Preview modal does not.
              paintEditorBackdrop: PAINT_EDITOR_BACKDROP,
              playoutOverride: playoutOverride,
              scopeOverrides: scopeOverrides,
              // D-039ext — give the runtime the current asset URLs so the ticker driver can
              // resolve an image separator's src on the nodes it FEEDS during the live crawl
              // (the host DOM walk below still wires the static tree + late-arriving URLs).
              assetUrls: assetUrls,
              // D-125 — parsed Lottie animationData (assetId → object); the runtime mounts a
              // player per Lottie element from this map.
              lottieAssets: lottieAssets,
            });
            installCasparGlobals(runtime);
            // Session Z — the runtime's OWN diagnostics reach the parent console on the
            // same channel. An invariant break such as 'lifecycle.play-not-on-air' is the
            // whole difference between "the buttons are dead" and a named cause.
            if (typeof runtime.on === 'function') {
              runtime.on('error', (e) => {
                postPreviewError(
                  'runtime.error',
                  (e && e.code ? e.code : '?') + ': ' + (e && e.message ? e.message : ''),
                );
              });
            }
            await runtime.ready;
            // ⭐ multibox-layout-switch C2 — RE-ASSERT the active arrangement onto the
            // fresh runtime. Every scene edit rebuilds (createRuntime above), and a new
            // runtime knows nothing about which arrangement the author is looking at — so
            // without this line the canvas would snap back to the authored geometry on the
            // next keystroke, and the selector would look intermittently broken rather
            // than unwired.
            if (arrangementView) runtime.setArrangementView(arrangementView);
            // D-087 — a broadcast preview leaves cg-pending in place so the
            // stage stays blank until play(); the canvas reveals frame 0 now.
            if (REVEAL_ON_LOAD) document.body.classList.remove('cg-pending');
            await runtime.update(currentFields);
            runtime.tick(currentFrame);
            applyAssetUrls();
            // D-135 §5 — tick AGAIN after the asset walk: reconcileVideos (inside
            // applyAssetUrls) may have TRANSPLANTED a pooled <video> over the node the
            // tick above just positioned, and the pooled node's currentTime predates
            // the rebuild. The re-tick resolves it through the driver's live() and
            // re-positions — so a phases edit shows its NEW mapping at the same
            // playhead, not the pooled node's stale frame.
            runtime.tick(currentFrame);
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

        // B-091 — apply a 'lottie-assets' map that arrived mid-playback. Called at the TOP
        // of the play branch, before playing flips true: the previous run has ended, so the
        // rebuild costs nothing visually, and the operator sees the newly-mounted players on
        // the very next take. Deliberately NOT flushed from 'stop'/'out' — those start an
        // async coordinated exit (the element outros), and rebuilding under it would cut the
        // outro short, re-introducing the teardown this bug is about.
        async function flushPendingLottieRebuild() {
          if (!pendingLottieRebuild) return;
          pendingLottieRebuild = false;
          if (currentScene) await applyScene(currentScene);
        }

        // ── B-045 — stale-raster position pin (AUTHORING CANVAS ONLY) ─────────────
        // Chromium fails to re-raster a transform-scaled subtree when an element's
        // left/top changes by ≲2 CSS px: layout and the DOM update but the painted
        // pixels stay at the previous position — surviving idle, scrolling, and even
        // full runtime rebuilds (docs/prd/bugs-designer.md B-045; measurements in the
        // change's design.md Take 6). transform updates are compositor-tracked and
        // never miss. So on the canvas each runtime element's BOX is pinned at
        // left/top:0 and its position rides a translate() PREFIX on the inline
        // transform instead — the box never moves, so there is nothing for Chromium
        // to mis-invalidate. The translate value is quantized to Blink's LayoutUnit
        // lattice (trunc(v*64)/64), keeping the rendered geometry identical to the
        // left/top layout it replaces (pixel parity with playout; the designer
        // gizmo's layout-lattice projection stays exact). transform-origin math is
        // unaffected for ANY anchor: a translate composed FIRST commutes out of the
        // origin conjugation. Interception is a per-element style Proxy installed
        // through THIS document's HTMLElement.prototype.style getter (realm-local),
        // so every engine write — scene-builder, bindings, animation-applier ticks —
        // reroutes synchronously (before any paint) with the raw intended value in
        // hand (a MutationObserver cannot distinguish an engine-written '0px' from
        // the pin's own). The broadcast Preview modal and exported .vcg / HTML never
        // install it (REVEAL_ON_LOAD gate) — playout output is untouched. Root fix =
        // engine-level transform positioning (D-096), which deletes this shim. RTL
        // auto-hug text re-anchors via left:'auto' + right: the pin restores raw
        // state and opts those elements out (documented scope limit).
        function installPositionPin() {
          var styleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
          if (!styleDesc || typeof styleDesc.get !== 'function') return;
          var rawStyleOf = function (el) {
            return styleDesc.get.call(el);
          };
          var recs = new WeakMap(); // el → { x, y, rest } (rest = engine's own transform)
          var proxies = new WeakMap(); // el → style proxy
          var optedOut = new WeakSet(); // left went auto/%/…: never pin this el again
          var q64 = function (v) {
            return Math.trunc(v * 64) / 64;
          };
          // '6.69px' → 6.69 · '0' → 0 · anything else (auto, %, calc, '') → null
          var pxValue = function (v) {
            if (v === 0 || v === '0') return 0;
            var s = String(v);
            if (/^-?(\\d+\\.?\\d*|\\.\\d+)px$/.test(s)) return parseFloat(s);
            return null;
          };
          var composedOf = function (rec) {
            return (
              'translate(' + String(rec.x) + 'px, ' + String(rec.y) + 'px)' +
              (rec.rest !== '' ? ' ' + rec.rest : '')
            );
          };
          var writePin = function (el, raw, rec) {
            recs.set(el, rec);
            raw.left = '0px';
            raw.top = '0px';
            raw.transform = composedOf(rec);
          };
          var pinAxis = function (el, raw, axis, v) {
            var rec = recs.get(el);
            if (rec === undefined) {
              // first pin — adopt whatever the engine has written so far
              var t = raw.transform;
              var px = pxValue(raw.left);
              var py = pxValue(raw.top);
              rec = {
                x: px === null ? 0 : q64(px),
                y: py === null ? 0 : q64(py),
                rest: t === 'none' || !t ? '' : t,
              };
            }
            rec[axis] = q64(v);
            writePin(el, raw, rec);
          };
          var unpin = function (el, raw, axis, value) {
            var rec = recs.get(el);
            if (rec !== undefined) {
              raw.transform = rec.rest;
              if (axis === 'x') raw.top = String(rec.y) + 'px';
              else raw.left = String(rec.x) + 'px';
              recs.delete(el);
            }
            optedOut.add(el);
            raw[axis === 'x' ? 'left' : 'top'] = value;
          };
          // true = handled; false = caller forwards to the raw declaration
          var route = function (el, raw, prop, value) {
            if (prop === 'left' || prop === 'top') {
              if (optedOut.has(el)) return false;
              var axis = prop === 'left' ? 'x' : 'y';
              var n = pxValue(value);
              if (n === null) {
                unpin(el, raw, axis, value);
                return true;
              }
              pinAxis(el, raw, axis, n);
              return true;
            }
            if (prop === 'transform') {
              var rec = recs.get(el);
              if (rec === undefined) return false;
              rec.rest = value === 'none' || !value ? '' : String(value);
              writePin(el, raw, rec);
              return true;
            }
            return false;
          };
          var makeProxy = function (el, raw) {
            return new Proxy(raw, {
              get: function (t, prop) {
                if (prop === 'left' || prop === 'top' || prop === 'transform') {
                  var rec = recs.get(el);
                  if (rec !== undefined) {
                    if (prop === 'transform') return rec.rest;
                    return String(prop === 'left' ? rec.x : rec.y) + 'px';
                  }
                  return t[prop];
                }
                if (prop === 'setProperty') {
                  return function (name, value, priority) {
                    if (route(el, t, name, value)) return undefined;
                    return t.setProperty(name, value, priority);
                  };
                }
                if (prop === 'removeProperty') {
                  return function (name) {
                    if (name === 'left' || name === 'top') {
                      route(el, t, name, '');
                      return '';
                    }
                    return t.removeProperty(name);
                  };
                }
                var v = t[prop];
                return typeof v === 'function' ? v.bind(t) : v;
              },
              set: function (t, prop, value) {
                if (typeof prop === 'string' && route(el, t, prop, value)) return true;
                t[prop] = value;
                return true;
              },
            });
          };
          Object.defineProperty(HTMLElement.prototype, 'style', {
            configurable: true,
            enumerable: styleDesc.enumerable === true,
            get: function () {
              var raw = rawStyleOf(this);
              if (
                typeof this.hasAttribute !== 'function' ||
                !this.hasAttribute('data-cg-element-id') ||
                optedOut.has(this)
              ) {
                return raw;
              }
              var p = proxies.get(this);
              if (p === undefined) {
                p = makeProxy(this, raw);
                proxies.set(this, p);
              }
              return p;
            },
          });
          // Safety net: a builder that styled an element BEFORE stamping
          // data-cg-element-id would land raw left/top — pin such nodes when they
          // enter the document (still before their first paint).
          new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
              var added = records[i].addedNodes;
              for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (n.nodeType !== 1) continue;
                var list = [];
                if (n.hasAttribute && n.hasAttribute('data-cg-element-id')) list.push(n);
                if (n.querySelectorAll) {
                  var q = n.querySelectorAll('[data-cg-element-id]');
                  for (var k = 0; k < q.length; k++) list.push(q[k]);
                }
                for (var m = 0; m < list.length; m++) {
                  var el = list[m];
                  if (recs.has(el) || optedOut.has(el)) continue;
                  var raw = rawStyleOf(el);
                  var nx = pxValue(raw.left);
                  if (nx === null) continue; // auto/unset — not px-positioned
                  pinAxis(el, raw, 'x', nx);
                }
              }
            }
          }).observe(document.documentElement, { subtree: true, childList: true });
        }
        if (REVEAL_ON_LOAD) {
          try {
            installPositionPin();
          } catch (e) {
            /* the pin must never brick the canvas preview */
          }
        }

        // Session Z — the BOOT build must not take the message listener down with it.
        // This await sits ABOVE the addEventListener further down, so a throw here (an
        // element the builder rejects, a Lottie that fails to mount) used to abort the
        // whole module: the document then received NOTHING, ever again, with no
        // diagnostic — a live-looking preview whose every button is inert. Report it and
        // carry on to the listener, so the next scene-replace can repair the document.
        try {
          await applyScene(${sceneJson});
        } catch (e) {
          postPreviewError('boot.applyScene', e && e.message ? e.message : String(e));
        }

        // D-071 — the content-grown frame inset is a CSS variable on :root (which
        // createRuntime never recreates), so a moving offset re-insets .cg-stage live.
        function applyFrameOffset(o) {
          if (o && typeof o === 'object') {
            var root = document.documentElement;
            root.style.setProperty('--cg-frame-x', (o.x || 0) + 'px');
            root.style.setProperty('--cg-frame-y', (o.y || 0) + 'px');
          }
        }
        // B-028 — the frame PAGE size tracks scene.resolution live: a scene-size change
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
                // B-028 — and the new frame SIZE (a scene-size edit travels here too).
                applyFrameSize(msg.scene.resolution);
                if (msg.assetUrls && typeof msg.assetUrls === 'object') {
                  assetUrls = msg.assetUrls;
                }
                // D-125 — the parsed Lottie map travels with the scene (same rAF channel),
                // so the rebuilt runtime mounts each element's player.
                if (msg.lottieAssets && typeof msg.lottieAssets === 'object') {
                  lottieAssets = msg.lottieAssets;
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
              } else if (msg.action === 'lottie-assets' && msg.lottieAssets) {
                // D-125 — a Lottie player is created at createRuntime time, so a map that
                // arrives AFTER the initial (empty) build needs a scene re-apply to mount
                // the players. lottieAssets is only ever non-empty when the scene has Lottie
                // elements (the host builds it from the scene's Lottie ids), so this rebuilds
                // only when there is something to mount.
                lottieAssets = msg.lottieAssets;
                // B-091 — record the map ALWAYS (cheap, no teardown), but never rebuild
                // mid-playback: applyScene() calls runtime.remove() + createRuntime(), which
                // would blank and restart the live graphic. Mirrors the 'update' handler's
                // !playing guard 13 lines below. Deferred (not dropped) so the players still
                // mount — flushed before the next play(), see flushPendingLottieRebuild().
                if (currentScene && Object.keys(lottieAssets).length > 0) {
                  if (playing) pendingLottieRebuild = true;
                  else await applyScene(currentScene);
                }
              } else if (msg.action === 'arrangement') {
                // ⭐ multibox-layout-switch C2 — THE ACTIVE ARRANGEMENT, straight into the
                // entry point C1 built. This is what makes the toolbar selector visibly
                // change the canvas rather than only changing the authored state.
                //
                // 🔴 It is deliberately NOT a scene-replace. setArrangementView() re-punches
                // the masks on the LIVE nodes, so switching arrangements costs the page
                // nothing it is holding — a playing animation, a <video>'s decode position,
                // a sequence's dwell all survive. Rebuilding would blank and restart the
                // graphic on every switch, which is the manoeuvre being previewed.
                //
                // arrangementView is retained so the next applyScene() can re-assert it:
                // a rebuild creates a fresh runtime, which knows nothing about it.
                // (No backticks in this block: it lives inside a template literal.)
                arrangementView = msg.view ?? undefined;
                if (runtime) runtime.setArrangementView(arrangementView);
              } else if (msg.action === 'editing-text') {
                editingTextId = typeof msg.elementId === 'string' ? msg.elementId : null;
                applyEditingHide();
              } else if (msg.action === 'update') {
                currentFields = msg.fields ?? {};
                const updateFn = controlFn('update');
                if (updateFn === null) reportDroppedControl('update');
                else updateFn(JSON.stringify(currentFields));
                // D-106 — apply IN PLACE: update() swaps the bound values on the LIVE
                // graphic; re-tick only when NOT playing (the canvas / static scrub), so a
                // held graphic keeps its background + animation untouched (the CG UPDATE
                // standard — no background teardown, no close/reopen).
                if (runtime && !playing) runtime.tick(currentFrame);
              } else if (msg.action === 'scrub' && typeof msg.frame === 'number') {
                // D-071 — the offset is current-frame derived, so it can shift as the
                // playhead moves an animated shape off-frame; re-inset .cg-stage live.
                applyFrameOffset(msg.frameOffset);
                currentFrame = msg.frame;
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'play') {
                currentFields = msg.fields ?? {};
                // B-091 — mount any Lottie map deferred during the LAST run before this one
                // starts (rebuilds while nothing is on air; no-op when nothing is pending).
                await flushPendingLottieRebuild();
                // D-028 — asset fonts may have arrived after the scene build;
                // await them so the first pass a user ever sees measures with
                // final glyphs (no-op when already loaded).
                await applyFontFaces().catch(() => {});
                // Resolved AFTER the flush: that rebuild reinstalls the globals.
                const playFn = controlFn('play');
                if (playFn === null) reportDroppedControl('play');
                else {
                  playing = true;
                  playFn(JSON.stringify(currentFields));
                }
                // B-029 — do NOT re-tick currentFrame here. During playback the
                // controller owns the frame (its per-frame applyFrame now drives the
                // lifespan gate too); a static re-tick at the scrubbed frame could
                // re-hide a start-trimmed (lifespan.in > 0) element at frame 0 just
                // before play restores it. The prior scrub already painted currentFrame.
              } else if (msg.action === 'stop') {
                const stopFn = controlFn('stop');
                if (stopFn === null) reportDroppedControl('stop');
                else {
                  playing = false;
                  stopFn();
                }
              } else if (msg.action === 'out') {
                // D-105 — the coordinated animated exit (content first, background last).
                const outFn = controlFn('out');
                if (outFn === null) reportDroppedControl('out');
                else {
                  playing = false;
                  outFn();
                }
              } else if (msg.action === 'next') {
                const nextFn = controlFn('next');
                if (nextFn === null) reportDroppedControl('next');
                else nextFn();
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
              // Session Z — never swallow. A throw in here (a scene rebuild that failed,
              // a runtime that errored under a control) is indistinguishable, from the
              // operator's chair, from a button that simply does nothing.
              postPreviewError(
                'message.handler',
                (msg && msg.action ? msg.action : '?') +
                  ': ' +
                  (e && e.message ? e.message : String(e)),
              );
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

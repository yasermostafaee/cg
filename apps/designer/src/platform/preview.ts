import type { Scene } from '@cg/shared-schema';

export interface PreviewOptions {
  cgJs: string;
  cgCss: string;
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
  #cgJsUrl: string | null = null;
  #docUrl: string | null = null;

  constructor(options: PreviewOptions) {
    this.#cgCss = options.cgCss;
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

  /** Push a live field update to the preview iframe(s). */
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
            if (runtime) runtime.remove();
            // remove() leaves body.cg-removed / pending state; clear
            // both so the next createRuntime starts clean.
            document.body.classList.remove('cg-removed');
            document.body.classList.remove('cg-pending');
            runtime = createRuntime(scene);
            installCasparGlobals(runtime);
            await runtime.ready;
            document.body.classList.remove('cg-pending');
            await runtime.update(currentFields);
            runtime.tick(currentFrame);
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
                await applyScene(msg.scene);
              } else if (msg.action === 'update' && typeof window.update === 'function') {
                currentFields = msg.fields ?? {};
                window.update(JSON.stringify(currentFields));
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'scrub' && typeof msg.frame === 'number') {
                currentFrame = msg.frame;
                if (runtime) runtime.tick(currentFrame);
              } else if (msg.action === 'play' && typeof window.play === 'function') {
                window.play(JSON.stringify(msg.fields ?? {}));
              } else if (msg.action === 'stop' && typeof window.stop === 'function') {
                window.stop();
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

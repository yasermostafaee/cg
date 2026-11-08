import type { AssetEntry, Scene } from '@cg/shared-schema';

/** Build the package-relative broadcast page embedded in every `.vcg`. */
export function buildVcgIndexHtml(
  scene: Scene,
  assetIndex: readonly AssetEntry[],
  fontIndex: readonly AssetEntry[],
  includeLottiePlayer: boolean,
): string {
  // Image/video/audio ids resolve to package-relative URLs. Lottie JSON is
  // fetched and parsed separately before the runtime starts.
  const assetUrls = Object.fromEntries(
    assetIndex.filter((entry) => entry.kind !== 'lottie').map((entry) => [entry.id, entry.path]),
  );
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, '\\u003c');
  const lottiePaths = Object.fromEntries(
    assetIndex.filter((entry) => entry.kind === 'lottie').map((entry) => [entry.id, entry.path]),
  );
  const lottiePathsJson = JSON.stringify(lottiePaths).replace(/</g, '\\u003c');
  const playerImport = includeLottiePlayer ? "      import './cg-lottie.js';\n" : '';
  const fontFaces = fontIndex
    .map((entry) => {
      const extension = entry.path.slice(entry.path.lastIndexOf('.'));
      return `      @font-face { font-family: "asset-${entry.id}"; font-display: swap; src: url('./${entry.path}') format('${fontFormatFor(extension)}'); }`;
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
        const params = new URLSearchParams(globalThis.location.search);
        const requestedPass = params.get('cgpass');
        const outputPass = requestedPass === 'background' || requestedPass === 'foreground'
          ? requestedPass
          : 'full';
        const syncKey = params.get('cgsync');
        // D-137 §9 — 'output': a Live Source paints ZERO PIXELS in the package
        // that goes on air, and is excluded from zone compilation so no authored
        // zone can fill the hole. Named explicitly, never inferred.
        // D-201 — a live-source template may be rendered as two synchronized pages:
        // the ordinary page below the input band and an authored foreground pass
        // above it. A package opened directly keeps the historical full rendering.
        const runtime = createRuntime(scene, {
          mode: 'output',
          outputPass,
          assetUrls: ${assetUrlsJson},
          lottieAssets,
        });
        installCasparGlobals(runtime);
        await runtime.ready;

        if (syncKey && typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('cg-live-foreground:' + syncKey);
          const methods = ['update', 'stop', 'next', 'remove', 'out'];
          const withoutTakeToken = (payload) => {
            let parsed = payload;
            let stringify = false;
            if (typeof payload === 'string') {
              try {
                parsed = JSON.parse(payload);
                stringify = true;
              } catch {
                return payload;
              }
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return payload;
            const control = parsed.__cg;
            if (!control || typeof control !== 'object' || Array.isArray(control) || !('take' in control)) {
              return payload;
            }
            const { take: _take, ...safeControl } = control;
            const safe = { ...parsed, __cg: safeControl };
            return stringify ? JSON.stringify(safe) : safe;
          };
          if (outputPass === 'foreground') {
            channel.addEventListener('message', (event) => {
              const message = event.data;
              if (!message || !methods.includes(message.method)) return;
              const fn = globalThis[message.method];
              if (typeof fn === 'function') fn(...(Array.isArray(message.args) ? message.args : []));
            });
          } else if (outputPass === 'background') {
            for (const method of methods) {
              const original = globalThis[method];
              if (typeof original !== 'function') continue;
              globalThis[method] = (...args) => {
                const syncArgs = method === 'update' && args.length > 0
                  ? [withoutTakeToken(args[0]), ...args.slice(1)]
                  : args;
                channel.postMessage({ method, args: syncArgs });
                return original(...args);
              };
            }
          }
        }
      })();
    </script>
  </body>
</html>
`;
}

function fontFormatFor(extension: string): string {
  switch (extension.toLowerCase()) {
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
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
        return character;
    }
  });
}

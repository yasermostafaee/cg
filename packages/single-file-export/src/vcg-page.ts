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
        // D-137 §9 — 'output': a Live Source paints ZERO PIXELS in the package
        // that goes on air, and is excluded from zone compilation so no authored
        // zone can fill the hole. Named explicitly, never inferred.
        const runtime = createRuntime(scene, { mode: 'output', assetUrls: ${assetUrlsJson}, lottieAssets });
        installCasparGlobals(runtime);
        await runtime.ready;
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

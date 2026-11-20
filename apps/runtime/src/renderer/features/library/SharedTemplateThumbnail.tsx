import { useEffect, useState, type ReactNode } from 'react';
import type { SharedTemplateThumbnail as TemplateThumbnail } from '@cg/shared-ipc';
import type * as StaticScene from '@cg/template-runtime/static-scene';
import type { LayoutPosterPreviewLoader } from './layoutPosterPreviewLoader.js';

export type SharedTemplatePreview = TemplateThumbnail | null;

type ScenePreview = Extract<TemplateThumbnail, { kind: 'scene' }>;

function renderStill(
  { scene, images, imageMimes }: ScenePreview,
  { BASELINE_CSS, buildThumbnailScene, visibleInStill }: typeof StaticScene,
  collectMissing: boolean,
  resizedPosters?: ReadonlyMap<string, string>,
): { html: string; missingPosters: string[] } | undefined {
  try {
    const doc = document.implementation.createHTMLDocument('');
    const container = buildThumbnailScene(scene, doc);
    const pictures = new Map(Object.entries(images ?? {}));
    const mimes = new Map(Object.entries(imageMimes ?? {}));
    const missingPosters = new Set<string>();
    for (const image of container.querySelectorAll('img')) {
      const assetId = image.dataset['cgAssetId'] ?? '';
      const bytes = pictures.get(assetId);
      const resized = resizedPosters?.get(assetId);
      if (resized !== undefined) {
        image.src = resized;
      } else if (bytes !== undefined) {
        image.src = `data:${mimes.get(assetId) ?? 'image/png'};base64,${bytes}`;
      } else {
        if (
          collectMissing &&
          assetId !== '' &&
          image.closest('[data-cg-live-fallback]') !== null &&
          visibleInStill(image, container)
        )
          missingPosters.add(assetId);
        image.remove();
      }
    }
    for (const media of container.querySelectorAll('video, audio')) media.remove();

    const { width, height } = scene.resolution;
    // The same contained artwork fits both the compact row and the larger Details slot.
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    const artwork = doc.createElementNS(svg.namespaceURI, 'foreignObject');
    artwork.setAttribute('width', String(width));
    artwork.setAttribute('height', String(height));
    artwork.append(container);
    svg.append(artwork);

    // Build from validated scene data in a detached document. Nothing in the
    // package supplies scripts, HTML, stylesheets or resource URLs to the frame.
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content =
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'";
    const style = doc.createElement('style');
    style.textContent = `
      * { box-sizing: border-box }
      html, body { background: transparent; color-scheme: light }
      body { margin: 0; overflow: hidden }
      body > svg { display: block; width: 100vw; height: 100vh }
      ${BASELINE_CSS}
    `;
    doc.head.replaceChildren(policy, style);
    doc.body.replaceChildren(svg);
    return {
      html: `<!doctype html>${doc.documentElement.outerHTML}`,
      missingPosters: [...missingPosters],
    };
  } catch {
    return undefined;
  }
}

export function SharedTemplateThumbnail({
  preview,
  fallback,
  layoutSourceSha,
  loadLayoutPosters,
}: {
  preview: SharedTemplatePreview;
  fallback: ReactNode;
  layoutSourceSha?: string | undefined;
  loadLayoutPosters?: LayoutPosterPreviewLoader | undefined;
}): JSX.Element {
  const [still, setStill] = useState<{ preview: ScenePreview; html: string }>();
  const [failedImage, setFailedImage] = useState<string>();
  useEffect(() => {
    if (preview?.kind !== 'scene') return;
    const controller = new AbortController();
    const { signal } = controller;
    // The scene renderer initializes its browser canvas dependencies on import.
    void import('@cg/template-runtime/static-scene').then(
      async (runtime) => {
        if (signal.aborted) return;
        const canRecover = layoutSourceSha !== undefined && loadLayoutPosters !== undefined;
        const still = renderStill(preview, runtime, canRecover);
        if (still === undefined) return;
        setStill({ preview, html: still.html });
        if (!canRecover || still.missingPosters.length === 0) return;
        const posters = await loadLayoutPosters(layoutSourceSha, still.missingPosters, signal);
        if (signal.aborted || posters.size === 0) return;
        const recovered = renderStill(preview, runtime, false, posters);
        if (recovered !== undefined) setStill({ preview, html: recovered.html });
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [preview, layoutSourceSha, loadLayoutPosters]);
  if (preview?.kind === 'image' && preview.base64 !== failedImage) {
    return (
      <img
        className="cg-shared-template-entry__picture"
        src={`data:${preview.mime};base64,${preview.base64}`}
        alt=""
        onError={() => setFailedImage(preview.base64)}
      />
    );
  }
  if (still === undefined || still.preview !== preview) return <>{fallback}</>;
  return (
    <iframe
      className="cg-shared-template-entry__picture"
      aria-hidden="true"
      title="Template thumbnail"
      tabIndex={-1}
      sandbox=""
      srcDoc={still.html}
    />
  );
}

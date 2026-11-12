import { useEffect, useState, type ReactNode } from 'react';
import type { SharedTemplateThumbnail as TemplateThumbnail } from '@cg/shared-ipc';
import type * as StaticScene from '@cg/template-runtime/static-scene';

export type SharedTemplatePreview = TemplateThumbnail | null;

type ScenePreview = Extract<TemplateThumbnail, { kind: 'scene' }>;

function renderStill(
  { scene, images }: ScenePreview,
  { applyFieldValues, BASELINE_CSS, buildScene }: typeof StaticScene,
): string | undefined {
  try {
    const doc = document.implementation.createHTMLDocument('');
    const { container, elementMap, textOriginals } = buildScene(scene, doc, 'output', false);
    applyFieldValues(scene, {}, elementMap, textOriginals, container);
    const pictures = new Map(Object.entries(images ?? {}));
    for (const image of container.querySelectorAll('img')) {
      const bytes = pictures.get(image.dataset['cgAssetId'] ?? '');
      if (bytes === undefined) {
        image.remove();
      } else {
        image.src = `data:image/png;base64,${bytes}`;
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
    return `<!doctype html>${doc.documentElement.outerHTML}`;
  } catch {
    return undefined;
  }
}

export function SharedTemplateThumbnail({
  preview,
  fallback,
}: {
  preview: SharedTemplatePreview;
  fallback: ReactNode;
}): JSX.Element {
  const [still, setStill] = useState<{ preview: ScenePreview; html: string }>();
  const [failedImage, setFailedImage] = useState<string>();
  useEffect(() => {
    if (preview?.kind !== 'scene') return;
    let active = true;
    // The scene renderer initializes its browser canvas dependencies on import.
    void import('@cg/template-runtime/static-scene').then(
      (runtime) => {
        if (!active) return;
        const html = renderStill(preview, runtime);
        if (html !== undefined) setStill({ preview, html });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [preview]);
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

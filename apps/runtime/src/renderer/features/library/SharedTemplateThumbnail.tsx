import { useEffect, useState, type ReactNode } from 'react';
import type { SharedTemplateThumbnail as TemplateThumbnail } from '@cg/shared-ipc';
import type * as StaticScene from '@cg/template-runtime/static-scene';

export type SharedTemplatePreview = TemplateThumbnail | null;

const WIDTH = 80;
const HEIGHT = 45;
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
    const scale = Math.min(WIDTH / width, HEIGHT / height);
    const left = (WIDTH - width * scale) / 2;
    const top = (HEIGHT - height * scale) / 2;
    container.style.transformOrigin = 'top left';
    container.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;

    // Build from validated scene data in a detached document. Nothing in the
    // package supplies scripts, HTML, stylesheets or resource URLs to the frame.
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content =
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'";
    const style = doc.createElement('style');
    style.textContent = `* { box-sizing: border-box } body { margin: 0; overflow: hidden } ${BASELINE_CSS}`;
    doc.head.replaceChildren(policy, style);
    doc.body.replaceChildren(container);
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

import { useEffect, useRef } from 'react';
import { BASELINE_CSS, buildScene } from '@cg/template-runtime/static-scene';
import type { ControlLiveLayoutFrameAttachmentSource } from './controlLiveLayoutFrameAttachments.js';

export function LiveLayoutFrameAttachmentArt({
  source,
}: {
  source: ControlLiveLayoutFrameAttachmentSource;
}): JSX.Element {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;
    const doc = parent.ownerDocument;
    const shadow = parent.shadowRoot ?? parent.attachShadow({ mode: 'open' });
    const baseline = doc.createElement('style');
    baseline.textContent = BASELINE_CSS;
    const { container } = buildScene(source.scene, doc);
    const images = new Map<string, string>();
    const fontFaces: FontFace[] = [];
    let active = true;
    for (const { entry, bytes } of source.assets) {
      if (entry.kind === 'font') {
        const face = new FontFace(`asset-${entry.id}`, new Uint8Array(bytes));
        void face
          .load()
          .then(() => {
            if (active) doc.fonts.add(face);
          })
          .catch(() => undefined);
        fontFaces.push(face);
      } else {
        images.set(
          entry.id,
          URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: entry.mime })),
        );
      }
    }
    for (const node of container.querySelectorAll<HTMLImageElement>('img[data-cg-asset-id]')) {
      const url = images.get(node.dataset.cgAssetId ?? '');
      if (url !== undefined) node.src = url;
    }
    const { width, height } = source.scene.resolution;
    const resize = (): void => {
      container.style.transform = `scale(${parent.clientWidth / width}, ${parent.clientHeight / height})`;
    };
    container.style.transformOrigin = 'top left';
    shadow.replaceChildren(baseline, container);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => {
      active = false;
      observer.disconnect();
      shadow.replaceChildren();
      for (const url of images.values()) URL.revokeObjectURL(url);
      for (const face of fontFaces) doc.fonts.delete(face);
    };
  }, [source]);
  return <span ref={host} className="cg-live-layout-attachment-art" aria-hidden="true" />;
}

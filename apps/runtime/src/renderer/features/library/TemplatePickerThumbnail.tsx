import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Rows3 } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';
import { SharedTemplateThumbnail, type SharedTemplatePreview } from './SharedTemplateThumbnail.js';
import type { ThumbnailLoader } from './templateThumbnailLoader.js';

export function TemplatePickerThumbnail({
  templateId,
  kind,
  slot,
  load,
}: {
  templateId: string;
  kind: 'graphic' | 'bed';
  slot: 'row' | 'detail';
  load: ThumbnailLoader<string> | undefined;
}): JSX.Element {
  const tile = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{
    templateId: string;
    load: ThumbnailLoader<string>;
    preview: SharedTemplatePreview;
  }>();
  useEffect(() => {
    const element = tile.current;
    if (element === null || load === undefined) return;
    let active = true;
    let current: AbortController | undefined;
    const read = (): void => {
      if (!active || current !== undefined) return;
      const request = new AbortController();
      current = request;
      void load(templateId, request.signal).then((preview) => {
        if (!request.signal.aborted) setResult({ templateId, load, preview });
      });
    };
    const observer =
      slot === 'detail' || typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            if (!active) return;
            if (entries.some((entry) => entry.isIntersecting)) {
              read();
            } else if (current !== undefined) {
              current.abort();
              current = undefined;
              setResult(undefined);
            }
          });
    if (observer === null) read();
    else observer.observe(element);
    return () => {
      active = false;
      current?.abort();
      observer?.disconnect();
    };
  }, [templateId, slot, load]);
  const preview =
    result !== undefined && result.load === load && result.templateId === templateId
      ? result.preview
      : null;
  return (
    <span
      ref={tile}
      className={slot === 'row' ? 'cg-tpl-thumb' : 'cg-tpl-preview'}
      data-template-thumbnail={slot}
      aria-hidden="true"
    >
      <SharedTemplateThumbnail
        preview={preview}
        fallback={
          <Icon icon={kind === 'bed' ? Rows3 : LayoutTemplate} size={slot === 'row' ? 22 : 30} />
        }
      />
    </span>
  );
}

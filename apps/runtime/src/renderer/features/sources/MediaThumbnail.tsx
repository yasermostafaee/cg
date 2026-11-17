import { useEffect, useRef, useState } from 'react';
import { MEDIA_THUMBNAIL_DATA_URL_PREFIX } from '@cg/shared-ipc';
import { useModalForeground } from '../../ui/modalForeground.js';
import type { PreviewEngine, PreviewOriginChanged } from './usePreviewOrigins.js';

const MAX_CACHED_POSTERS = 64;
const MAX_POSTER_ATTEMPTS = 3;
const POSTER_RETRY_DELAY_MS = 1_000;

export type MediaThumbnailLoader = ((id: string) => Promise<string | null>) & {
  origin?: (id: string) => PreviewEngine | undefined;
};

/** Reuse poster reads for visible media cards while this picker is open. */
export function createMediaThumbnailLoader(channel?: number): MediaThumbnailLoader {
  const cache = new Map<string, Promise<string | null>>();
  const origins = new Map<string, PreviewEngine>();
  const load: MediaThumbnailLoader = (id) => {
    const cached = cache.get(id);
    if (cached !== undefined) {
      cache.delete(id);
      cache.set(id, cached);
      return cached;
    }
    const first = cache.keys().next().value;
    if (cache.size >= MAX_CACHED_POSTERS && first !== undefined) {
      cache.delete(first);
      origins.delete(first);
    }
    const request = Promise.resolve()
      .then(() =>
        window.cg.sources.mediaThumbnail({ id, ...(channel === undefined ? {} : { channel }) }),
      )
      .then(
        (result) => {
          if (result.ok && result.dataUrl?.startsWith(MEDIA_THUMBNAIL_DATA_URL_PREFIX) === true) {
            if (result.engine === undefined) origins.delete(id);
            else origins.set(id, result.engine);
            return result.dataUrl;
          }
          origins.delete(id);
          return null;
        },
        () => null,
      )
      .then((poster) => {
        if (poster === null && cache.get(id) === request) cache.delete(id);
        return poster;
      });
    cache.set(id, request);
    return request;
  };
  load.origin = (id) => origins.get(id);
  return load;
}

export function MediaThumbnail({
  id,
  load,
  onPreviewEngineChange,
}: {
  id: string | undefined;
  load: MediaThumbnailLoader;
  onPreviewEngineChange?: PreviewOriginChanged | undefined;
}): JSX.Element {
  const foreground = useModalForeground();
  const tile = useRef<HTMLSpanElement>(null);
  const [picture, setPicture] = useState<{ id: string; src: string | null }>();
  const poster = picture?.id === id ? (picture?.src ?? null) : null;
  const [decoded, setDecoded] = useState<{ id: string; engine?: PreviewEngine }>();

  useEffect(() => {
    if (poster === null) setDecoded(undefined);
    onPreviewEngineChange?.(poster !== null && decoded?.id === id ? decoded?.engine : undefined);
  }, [poster, decoded, id, onPreviewEngineChange]);

  useEffect(() => {
    const element = tile.current;
    if (!foreground || id === undefined || element === null || poster !== null) return;
    let current = true;
    let visible = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const accept = (src: string | null): void => {
      if (!current) return;
      setPicture({ id, src });
      if (src !== null) observer?.disconnect();
      else if (visible && attempts < MAX_POSTER_ATTEMPTS)
        retry = setTimeout(read, attempts * POSTER_RETRY_DELAY_MS);
    };
    const read = (): void => {
      if (!current || !visible || attempts >= MAX_POSTER_ATTEMPTS) return;
      attempts++;
      void load(id).then(accept, () => accept(null));
    };
    // The virtual list mounts a few extra rows for scrolling. Read only when one is visible.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries.at(-1)?.isIntersecting === true;
            clearTimeout(retry);
            if (visible) read();
          });
    if (observer === null) {
      visible = true;
      read();
    } else observer.observe(element);
    return () => {
      current = false;
      clearTimeout(retry);
      observer?.disconnect();
    };
  }, [id, load, foreground]);

  return (
    <span
      ref={tile}
      className="cg-input-thumbnail cg-media-thumbnail"
      data-media-thumbnail=""
      aria-hidden="true"
    >
      {poster === null ? (
        'No poster'
      ) : (
        <img
          src={poster}
          alt=""
          onLoad={() => {
            if (id !== undefined) {
              const engine = load.origin?.(id);
              setDecoded({ id, ...(engine === undefined ? {} : { engine }) });
            }
          }}
          onError={() => setPicture(undefined)}
        />
      )}
    </span>
  );
}

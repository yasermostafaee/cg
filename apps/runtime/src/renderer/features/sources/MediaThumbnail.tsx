import { useEffect, useRef, useState } from 'react';
import { MEDIA_THUMBNAIL_DATA_URL_PREFIX } from '@cg/shared-ipc';
import { useModalForeground } from '../../ui/modalForeground.js';

const MAX_CACHED_POSTERS = 64;
const MAX_POSTER_ATTEMPTS = 3;
const POSTER_RETRY_DELAY_MS = 1_000;

export type MediaThumbnailLoader = (id: string) => Promise<string | null>;

/** Reuse poster reads for visible media cards while this picker is open. */
export function createMediaThumbnailLoader(): MediaThumbnailLoader {
  const cache = new Map<string, Promise<string | null>>();
  return (id) => {
    const cached = cache.get(id);
    if (cached !== undefined) {
      cache.delete(id);
      cache.set(id, cached);
      return cached;
    }
    const first = cache.keys().next().value;
    if (cache.size >= MAX_CACHED_POSTERS && first !== undefined) cache.delete(first);
    const request = Promise.resolve()
      .then(() => window.cg.sources.mediaThumbnail({ id }))
      .then(
        (result) =>
          result.ok && result.dataUrl?.startsWith(MEDIA_THUMBNAIL_DATA_URL_PREFIX) === true
            ? result.dataUrl
            : null,
        () => null,
      )
      .then((poster) => {
        if (poster === null && cache.get(id) === request) cache.delete(id);
        return poster;
      });
    cache.set(id, request);
    return request;
  };
}

export function MediaThumbnail({
  id,
  load,
}: {
  id: string | undefined;
  load: MediaThumbnailLoader;
}): JSX.Element {
  const foreground = useModalForeground();
  const tile = useRef<HTMLSpanElement>(null);
  const [picture, setPicture] = useState<{ id: string; src: string | null }>();
  const poster = picture?.id === id ? (picture?.src ?? null) : null;

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
        <img src={poster} alt="" onError={() => setPicture(undefined)} />
      )}
    </span>
  );
}

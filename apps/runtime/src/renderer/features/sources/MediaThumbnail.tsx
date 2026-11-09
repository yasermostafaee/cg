import { useEffect, useRef, useState } from 'react';
import { MEDIA_THUMBNAIL_DATA_URL_PREFIX } from '@cg/shared-ipc';

const MAX_CACHED_POSTERS = 64;

export type MediaThumbnailLoader = (id: string) => Promise<string | null>;

/** Reuse poster reads for Recent and All media while this picker is open. */
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
      );
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
  const tile = useRef<HTMLSpanElement>(null);
  const [picture, setPicture] = useState<{ id: string; src: string | null }>();
  const poster = picture?.id === id ? (picture?.src ?? null) : null;

  useEffect(() => {
    const element = tile.current;
    if (id === undefined || element === null) return;
    let current = true;
    const read = (): void => {
      void load(id).then((src) => {
        if (current) setPicture({ id, src });
      });
    };
    // The virtual list mounts a few extra rows for scrolling. Read only when one is visible.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            read();
          });
    if (observer === null) read();
    else observer.observe(element);
    return () => {
      current = false;
      observer?.disconnect();
    };
  }, [id, load]);

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

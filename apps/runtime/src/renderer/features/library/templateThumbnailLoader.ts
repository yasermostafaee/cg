import type { SharedTemplatePreview } from './SharedTemplateThumbnail.js';

interface ThumbnailResult {
  thumbnail: SharedTemplatePreview;
}

export type ThumbnailLoader<Request> = (
  request: Request,
  signal: AbortSignal,
) => Promise<SharedTemplatePreview>;

const CONCURRENCY = 3;
const CACHE_SIZE = 48;

export function createThumbnailLoader<Request>(
  read: (request: Request) => Promise<ThumbnailResult>,
): ThumbnailLoader<Request> {
  const queue: (() => void)[] = [];
  let running = 0;
  const start = (): void => {
    while (running < CONCURRENCY && queue.length > 0) queue.shift()?.();
  };
  return (request, signal) =>
    new Promise((resolve) => {
      queue.push(() => {
        if (signal.aborted) {
          resolve(null);
          return;
        }
        running += 1;
        void Promise.resolve()
          .then(() => (signal.aborted ? { thumbnail: null } : read(request)))
          .then(
            ({ thumbnail }) => resolve(signal.aborted ? null : thumbnail),
            () => resolve(null),
          )
          .finally(() => {
            running -= 1;
            start();
          });
      });
      start();
    });
}

interface CacheEntry {
  result: Promise<SharedTemplatePreview>;
  controller: AbortController;
  users: number;
  settled: boolean;
}

const readCatalogue = createThumbnailLoader((request: { templateId: string; channel: number }) =>
  window.cg.templates.thumbnail(request),
);

/** A picker catalogue generation owns one cache shared by its visible rows and Details. */
export function createCatalogueThumbnailLoader(channel: number): ThumbnailLoader<string> {
  const entries = new Map<string, CacheEntry>();
  return (templateId, signal) => {
    if (signal.aborted) return Promise.resolve(null);
    let entry = entries.get(templateId);
    if (entry === undefined) {
      const controller = new AbortController();
      const pending: CacheEntry = {
        controller,
        result: readCatalogue({ templateId, channel }, controller.signal),
        users: 0,
        settled: false,
      };
      void pending.result.then(() => {
        pending.settled = true;
        if (entries.size <= CACHE_SIZE) return;
        for (const [key, cached] of entries) {
          if (cached.settled) entries.delete(key);
          if (entries.size <= CACHE_SIZE) break;
        }
      });
      entry = pending;
    }
    // Move the shared entry to the end of the cache each time it is read.
    entries.delete(templateId);
    entries.set(templateId, entry);
    if (!entry.settled) {
      const pending = entry;
      pending.users += 1;
      const release = (): void => {
        pending.users -= 1;
        // A second consumer can take over within the same render, including StrictMode remounts.
        queueMicrotask(() => {
          if (pending.settled || pending.users > 0) return;
          pending.controller.abort();
          if (entries.get(templateId) === pending) entries.delete(templateId);
        });
      };
      signal.addEventListener('abort', release, { once: true });
      void pending.result.then(() => signal.removeEventListener('abort', release));
    }
    return entry.result;
  };
}

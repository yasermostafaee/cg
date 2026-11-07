type Handler = () => void;

let projectUrls: Readonly<Record<string, string>> = {};
let sharedUrls: Readonly<Record<string, string>> = {};
const handlers = new Set<Handler>();

function notify(): void {
  for (const handler of handlers) handler();
}

/** Bridge-neutral snapshots so Preview's template-page type realm never imports Designer IPC. */
export function publishProjectImageUrls(urls: Readonly<Record<string, string>>): void {
  projectUrls = urls;
  notify();
}

export function publishSharedImageUrls(urls: Readonly<Record<string, string>>): void {
  sharedUrls = urls;
  notify();
}

export function imageAssetUrls(): Readonly<Record<string, string>> {
  return { ...projectUrls, ...sharedUrls };
}

export function subscribeImageAssetUrls(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

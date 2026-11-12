import { useSyncExternalStore } from 'react';

interface PreviewBookPage {
  fieldId: string;
  index: number;
  id: string | undefined;
}

const pages = new Map<string, PreviewBookPage>();
const listeners = new Set<() => void>();

/** The page sent to this console's preview frame, used for the Manage pages marker. */
export function recordPreviewBookPage(itemId: string, page?: PreviewBookPage): void {
  const previous = pages.get(itemId);
  if (
    previous?.fieldId === page?.fieldId &&
    previous?.index === page?.index &&
    previous?.id === page?.id
  ) {
    return;
  }
  if (page === undefined) pages.delete(itemId);
  else pages.set(itemId, page);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreviewBookPage(itemId: string, fieldId: string): PreviewBookPage | undefined {
  return useSyncExternalStore(subscribe, () => {
    const page = pages.get(itemId);
    return page?.fieldId === fieldId ? page : undefined;
  });
}

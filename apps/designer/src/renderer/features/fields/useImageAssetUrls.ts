import { useEffect, useState } from 'react';
import { imageThumbnailUrl } from '@cg/ui';
import { imageAssetUrls, subscribeImageAssetUrls } from '../assets/imageAssetUrlRegistry.js';

/** Small, cached project/shared previews; canvas and export keep the original asset URLs. */
export function useImageAssetUrls(): Readonly<Record<string, string>> {
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    let generation = 0;
    const refresh = (): void => {
      const current = ++generation;
      setUrls({});
      for (const [assetId, sourceUrl] of Object.entries(imageAssetUrls())) {
        void imageThumbnailUrl(sourceUrl).then((thumbnailUrl) => {
          if (current !== generation) return;
          setUrls((known) => ({ ...known, [assetId]: thumbnailUrl }));
        });
      }
    };
    const unsubscribe = subscribeImageAssetUrls(refresh);
    refresh();
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, []);
  return urls;
}

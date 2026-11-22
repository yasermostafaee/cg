import { useCallback, useState } from 'react';

export type PreviewEngine = 'A' | 'B';
export type PreviewOriginChanged = (engine: PreviewEngine | undefined) => void;

/** Origins belong to the pictures on this surface, independently of programme authority. */
export function usePreviewOrigins(
  observePicture?: (sourceId: string, engine: PreviewEngine) => void,
) {
  const [origins, setOrigins] = useState<ReadonlyMap<string, PreviewEngine>>(() => new Map());
  const publish = useCallback(
    (sourceId: string, engine: PreviewEngine | undefined): void => {
      if (engine !== undefined) observePicture?.(sourceId, engine);
      setOrigins((previous) => {
        if (previous.get(sourceId) === engine) return previous;
        const next = new Map(previous);
        if (engine === undefined) next.delete(sourceId);
        else next.set(sourceId, engine);
        return next;
      });
    },
    [observePicture],
  );
  return { origins, publish };
}

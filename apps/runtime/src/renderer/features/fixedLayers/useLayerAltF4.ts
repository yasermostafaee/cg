import { useEffect } from 'react';

const requests = new Set<symbol>();

/** The row dispatcher and recorder share one reservation in the Windows console. */
export function useLayerAltF4(armed: boolean): void {
  useEffect(() => {
    if (!armed) return;
    const request = Symbol();
    requests.add(request);
    if (requests.size === 1) window.cg.keyboard?.setLayerAltF4Armed?.(true);
    return () => {
      requests.delete(request);
      if (requests.size === 0) window.cg.keyboard?.setLayerAltF4Armed?.(false);
    };
  }, [armed]);
}

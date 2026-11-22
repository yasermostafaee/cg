import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { useSourcePreviewRoute } from '../../hooks/useProgramTopology.js';
import type { PreviewEngine } from './usePreviewOrigins.js';

type Route = string | undefined;
interface Location {
  route: Route;
  engine: PreviewEngine;
}

class PictureOrigins {
  readonly entries = new Map<string, Location>();
  readonly listeners = new Map<string, Set<() => void>>();

  subscribe(key: string, changed: () => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(changed);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(changed);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  invalidate(key: string, route: Route): void {
    const previous = this.entries.get(key);
    if (previous === undefined || previous.route === route) return;
    this.entries.delete(key);
    this.listeners.get(key)?.forEach((changed) => changed());
  }

  remember(key: string, route: Route, engine: PreviewEngine): void {
    const previous = this.entries.get(key);
    if (previous?.route === route && previous?.engine === engine) return;
    this.entries.delete(key);
    this.entries.set(key, { route, engine });
    if (this.entries.size > 128) {
      const first = this.entries.keys().next().value;
      if (first !== undefined) {
        this.entries.delete(first);
        this.listeners.get(first)?.forEach((changed) => changed());
      }
    }
    this.listeners.get(key)?.forEach((changed) => changed());
  }
}

const originsByBridge = new WeakMap<RuntimeBridge, PictureOrigins>();
const disconnectedOrigins = new PictureOrigins();
function usePictureOriginScope(channel: number | undefined) {
  const bridge = window.cg;
  const route = useSourcePreviewRoute(bridge === undefined ? undefined : channel);
  if (bridge === undefined) return { store: disconnectedOrigins, route, scope: undefined };
  let store = originsByBridge.get(bridge);
  if (store === undefined) {
    store = new PictureOrigins();
    originsByBridge.set(bridge, store);
  }
  const address = bridge.link?.bridgeAddress?.();
  return { store, route, scope: JSON.stringify([address, channel]) };
}

const originKey = (scope: string, sourceId: string): string => JSON.stringify([scope, sourceId]);

/** Publish pictures already obtained by a preview surface. This never opens a stream. */
export function usePictureOriginPublisher(channel: number | undefined) {
  const { store, route, scope } = usePictureOriginScope(channel);
  return useCallback(
    (sourceId: string, engine: PreviewEngine): void => {
      if (channel !== undefined && scope !== undefined) {
        store.remember(originKey(scope, sourceId), route, engine);
      }
    },
    [store, route, scope, channel],
  );
}

/** Last verified picture on the current preview route and source. */
export function useLastPictureOrigin(
  channel: number | undefined,
  sourceId: string | null | undefined,
): PreviewEngine | undefined {
  const { store, route, scope } = usePictureOriginScope(channel);
  const key =
    channel === undefined || scope === undefined || !sourceId
      ? undefined
      : originKey(scope, sourceId);
  const subscribe = useCallback(
    (changed: () => void) => (key === undefined ? () => undefined : store.subscribe(key, changed)),
    [store, key],
  );
  const engine = useSyncExternalStore(subscribe, () => {
    const entry = key === undefined ? undefined : store.entries.get(key);
    return entry?.route === route ? entry?.engine : undefined;
  });
  useEffect(() => {
    if (key !== undefined) store.invalidate(key, route);
  }, [store, key, route]);
  return engine;
}

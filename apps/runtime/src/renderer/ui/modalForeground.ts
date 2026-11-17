import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {
  hasTrapLayer,
  isForegroundTrapElement,
  subscribeTrapLayers,
  type TrapLayer,
} from './focusTrap.js';

/** Portals retain their parent's React context until the new modal supplies its own layer. */
export const ModalLayerContext = createContext<TrapLayer | null>(null);

/** Foreground status for optional picture demand, independent of persistent monitor leases. */
export function useModalForeground(element?: RefObject<HTMLElement>): boolean {
  const layer = useContext(ModalLayerContext);
  const snapshot = useCallback(
    () =>
      element !== undefined
        ? isForegroundTrapElement(element.current)
        : layer === null
          ? !hasTrapLayer()
          : layer.isTop(),
    [element, layer],
  );
  return useSyncExternalStore(subscribeTrapLayers, snapshot, () => true);
}

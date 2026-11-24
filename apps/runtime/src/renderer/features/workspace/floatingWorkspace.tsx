import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  FloatingPanelArrangement,
  FloatingPanelDock,
} from '../../../shared/floating-panel-window.js';
import {
  FLOATING_PANEL_IDS,
  sameFloatingPanelPlacement,
  type FloatingPanelId,
  type FloatingPanelPlacement,
  type FloatingPanelPlacements,
} from '../../../shared/floating-panels.js';
import type { ConfigurableShellLayout } from '../../hooks/useShellLayout.js';
import { localeDirection, useLanguages, useUiText } from '../../i18n/locale.js';
import { PanelDocumentProvider } from '../../ui/PanelDocument.js';
import { Tooltip, type TooltipSurfaces } from '../../ui/Tooltip.js';
import type { FloatingPanelDocuments } from './floatingPanelDocuments.js';

interface FloatingWorkspace {
  documents: FloatingPanelDocuments;
  placements: FloatingPanelPlacements;
  tooltipSurfaces: TooltipSurfaces;
  dockElement: (panel: FloatingPanelId, element: HTMLDivElement | null) => void;
  detach: (panel: FloatingPanelId) => void;
  redock: (panel: FloatingPanelId) => void;
  toggleMaximized: (panel: FloatingPanelId) => void;
  compactLayersHeight: number;
  onCompactLayersHeight: (height: number) => void;
}

const FloatingWorkspaceContext = createContext<FloatingWorkspace | null>(null);

export function useFloatingWorkspace(): FloatingWorkspace | null {
  return useContext(FloatingWorkspaceContext);
}

export function WorkspaceTooltip(): JSX.Element {
  return <Tooltip surfaces={useFloatingWorkspace()?.tooltipSurfaces} />;
}

function boundsOf(element: HTMLDivElement | null | undefined): FloatingPanelDock | null {
  if (element == null || element.getClientRects().length === 0) return null;
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio;
  const left = Math.round(rect.left * scale);
  const top = Math.round(rect.top * scale);
  const width = Math.round(rect.right * scale) - left;
  const height = Math.round(rect.bottom * scale) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

function initialPlacement(dock: FloatingPanelDock | null): FloatingPanelPlacement {
  const scale = window.devicePixelRatio;
  return {
    left: Math.round((window.screenX + 32) * scale) + (dock?.left ?? 0),
    top: Math.round((window.screenY + 56) * scale) + (dock?.top ?? 0),
    width: Math.max(420, dock?.width ?? 680),
    height: Math.max(320, dock?.height ?? 420),
  };
}

export function FloatingWorkspaceProvider({
  documents,
  layout,
  sessionCovered,
  children,
}: {
  documents: FloatingPanelDocuments | null;
  layout: ConfigurableShellLayout;
  sessionCovered: boolean;
  children: ReactNode;
}): JSX.Element {
  const localizeUi = useUiText();
  const titles: Record<FloatingPanelId, string> = {
    pgm: localizeUi('PROGRAM (PGM)'),
    pvw: localizeUi('PREVIEW (PVW)'),
    layers: localizeUi('Layers'),
    inspector: localizeUi('Inspector'),
  };
  const latest = useRef({ layout, sessionCovered, titles });
  latest.current = { layout, sessionCovered, titles };
  const slots = useRef(new Map<FloatingPanelId, HTMLDivElement>());
  const scheduled = useRef(false);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const sent = useRef(new Map<FloatingPanelId, FloatingPanelArrangement>());
  const inFlight = useRef(new Set<FloatingPanelId>());
  const [compactLayersHeight, onCompactLayersHeight] = useState(48);

  const reconcile = useCallback(() => {
    if (documents === null || scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      const state = latest.current;
      const mainModal = document.querySelector('[aria-modal="true"]');
      const narrowInspector = document.querySelector('[data-inspector-scrim]');
      const authGate = document.querySelector('[data-native-workspace-gate] [aria-modal="true"]');
      for (const panel of FLOATING_PANEL_IDS) {
        if (inFlight.current.has(panel)) continue;
        const placement = state.layout.floatingPanels[panel] ?? null;
        const dock = placement === null ? boundsOf(slots.current.get(panel)) : null;
        const visible =
          !state.sessionCovered &&
          authGate === null &&
          (placement !== null ||
            (dock !== null &&
              mainModal === null &&
              (panel === 'inspector' || narrowInspector === null)));
        const request = { panel, title: state.titles[panel], placement, dock, visible };
        if (JSON.stringify(sent.current.get(panel)) === JSON.stringify(request)) continue;
        inFlight.current.add(panel);
        sent.current.set(panel, request);
        void documents.door.arrange(request).then(
          () => {
            inFlight.current.delete(panel);
            reconcile();
          },
          (error: unknown) => {
            inFlight.current.delete(panel);
            sent.current.delete(panel);
            console.warn('CG Control could not arrange a desktop panel.', error);
          },
        );
      }
    });
  }, [documents]);

  const dockElement = useCallback(
    (panel: FloatingPanelId, element: HTMLDivElement | null): void => {
      const previous = slots.current.get(panel);
      if (previous !== undefined) resizeObserver.current?.unobserve(previous);
      if (element === null) slots.current.delete(panel);
      else {
        slots.current.set(panel, element);
        resizeObserver.current?.observe(element);
      }
      reconcile();
    },
    [reconcile],
  );

  useEffect(() => {
    if (documents === null) return;
    const resize = new ResizeObserver(reconcile);
    resizeObserver.current = resize;
    resize.observe(document.documentElement);
    for (const slot of slots.current.values()) resize.observe(slot);
    const dialogs = new MutationObserver(reconcile);
    dialogs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'hidden'],
    });
    window.addEventListener('resize', reconcile);
    const timer = window.setInterval(() => {
      for (const panel of FLOATING_PANEL_IDS) {
        const state = latest.current;
        const placement = state.layout.floatingPanels[panel];
        const arranged = sent.current.get(panel);
        if (
          placement === undefined ||
          arranged === undefined ||
          arranged.placement === null ||
          !sameFloatingPanelPlacement(placement, arranged.placement) ||
          inFlight.current.has(panel)
        )
          continue;
        void documents.door.placement(panel).then(
          (actual) => {
            if (actual === null || latest.current.layout.floatingPanels[panel] !== placement)
              return;
            if (sameFloatingPanelPlacement(placement, actual)) return;
            sent.current.set(panel, { ...arranged, placement: actual });
            latest.current.layout.setFloatingPanel(panel, actual);
          },
          () => undefined,
        );
      }
    }, 300);
    reconcile();
    return () => {
      resize.disconnect();
      resizeObserver.current = null;
      dialogs.disconnect();
      window.removeEventListener('resize', reconcile);
      window.clearInterval(timer);
    };
  }, [documents, reconcile]);

  useEffect(reconcile);

  return (
    <FloatingWorkspaceContext.Provider
      value={
        documents === null
          ? null
          : {
              documents,
              placements: layout.floatingPanels,
              tooltipSurfaces: (box) => {
                // Docked WebViews paint over the main document regardless of CSS z-index.
                // Draw the same bubble at the same physical position in each it crosses.
                const scale = window.devicePixelRatio;
                const left = box.left * scale;
                const top = box.top * scale;
                const right = left + box.width * scale;
                const bottom = top + box.height * scale;
                return FLOATING_PANEL_IDS.flatMap((panel) => {
                  const request = sent.current.get(panel);
                  const dock = request?.dock;
                  const host = documents.panels.get(panel);
                  if (
                    host === undefined ||
                    layout.floatingPanels[panel] !== undefined ||
                    !request?.visible ||
                    dock == null ||
                    right <= dock.left ||
                    bottom <= dock.top ||
                    left >= dock.left + dock.width ||
                    top >= dock.top + dock.height
                  )
                    return [];
                  const localScale = host.window.devicePixelRatio;
                  return [
                    {
                      key: panel,
                      container: host.root.ownerDocument.body,
                      left: (left - dock.left) / localScale,
                      top: (top - dock.top) / localScale,
                      scale: scale / localScale,
                    },
                  ];
                });
              },
              dockElement,
              detach: (panel) =>
                layout.setFloatingPanel(
                  panel,
                  initialPlacement(boundsOf(slots.current.get(panel))),
                ),
              redock: (panel) => {
                layout.setFloatingPanel(panel, null);
                if (layout.focus !== 'none') layout.setFocus('none');
                if (panel === 'pgm' || panel === 'pvw') layout.setMonitorsShown(true, panel);
              },
              toggleMaximized: (panel) => {
                const placement = layout.floatingPanels[panel];
                if (placement !== undefined)
                  layout.setFloatingPanel(panel, { ...placement, maximized: !placement.maximized });
              },
              compactLayersHeight,
              onCompactLayersHeight,
            }
      }
    >
      {children}
    </FloatingWorkspaceContext.Provider>
  );
}

export function FloatingPanelSlot({
  panel,
  compact = false,
}: {
  panel: FloatingPanelId;
  compact?: boolean;
}): JSX.Element {
  const workspace = useFloatingWorkspace();
  const dockElement = workspace?.dockElement;
  const attach = useCallback(
    (element: HTMLDivElement | null) => dockElement?.(panel, element),
    [dockElement, panel],
  );
  return (
    <div
      data-floating-dock={panel}
      data-floating-dock-compact={compact ? '' : undefined}
      ref={attach}
      style={compact ? { height: workspace?.compactLayersHeight } : undefined}
      aria-hidden="true"
    />
  );
}

export function FloatingPanelSurface({
  panel,
  compact = false,
  children,
}: {
  panel: FloatingPanelId;
  compact?: boolean;
  children: ReactNode;
}): ReactNode {
  const workspace = useFloatingWorkspace();
  const host = workspace?.documents.panels.get(panel);
  const { interface: language } = useLanguages();
  const onCompactLayersHeight = workspace?.onCompactLayersHeight;
  useEffect(() => {
    if (host === undefined) return;
    const owner = host.root.ownerDocument.documentElement;
    owner.lang = language;
    owner.dir = localeDirection(language);
  }, [host, language]);
  useEffect(() => {
    if (host === undefined || !compact || onCompactLayersHeight === undefined) return;
    const measure = () =>
      onCompactLayersHeight(Math.ceil(host.root.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(host.root);
    measure();
    return () => observer.disconnect();
  }, [compact, host, onCompactLayersHeight]);
  if (host === undefined || workspace === null) return children;
  const owner = host.root.ownerDocument;
  return createPortal(
    <PanelDocumentProvider
      document={owner}
      modalDocument={workspace.placements[panel] === undefined ? document : owner}
    >
      <div data-floating-panel-content={compact ? 'compact' : 'full'}>
        {children}
        <Tooltip />
      </div>
    </PanelDocumentProvider>,
    host.root,
    panel,
  );
}

import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface PanelDocuments {
  panel: Document;
  modal: Document;
}

export interface PanelOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Project a main-window rectangle into any docked panel documents it crosses. */
export type PanelOverlaySurfaces = (box: PanelOverlayBounds) => readonly {
  key: string;
  container: HTMLElement;
  left: number;
  top: number;
  scale: number;
}[];

const PanelDocumentContext = createContext<PanelDocuments | null>(null);

/** A panel portal shares the console's React tree and owns its own browser document. */
export function PanelDocumentProvider({
  document,
  modalDocument = document,
  children,
}: {
  document: Document;
  /** A docked native pane can present full-size modals in the main document. */
  modalDocument?: Document;
  children: ReactNode;
}): JSX.Element {
  const value = useMemo(
    () => ({ panel: document, modal: modalDocument }),
    [document, modalDocument],
  );
  return <PanelDocumentContext.Provider value={value}>{children}</PanelDocumentContext.Provider>;
}

export function usePanelDocument(): Document {
  return useContext(PanelDocumentContext)?.panel ?? document;
}

export function usePanelModalDocument(): Document {
  return useContext(PanelDocumentContext)?.modal ?? document;
}

/** The DOM constructors and viewport both belong to the surface's document. */
export function panelWindow(document: Document): Window & typeof globalThis {
  return (document.defaultView ?? window) as Window & typeof globalThis;
}

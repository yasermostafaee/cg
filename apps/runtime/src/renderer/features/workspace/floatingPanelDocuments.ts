import { FLOATING_PANEL_IDS, type FloatingPanelId } from '../../../shared/floating-panels.js';
import type { FloatingPanelWindowDoor } from '../../../shared/floating-panel-window.js';
import { applyThemeVars } from '../../theme.js';

export interface FloatingPanelDocument {
  window: Window;
  root: HTMLElement;
}

export interface FloatingPanelDocuments {
  door: FloatingPanelWindowDoor;
  panels: ReadonlyMap<FloatingPanelId, FloatingPanelDocument>;
}

async function waitForPanelRoot(popup: Window): Promise<HTMLElement> {
  const deadline = Date.now() + 5000;
  while (!popup.closed && Date.now() < deadline) {
    const root = popup.document.getElementById('cg-floating-panel-root');
    if (root !== null) return root;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The desktop panel document did not load.');
}

/**
 * Start each panel in its own persistent document before mounting the workspace.
 * Changing the native parent later keeps the DOM, WebRTC and rehearsal decoders live.
 */
export async function openFloatingPanelDocuments(
  door: FloatingPanelWindowDoor | null | undefined,
): Promise<FloatingPanelDocuments | null> {
  if (door == null) return null;
  try {
    const panels = new Map<FloatingPanelId, FloatingPanelDocument>();
    await Promise.all(
      FLOATING_PANEL_IDS.map(async (panel) => {
        const url = new URL('floating-panel.html', document.baseURI);
        url.searchParams.set('panel', panel);
        const popup = window.open(url.href, `cg-floating-${panel}`);
        if (popup === null) throw new Error('The desktop panel window could not open.');
        const root = await waitForPanelRoot(popup);
        const owner = root.ownerDocument;
        for (const style of document.head.querySelectorAll(
          'link[rel="stylesheet"], style[data-vite-dev-id]',
        )) {
          owner.head.append(owner.importNode(style, true));
        }
        applyThemeVars(owner.documentElement);
        panels.set(panel, { window: popup, root });
      }),
    );
    return { door, panels };
  } catch (error) {
    console.warn('CG Control could not prepare the desktop panel windows.', error);
    await door.dispose().catch((failure: unknown) => console.warn(failure));
    return null;
  }
}

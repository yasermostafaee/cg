import { designerStore } from '../../state/store.js';

/**
 * D-191 — the one disk-project opener used by both Landing and File → Open.
 * Cancellation leaves the current view untouched.
 */
export async function openProjectFromDisk(): Promise<void> {
  const result = await window.cg.projects.openDisk();
  if (result.scene !== null) designerStore.setScene(result.scene, null);
}

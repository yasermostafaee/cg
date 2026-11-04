import { designerStore } from '../../state/store.js';

/**
 * D-191 — the ONE disk-project opener used by both Landing and File → Open.
 *
 * `openDisk` owns the picker, package read, asset adoption and writable-handle setup. The shell's
 * only job is to activate the returned scene; cancellation (`scene: null`) leaves the current view
 * untouched.
 */
export async function openProjectFromDisk(): Promise<void> {
  const result = await window.cg.projects.openDisk();
  if (result.scene !== null) designerStore.setScene(result.scene, null);
}

import { act } from 'react-dom/test-utils';

/**
 * Driving the in-app modal from a DOM test.
 *
 * The modal is portalled to `document.body`, so it is NOT inside the panel's container —
 * querying the container for it finds nothing. These helpers look where it actually is.
 */

/** The open dialog, or null. */
export function openDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

/** Click a dialog button by its visible label (e.g. "Cancel", "Remove all"). */
export async function clickDialogButton(label: string): Promise<void> {
  const button = [...(openDialog()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent === label,
  );
  if (button === undefined) {
    throw new Error(`no “${label}” button in the open dialog`);
  }
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

/**
 * Remove any portalled dialog left in `document.body`. A test that never unmounts its root
 * would otherwise leak its scrim into the next one.
 */
export function clearPortals(): void {
  for (const node of document.querySelectorAll('[role="presentation"]')) {
    node.remove();
  }
}

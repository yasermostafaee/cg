import { act } from 'react-dom/test-utils';

/**
 * `PLAYOUT-SOURCES-01` §2.A — driving the ONE source picker from a dom spec, the way an operator
 * does: press the field, and press an option in the panel it opens. The panel is portalled to
 * `body`, so it is found at the document, never inside the dialog the field sits in.
 */

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

/**
 * Press the field; answer the open panel — the NEWEST one: a spec whose earlier render was never
 * unmounted can leave a panel in `body`, and pressing an option in that one would edit a tree
 * nobody is looking at.
 */
export async function openPicker(field: HTMLElement): Promise<HTMLElement> {
  await act(async () => {
    field.click();
    await Promise.resolve();
  });
  await settle();
  const panel = [...document.querySelectorAll<HTMLElement>('[data-popover]')].at(-1);
  if (panel === undefined) throw new Error('the source picker did not open');
  return panel;
}

/** Close the open panel the way an operator does: Escape. */
export async function closePicker(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
  });
  await settle();
}

/** Switch the open panel to one of its tabs. */
export async function pickerTab(panel: HTMLElement, tab: 'Inputs' | 'Media'): Promise<void> {
  const button = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
    (t.textContent ?? '').startsWith(tab),
  );
  if (button === undefined) throw new Error(`no ${tab} tab`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settle();
}

/**
 * Choose `value` through the field: one of the call site's own choices (`None`, a default — its
 * value, often `''`), an input (its catalogue id), or a media item already listed.
 */
export async function choosePickerOption(field: HTMLElement, value: string): Promise<void> {
  const panel = await openPicker(field);
  const find = (): HTMLElement | null =>
    panel.querySelector<HTMLElement>(`[data-picker-choice="${value}"]`) ??
    panel.querySelector<HTMLElement>(`[data-picker-input="${value}"]`) ??
    panel.querySelector<HTMLElement>(`[data-picker-media="${value}"]`);
  let target = find();
  if (target === null && value.startsWith('md-')) {
    await pickerTab(panel, 'Media');
    target = find();
  }
  if (target === null) throw new Error(`no picker option for “${value}”`);
  const chosen = target;
  await act(async () => {
    chosen.click();
    await Promise.resolve();
  });
  await settle();
}

/** The value a picker field holds, as its finder attribute states it. */
export function pickerValue(field: HTMLElement | null): string | undefined {
  return field?.dataset['pickerValue'];
}

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { itemWith, renderLayerRow, slotWith } from './support/layerRow.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * §6 — `LOAD FROM LIBRARY` IS OFF THE OPERATOR'S MENU, AND ITS PICKER IS NOT.
 *
 * The Library stopped being a surface when R-028 folded it into the stack, so a
 * control naming it pointed at nothing the operator could see. But deleting the
 * entry ALONE would have deleted three capabilities with it — re-using a template
 * already imported, R-005's remove-a-template (this dialog is its only list), and
 * simply seeing what this browser holds. The entry was one entry point, not the
 * picker's reason to exist.
 *
 * So `LOAD` opens the picker, and importing a `.vcg` is an option INSIDE it. That
 * last part is not decoration: on a fresh install the list is empty, and a picker
 * that was the only route to importing while telling the operator to import first
 * would be a dead end.
 */

let rendered: Awaited<ReturnType<typeof renderLayerRow>> | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  clearPortals();
  vi.restoreAllMocks();
});

async function pressLoad(): Promise<void> {
  const load = rendered?.container.querySelector<HTMLButtonElement>('button[aria-label="LOAD"]');
  expect(load, 'an unbound row offers LOAD').not.toBeNull();
  await act(async () => {
    load?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderUnboundRow(): Promise<void> {
  rendered = await renderLayerRow({
    item: null,
    template: null,
    slot: slotWith({ binding: null, observed: { kind: 'empty' } }),
  });
}

describe('§6 — LOAD opens the template picker', () => {
  it('opens it, and it offers BOTH re-use and import', async () => {
    await renderUnboundRow();
    // The stub's `templates.list` answers `[]` by default; a template is added
    // below for the re-use half.
    (
      window as unknown as { cg: { templates: { list: () => Promise<unknown[]> } } }
    ).cg.templates.list = () =>
      Promise.resolve([
        { templateId: 'tpl-1', name: 'Lower third', templateType: 'clock', fields: [] },
      ]);

    await pressLoad();

    const dialog = openDialog();
    expect(dialog, 'LOAD must open the picker').not.toBeNull();
    // Re-use: the already-imported template is listed and loadable.
    expect(dialog?.querySelector('[data-template-id="tpl-1"]')).not.toBeNull();
    // Import: the OTHER half, in the same dialog. Without it a fresh install has
    // no way in at all.
    const importBtn = [...(dialog?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.startsWith('Import a .vcg'),
    );
    expect(importBtn, 'importing must be reachable from the picker').toBeDefined();
  });

  it('an EMPTY list points at the import control instead of at a deleted panel', async () => {
    await renderUnboundRow();
    await pressLoad();

    const dialog = openDialog();
    expect(dialog?.textContent).toContain('No templates in this browser yet');
    // The old copy said "The library is empty — import a .vcg first", naming a
    // panel that no longer exists and giving no way to do the thing it advised.
    expect(dialog?.textContent).not.toMatch(/library/i);
    expect(dialog?.textContent).toContain('Import a .vcg');
  });

  it('nothing on the row or in its menu still says LIBRARY', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded') });
    const text = rendered.container.textContent ?? '';
    expect(text).not.toMatch(/library/i);
    for (const btn of rendered.container.querySelectorAll('button')) {
      expect(btn.getAttribute('aria-label') ?? '').not.toMatch(/library/i);
      expect(btn.getAttribute('title') ?? '').not.toMatch(/library/i);
    }
  });
});

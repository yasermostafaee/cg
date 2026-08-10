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

  /**
   * D-137 / C-015 phase 2.4 — ABSENT IS NOT "NONE".
   *
   * A template imported before the Live Source carrier existed says nothing about
   * its holes, and nothing left in the product can answer the question: the scene
   * is discarded after import and the bridge parses no HTML. Reading that silence
   * as "has none" is what would take a template with real holes on air with
   * nothing composited behind them — invisibly, because the hole is transparent.
   *
   * So the row must SAY unknown. These three cases pin all three carrier states
   * against each other; asserting only the unknown one would pass against an
   * implementation that badged every row.
   */
  it('a template with NO Live Source carrier reads re-import-required on its row', async () => {
    await renderUnboundRow();
    (
      window as unknown as { cg: { templates: { list: () => Promise<unknown[]> } } }
    ).cg.templates.list = () =>
      Promise.resolve([
        // No `liveSources` block at all — imported by an older build.
        { templateId: 'tpl-old', name: 'Old', templateType: 'clock', fields: [] },
      ]);

    await pressLoad();

    const row = openDialog()?.querySelector('[data-template-id="tpl-old"]');
    expect(row?.querySelector('[data-live-sources="unknown"]')).not.toBeNull();
    expect(row?.textContent).toContain('Re-import required');
  });

  it('a template that declares NO Live Sources is not badged — empty is a real answer', async () => {
    await renderUnboundRow();
    (
      window as unknown as { cg: { templates: { list: () => Promise<unknown[]> } } }
    ).cg.templates.list = () =>
      Promise.resolve([
        {
          templateId: 'tpl-none',
          name: 'None',
          templateType: 'clock',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources: [],
          },
        },
      ]);

    await pressLoad();

    const row = openDialog()?.querySelector('[data-template-id="tpl-none"]');
    expect(row?.querySelector('[data-live-sources="none"]')).not.toBeNull();
    expect(row?.textContent).not.toContain('Re-import required');
  });

  it('a template that DECLARES a Live Source is not badged either', async () => {
    await renderUnboundRow();
    (
      window as unknown as { cg: { templates: { list: () => Promise<unknown[]> } } }
    ).cg.templates.list = () =>
      Promise.resolve([
        {
          templateId: 'tpl-live',
          name: 'Live',
          templateType: 'clock',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources: [
              {
                elementId: 'el-1',
                sourceId: 'guest-1',
                rect: { x: 0, y: 0, width: 640, height: 360 },
                dynamic: false,
                keyDynamic: false,
              },
            ],
          },
        },
      ]);

    await pressLoad();

    const row = openDialog()?.querySelector('[data-template-id="tpl-live"]');
    expect(row?.querySelector('[data-live-sources="declared"]')).not.toBeNull();
    expect(row?.textContent).not.toContain('Re-import required');
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

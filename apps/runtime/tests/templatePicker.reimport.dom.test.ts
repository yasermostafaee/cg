// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRequest, TemplateInfo, TemplatesRebuildPlanChannel } from '@cg/shared-ipc';
import { useTemplatePicker } from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **THE LIBRARY NAMES, ONCE, THE TEMPLATES THIS CONSOLE CANNOT
 * REBUILD.** Imported before CG Bridge kept their packages (or their rebuild failed), they play the
 * page an earlier runtime built. One line in the picker, each name isolated, ids only on hover —
 * and nothing else about them changes: still listed, still selectable, no chip.
 */

const LEGACY: TemplateInfo = {
  templateId: 'tpl-legacy',
  name: 'زیرنویس قدیمی',
  templateType: 'lower-third',
  fields: [],
};
const OTHER: TemplateInfo = {
  templateId: 'tpl-other',
  name: 'Score bug',
  templateType: 'custom',
  fields: [],
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function installBridge(
  rebuildPlan?: (
    req: ChannelRequest<typeof TemplatesRebuildPlanChannel>,
  ) => Promise<{ rebuild: never[]; reimport: { template: TemplateInfo; reason: string }[] }>,
): void {
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    fixedLayers: { config: () => Promise.resolve(null), onConfigChanged: () => () => undefined },
    stack: { snapshot: () => Promise.resolve([]) },
    templates: {
      list: () => Promise.resolve([LEGACY, OTHER]),
      onChanged: () => () => undefined,
      onActed: () => () => undefined,
      ...(rebuildPlan !== undefined && { rebuildPlan }),
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      assignments: () => Promise.resolve({ assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function openPicker(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let open: (() => void) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () => {
      void pickTemplate('Load onto Layer 20', 'high', {
        rowName: 'Layer 20',
        coord: '2-20',
        channel: 2,
        holding: null,
      });
    };
    return createElement('div', null, pickerDialog);
  }
  const r = root;
  await act(async () => {
    r.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    open?.();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PAGE-REBUILD-01 — the Library’s re-import line', () => {
  it('🔴 names each template that cannot be rebuilt, once, in one line — the names isolated, the ids only on hover', async () => {
    const plan = vi.fn((_req: ChannelRequest<typeof TemplatesRebuildPlanChannel>) =>
      Promise.resolve({
        rebuild: [] as never[],
        reimport: [
          { template: LEGACY, reason: 'no-source' },
          { template: OTHER, reason: 'failed' },
        ],
      }),
    );
    installBridge(plan);
    const dialog = await openPicker();

    const line = dialog.querySelector<HTMLElement>('[data-template-reimport]');
    expect(line?.getAttribute('data-template-reimport')).toBe('2');
    expect(line?.textContent).toContain('Re-import these 2 templates');
    const names = [...(line?.querySelectorAll('bdi') ?? [])].map((b) => b.textContent);
    expect(names).toEqual(['زیرنویس قدیمی', 'Score bug']);
    // Golden rule 11 — the sentence carries names, never ids.
    expect(line?.textContent).not.toContain('tpl-legacy');
    // Asked for THIS row's channel, with this console's runtime.
    expect(plan.mock.calls[0]?.[0].channel).toBe(2);
    expect(plan.mock.calls[0]?.[0].build.runtimeBuild).toMatch(/^[0-9a-f]{16}$/);
    // Nothing else changes for them: both are still listed.
    const listed = [...dialog.querySelectorAll('[data-template-id]')].map((r) =>
      r.getAttribute('data-template-id'),
    );
    expect(listed).toEqual(expect.arrayContaining(['tpl-legacy', 'tpl-other']));
  });

  it('control: with nothing to re-import there is no line', async () => {
    installBridge(() => Promise.resolve({ rebuild: [] as never[], reimport: [] }));
    const dialog = await openPicker();
    expect(dialog.querySelector('[data-template-reimport]')).toBeNull();
    expect(dialog.querySelectorAll('[data-template-id]')).toHaveLength(2);
  });

  it('a bridge that cannot answer (or a stub without the read) shows no line and the picker still works', async () => {
    installBridge();
    const dialog = await openPicker();
    expect(dialog.querySelector('[data-template-reimport]')).toBeNull();
    expect(dialog.querySelectorAll('[data-template-id]')).toHaveLength(2);
  });
});

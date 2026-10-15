/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExportIssue, ExportProgress } from '@cg/shared-ipc';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { CompositionActionBar } from '../src/renderer/features/compositions/CompositionActionBar.js';
import { CG_CONTROL_TOO_LARGE, type ExportResult } from '../src/shared/designer-bridge.js';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-349`) — **AN EXPORT IS ANSWERED, WHATEVER HAPPENS.** The owner pressed
 * Export on a book and saw nothing at all — the press's promise rejected into the void — and a
 * `telavat.vcg` of 0 bytes stayed on disk. This pins what the author now sees, from the press.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  designerStore._reset();
  delete (window as { cg?: unknown }).cg;
});

/** The bridge's export namespace, with the answer held until the test releases it. */
function stubExport(): {
  answer: (r: ExportResult) => Promise<void>;
  progress: (p: ExportProgress) => void;
} {
  let release: (r: ExportResult) => void = () => undefined;
  let progressHandler: (p: ExportProgress) => void = () => undefined;
  (window as unknown as { cg: unknown }).cg = {
    export: {
      runDisk: () => new Promise<ExportResult>((resolve) => (release = resolve)),
      runSingleFileHtml: vi.fn(),
      onProgress: (h: (p: ExportProgress) => void) => {
        progressHandler = h;
        return () => (progressHandler = () => undefined);
      },
    },
  };
  return {
    answer: async (r) => {
      await act(async () => {
        release(r);
        await Promise.resolve();
      });
    },
    progress: (p) => act(() => progressHandler(p)),
  };
}

function render(issues: readonly ExportIssue[] = []): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('telavat', 'custom');
  designerStore.setScene(scene, null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(CompositionActionBar, { issues }));
  });
  return container;
}

const button = (c: HTMLElement, name: string): HTMLButtonElement =>
  c.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;

describe('B-349 — the Export button answers', () => {
  it('🔴 while exporting: both buttons wait, and the pressed one shows how far it is', async () => {
    const bridge = stubExport();
    const c = render();
    act(() => button(c, 'Export .vcg').click());
    // The save dialog is open: the pipeline has not reported yet.
    expect(button(c, 'Export .vcg').textContent).toBe('Exporting…');
    expect(button(c, 'Export .vcg').disabled).toBe(true);
    expect(button(c, 'Export HTML').disabled).toBe(true);
    bridge.progress({ step: 'pack', progress: 0.6 });
    expect(button(c, 'Export .vcg').textContent).toBe('Exporting… 60 %');
    await bridge.answer({ outcome: 'written', filename: 'telavat.vcg', bytes: 29_225_439 });
    expect(button(c, 'Export .vcg').textContent).toBe('Export (.vcg)');
    expect(button(c, 'Export .vcg').disabled).toBe(false);
  });

  it('🔴 a written file is named with its size', async () => {
    const bridge = stubExport();
    const c = render();
    act(() => button(c, 'Export .vcg').click());
    await bridge.answer({ outcome: 'written', filename: 'telavat.vcg', bytes: 29_225_439 });
    expect(designerStore.get().notice).toBe('Exported telavat.vcg · 27.9 MB');
  });

  it('🔴 a failure is a sentence that STAYS, with the element at fault selected', async () => {
    vi.useFakeTimers();
    try {
      const bridge = stubExport();
      const c = render();
      act(() => button(c, 'Export .vcg').click());
      await bridge.answer({
        outcome: 'failed',
        filename: 'telavat.vcg',
        cause: 'page2.png in "Book pages" could not be read from the project',
        elementId: 'sq',
        file: 'removed',
      });
      const said =
        'Export failed: page2.png in "Book pages" could not be read from the project. ' +
        'telavat.vcg was removed; nothing was saved.';
      expect(designerStore.get().notice).toBe(said);
      expect(new Set(designerStore.get().selection)).toEqual(new Set(['sq']));
      // A transient notice clears at 5 s; this one is still there long after.
      act(() => vi.advanceTimersByTime(60_000));
      expect(designerStore.get().notice).toBe(said);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refusal the bridge found before the save dialog is answered like the button’s own: Issues opened, offender selected', async () => {
    const bridge = stubExport();
    const c = render();
    act(() => button(c, 'Export .vcg').click());
    await bridge.answer({
      outcome: 'blocked',
      issues: [
        {
          severity: 'error',
          code: CG_CONTROL_TOO_LARGE,
          message: '"Book pages" makes this template too large for CG Control: 150 pictures.',
          elementId: 'sq',
        },
      ],
    });
    expect(designerStore.get().issuesOpen).toBe(true);
    expect(new Set(designerStore.get().selection)).toEqual(new Set(['sq']));
    expect(designerStore.get().notice).toBe('Export blocked — 1 error. Book pages.');
  });

  it('a closed save dialog says nothing, and the buttons are back', async () => {
    const bridge = stubExport();
    const c = render();
    act(() => button(c, 'Export .vcg').click());
    await bridge.answer({ outcome: 'cancelled' });
    expect(designerStore.get().notice).toBeNull();
    expect(button(c, 'Export .vcg').disabled).toBe(false);
  });
});

describe('B-351 — too large for CG Control refuses the .vcg only', () => {
  it('🔴 the .vcg button is blocked by it; the HTML button, which never goes through CG Bridge, is not', () => {
    stubExport();
    const c = render([
      {
        severity: 'error',
        code: CG_CONTROL_TOO_LARGE,
        message: '"Book pages" makes this template too large for CG Control.',
        elementId: 'sq',
      },
    ]);
    expect(button(c, 'Export .vcg').getAttribute('data-export-blocked')).toBe('errors');
    expect(button(c, 'Export HTML').getAttribute('data-export-blocked')).toBeNull();
  });
});

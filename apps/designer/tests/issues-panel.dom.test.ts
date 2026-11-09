/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExportIssue } from '@cg/shared-ipc';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { IssuesPanel } from '../src/renderer/features/issues/IssuesPanel.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { designerStore } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

describe('B-366 — internal element ids stay out of Issues copy', () => {
  it('uses the hidden element id only when the author activates the navigation button', () => {
    const elementId = 'el-1793551207639';
    const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
      'issues',
      'custom',
    );
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultLiveSource(elementId, 459, 327));
    designerStore.setSelection([]);
    const issue: ExportIssue = {
      severity: 'error',
      code: 'live-source-unset',
      message: 'The unnamed Plate at (459, 327) has no source.',
      elementId,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onPick = vi.fn();
    act(() =>
      root?.render(createElement(IssuesPanel, { issues: [issue], embedded: true, onPick })),
    );

    expect(container.textContent).toContain('The unnamed Plate at (459, 327)');
    expect(container.textContent).not.toContain(elementId);
    const message = [...container.querySelectorAll('span')].find(
      (span) => span.textContent === issue.message,
    );
    const action = container.querySelector<HTMLButtonElement>('button[aria-label="Go to element"]');
    if (message === undefined || action === null) throw new Error('no issue message or action');
    act(() => message.click());
    expect(onPick).not.toHaveBeenCalled();
    expect([...designerStore.get().selection]).toEqual([]);

    act(() => action.click());
    expect(onPick).toHaveBeenCalledOnce();
    expect([...designerStore.get().selection]).toEqual([elementId]);
  });
});

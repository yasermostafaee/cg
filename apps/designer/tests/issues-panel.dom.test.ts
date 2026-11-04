/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
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
  it('keeps the element id for click-to-select without rendering it to the author', () => {
    const elementId = 'el-1793551207639';
    const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
      'issues',
      'custom',
    );
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultLiveSource(elementId, 459, 327));
    const issue: ExportIssue = {
      severity: 'error',
      code: 'live-source-unset',
      message: 'The unnamed Plate at (459, 327) has no source.',
      elementId,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(createElement(IssuesPanel, { issues: [issue], embedded: true })));

    expect(container.textContent).toContain('The unnamed Plate at (459, 327)');
    expect(container.textContent).not.toContain(elementId);
    const row = container.querySelector<HTMLElement>('[role="button"]');
    if (row === null) throw new Error('no issue row');
    act(() => row.click());
    expect([...designerStore.get().selection]).toEqual([elementId]);
  });
});

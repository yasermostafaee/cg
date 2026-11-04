/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { LandingView } from '../src/renderer/features/shell/LandingView.js';
import { TopToolbar } from '../src/renderer/features/shell/TopToolbar.js';
import { designerStore } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => designerStore._reset());

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  designerStore._reset();
});

async function mount(element: JSX.Element, openDisk: () => Promise<unknown>): Promise<HTMLElement> {
  (window as unknown as { cg: unknown }).cg = {
    projects: {
      recent: () => Promise.resolve([]),
      starters: () => Promise.resolve([]),
      openDisk,
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
  });
  return container;
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (result === null) throw new Error(`Missing ${label} button`);
  return result;
}

describe('D-191 — import an existing project directly from Landing', () => {
  it('places Import project beside New project and opens through the disk-project path', async () => {
    const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
      'Imported from Landing',
      'lower-third',
    );
    const openDisk = vi.fn().mockResolvedValue({ scene, handleKey: scene.id });
    const host = await mount(createElement(LandingView), openDisk);
    const create = button(host, 'New project');
    const importProject = button(host, 'Import project');

    expect(importProject.parentElement).toBe(create.parentElement);
    await act(async () => {
      importProject.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDisk).toHaveBeenCalledTimes(1);
    expect(designerStore.get().scene?.name).toBe('Imported from Landing');
    expect(designerStore.get().view).toBe('studio');
  });

  it('leaves Landing unchanged when the project picker is cancelled', async () => {
    const openDisk = vi.fn().mockResolvedValue({ scene: null, handleKey: null });
    const host = await mount(createElement(LandingView), openDisk);

    await act(async () => {
      button(host, 'Import project').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDisk).toHaveBeenCalledTimes(1);
    expect(designerStore.get().scene).toBeNull();
    expect(designerStore.get().view).toBe('landing');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(button(host, 'New project')).toBeTruthy();
  });

  it('keeps File → Open on the same disk-project operation', async () => {
    const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
      'Imported from File menu',
      'lower-third',
    );
    const openDisk = vi.fn().mockResolvedValue({ scene, handleKey: scene.id });
    const host = await mount(
      createElement(TopToolbar, { scene: null, projectPath: null }),
      openDisk,
    );
    const file = [...host.querySelectorAll('button')].find((item) => item.textContent === 'File');
    if (file === undefined) throw new Error('Missing File menu');
    act(() => file.click());
    const open = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.startsWith('Open'),
    );
    if (open === undefined) throw new Error('Missing Open menu item');

    await act(async () => {
      open.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDisk).toHaveBeenCalledTimes(1);
    expect(designerStore.get().scene?.name).toBe('Imported from File menu');
  });
});

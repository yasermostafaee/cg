/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Scene } from '@cg/shared-schema';
import { CLOSE_REQUESTED_EVENT, closeGuardDoor, type ShellInvoke } from '@cg/gesture';

/**
 * 🔴 `D-162` — **CG DESIGNER NEVER LOSES UNSAVED WORK SILENTLY.**
 *
 * `CloseGuard` is mounted with the REAL `closeGuardDoor` (`@cg/gesture`) over a recorded shell, so
 * every case runs the whole chain the installed app runs: the shell's ask (`cg:close-requested` on
 * the window) → the door → the guard → the dialog → `close_window_now`. Only the Rust half is not
 * here; it has its own tests (`src-tauri/src/close_guard.rs`).
 *
 * The first case is the golden-rule-6 proof the item asks for: the browser's leave prompt and the
 * shell's close are driven against the SAME store states and must give the same answer in each —
 * which they can only do while both ask the one predicate, `hasUnsavedChanges`.
 */

const { designerStore, hasUnsavedChanges } = await import('../src/renderer/state/store.js');
const { CloseGuard } = await import('../src/renderer/features/shell/CloseGuard.js');
const { COULD_NOT_WRITE } = await import('../src/renderer/features/shell/UnsavedChangesDialog.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-close-guard',
    name: 'خبر فوری — Breaking',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' },
  } as unknown as Scene;
}

type SaveResult =
  | { ok: true; filename: string }
  | { ok: false; filename: null; reason?: 'write-failed' };

let said: string[];
let saveDisk: ReturnType<typeof vi.fn<(req: { askPath: boolean }) => Promise<SaveResult>>>;
let host: HTMLDivElement;
let root: Root;

/** Install `window.cg` with the real door over a recorded shell (`null` = a browser). */
function installBridge(shell: boolean): void {
  const invoke: ShellInvoke = (command) => {
    said.push(command);
    return Promise.resolve(null);
  };
  (window as unknown as { cg: unknown }).cg = {
    closeGuard: closeGuardDoor(shell ? invoke : null, window),
    projects: { saveDisk },
  };
}

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(CloseGuard));
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
}

/** The shell asks about a close, as `close_window.rs` does: one event on the page's window. */
async function shellAsksToClose(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event(CLOSE_REQUESTED_EVENT));
    await flush();
  });
}

/** The browser asks whether to leave. `true` when the page asked to stay (the prompt shows). */
function browserWouldPrompt(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="dialog"][aria-label="Unsaved changes"]');
const dialogs = (): number => document.querySelectorAll('[role="dialog"]').length;

function button(label: string): HTMLButtonElement {
  const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`no ${label} button in the dialog`);
  return found;
}

function edit(): void {
  designerStore.renameProject('خبر فوری — Breaking (edited)');
  designerStore.markHistoryBoundary();
}

beforeEach(() => {
  said = [];
  saveDisk = vi.fn<(req: { askPath: boolean }) => Promise<SaveResult>>(() =>
    Promise.resolve({ ok: true, filename: 'breaking.cgproj' }),
  );
  designerStore._reset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const node of document.querySelectorAll('[role="dialog"]')) node.parentElement?.remove();
  designerStore._reset();
  vi.restoreAllMocks();
});

describe('D-162 — one predicate drives both doors', () => {
  it('🔴 the leave prompt and the window close give the SAME answer for every document state', async () => {
    installBridge(true);
    mount();
    // The shell was told the page holds the close, once.
    expect(said).toEqual(['close_guard']);

    const states: { name: string; set: () => void; loses: boolean }[] = [
      { name: 'no project open', set: () => designerStore.setScene(null, null), loses: false },
      {
        name: 'a project, unchanged',
        set: () => designerStore.setScene(scene(), null),
        loses: false,
      },
      {
        name: 'a project, edited',
        set: () => {
          designerStore.setScene(scene(), null);
          edit();
        },
        loses: true,
      },
    ];
    for (const state of states) {
      act(state.set);
      said = [];
      expect(hasUnsavedChanges(designerStore.get()), state.name).toBe(state.loses);

      const prompts = browserWouldPrompt();
      await shellAsksToClose();
      const asked = dialog() !== null;
      const closedAtOnce = said.includes('close_window_now');

      expect({ state: state.name, prompts }).toEqual({ state: state.name, prompts: state.loses });
      expect({ state: state.name, asked }).toEqual({ state: state.name, asked: state.loses });
      expect({ state: state.name, closedAtOnce }).toEqual({
        state: state.name,
        closedAtOnce: !state.loses,
      });
      // Every ask is acknowledged, so the shell keeps asking instead of letting a close through.
      expect(said[0]).toBe('close_request_seen');
      if (asked) act(() => button('Cancel').click());
    }
  });

  it('in a browser there is no shell: nothing is held, and the leave prompt still asks', async () => {
    installBridge(false);
    mount();
    act(() => {
      designerStore.setScene(scene(), null);
      edit();
    });
    expect(browserWouldPrompt()).toBe(true);
    await shellAsksToClose();
    expect(dialog()).toBeNull();
    expect(said).toEqual([]);
  });
});

describe('D-162 — the Unsaved changes dialog', () => {
  beforeEach(() => {
    installBridge(true);
    mount();
    act(() => {
      designerStore.setScene(scene(), null);
      edit();
    });
    said = [];
  });

  it('names the project, offers Save / Don’t save / Cancel, and puts focus on Cancel', async () => {
    await shellAsksToClose();
    const d = dialog();
    expect(d, 'the dialog opened').not.toBeNull();
    expect(d?.querySelector('h2')?.textContent).toBe('Unsaved changes');
    expect(d?.querySelector('[data-unsaved-project] bdi')?.textContent).toBe(
      'خبر فوری — Breaking (edited)',
    );
    const footer = [...(d?.querySelectorAll('button') ?? [])]
      .map((b) => b.textContent?.trim())
      .filter((t) => t === 'Save' || t === "Don't save" || t === 'Cancel');
    expect(footer).toEqual(['Save', "Don't save", 'Cancel']);
    // A stray Enter presses whatever has focus: it must be the button that keeps the work.
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    // The window was held, not closed.
    expect(said).toEqual(['close_request_seen']);
  });

  it('Cancel keeps the window open; a second close then asks again', async () => {
    await shellAsksToClose();
    act(() => button('Cancel').click());
    expect(dialog()).toBeNull();
    expect(said).not.toContain('close_window_now');
    await shellAsksToClose();
    expect(dialog()).not.toBeNull();
  });

  it('Escape keeps the window open', async () => {
    await shellAsksToClose();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(said).not.toContain('close_window_now');
  });

  it('a close asked while the dialog is open does not stack a second dialog', async () => {
    await shellAsksToClose();
    await shellAsksToClose();
    await shellAsksToClose();
    expect(dialogs()).toBe(1);
    expect(said.filter((c) => c === 'close_request_seen')).toHaveLength(3);
  });

  it("Don't save closes the window, and saves nothing", async () => {
    await shellAsksToClose();
    await act(async () => {
      button("Don't save").click();
      await flush();
    });
    expect(said).toContain('close_window_now');
    expect(saveDisk).not.toHaveBeenCalled();
  });

  it('Save saves, then closes the window', async () => {
    await shellAsksToClose();
    await act(async () => {
      button('Save').click();
      await flush();
    });
    expect(saveDisk).toHaveBeenCalledTimes(1);
    expect(saveDisk.mock.calls[0]?.[0].askPath).toBe(false);
    expect(hasUnsavedChanges(designerStore.get()), 'saved').toBe(false);
    expect(said).toContain('close_window_now');
  });

  it('a Save that fails keeps the window open and shows the reason', async () => {
    saveDisk.mockImplementation(() => Promise.reject(new Error('The disk is full.')));
    await shellAsksToClose();
    await act(async () => {
      button('Save').click();
      await flush();
    });
    expect(said).not.toContain('close_window_now');
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe('The disk is full.');
    expect(hasUnsavedChanges(designerStore.get()), 'still unsaved').toBe(true);
    expect(button('Cancel').disabled, 'the dialog can be answered again').toBe(false);
  });

  it('a write that fails asks where to save; cancelling that keeps the window open, the reason shown', async () => {
    saveDisk
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: false, filename: null, reason: 'write-failed' }),
      )
      .mockImplementationOnce(() => Promise.resolve({ ok: false, filename: null }));
    await shellAsksToClose();
    await act(async () => {
      button('Save').click();
      await flush();
    });
    expect(saveDisk.mock.calls.map((c) => c[0].askPath)).toEqual([false, true]);
    expect(said).not.toContain('close_window_now');
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(COULD_NOT_WRITE);
  });
});

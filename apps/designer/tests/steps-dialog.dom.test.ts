/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ClockElement, CountdownSteps, Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultClock, defaultShape } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { StepsDialogHost } from '../src/renderer/features/inspector/StepsDialog.js';
import {
  addStep,
  duplicateStep,
  moveStep,
  presetSteps,
} from '../src/renderer/features/inspector/countdown-steps.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-H` — step editing moved from the Inspector into the Steps dialog;
 * the behaviour did not change. The Inspector keeps a summary; the dialog adds, reorders, duplicates
 * and deletes steps, adds and deletes changes — each ONE undo step — through `⋯` menus of WORDS;
 * the rehearse strip shows a step on the canvas while the dialog is open.
 * (Fit at 1280 × 720, 200 % text and RTL, and the drag, are measured in a real browser —
 * `tests/e2e/steps-dialog.spec.ts`.)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noUnsub = (): void => undefined;
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

const clock = (): ClockElement =>
  projected().layers[0]?.children.find((c) => c.id === 'c1') as ClockElement;

/** A countdown `c1` with the preset, a rectangle `s1`, and the history marked. */
function seed(steps: CountdownSteps = presetSteps('c1')): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'steps',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultClock('c1', 0, 0));
  designerStore.updateElement('c1', {
    mode: 'countdown',
    target: { kind: 'duration', ms: 3_600_000 },
    steps,
  } as Partial<Element>);
  designerStore.addElement(defaultShape('s1', 100, 100));
  designerStore.markHistoryBoundary();
}

function renderClock(): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  // The Steps dialog lives at the app root: its host is mounted beside the Inspector section.
  act(() =>
    root?.render(
      createElement(
        Fragment,
        null,
        createElement(StyleSection, { element: clock(), selectedKeyframe: null }),
        createElement(StepsDialogHost),
      ),
    ),
  );
  return container;
}

const click = (el: HTMLElement): void => act(() => el.click());
const key = (el: HTMLElement, k: string): void =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });

function q<T extends HTMLElement>(host: ParentNode, selector: string): T {
  const el = host.querySelector<T>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  return el;
}

function openDialog(): HTMLElement {
  click(q<HTMLButtonElement>(renderClock(), '[data-testid="steps-edit"]'));
  return q<HTMLElement>(document.body, '[role="dialog"]');
}

/** Open a `⋯` menu and choose the row whose accessible name is `name`. */
function chooseFromMenu(trigger: HTMLElement, name: string): void {
  click(trigger);
  click(q<HTMLButtonElement>(document.body, `[role="menuitem"][aria-label="${name}"]`));
}

const names = (): string[] => (clock().steps?.steps ?? []).map((s) => s.name);
const thresholds = (): number[] => (clock().steps?.steps ?? []).map((s) => s.atMs);

describe('-H §1 — the Inspector keeps a SUMMARY only', () => {
  it('🔴 one line per step and “Edit steps…” — no inline editor, no bare icon', () => {
    seed();
    const host = renderClock();
    const lines = [...host.querySelectorAll<HTMLElement>('[data-step-line]')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(lines).toEqual([
      '60 min · ≤ 60 min · 1 change',
      '30 min · ≤ 30 min · 1 change',
      '10 min · ≤ 10 min · 1 change',
    ]);
    const section = q<HTMLElement>(host, '[data-testid="countdown-steps"]');
    // Pinned as ABSENCES — the direction this regresses in.
    expect(section.querySelector('input[aria-label="when"]')).toBeNull();
    expect(section.querySelector('[data-change]')).toBeNull();
    expect(section.querySelector('[aria-label^="Remove"]')).toBeNull();
    expect(section.querySelector('[data-testid="steps-preset"]')).toBeNull();
    expect(q<HTMLButtonElement>(section, '[data-testid="steps-edit"]').textContent).toBe(
      'Edit steps…',
    );
  });
});

describe('-H §2 — the Steps dialog', () => {
  it('🔴 ↑ / ↓ on a step’s handle reorders it — the thresholds stay in order — as ONE undo step', () => {
    seed();
    const dialog = openDialog();
    const handle = q<HTMLElement>(dialog, '[data-step="0"] [data-step-handle]');
    expect(handle.getAttribute('aria-label')).toBe('Move step “60 min”');
    key(handle, 'ArrowDown');
    expect(names()).toEqual(['30 min', '60 min', '10 min']);
    expect(thresholds()).toEqual([3_600_000, 1_800_000, 600_000]);
    // The moved step keeps its changes.
    expect(clock().steps?.steps[1]?.changes[0]?.value).toBe('#ffd600');
    designerStore.undo();
    expect(names()).toEqual(['60 min', '30 min', '10 min']);
  });

  it('🔴 Duplicate step and Delete step are WORDS in the ⋯ menu; a delete says so with its own Undo', () => {
    seed();
    const dialog = openDialog();
    const menu = q<HTMLElement>(dialog, '[data-testid="steps-row-menu-0"]');
    expect(menu.getAttribute('aria-label')).toBe('Actions for step “60 min”');
    expect(menu.getAttribute('title')).toBe('Actions for step “60 min”');
    chooseFromMenu(menu, 'Duplicate step “60 min”');
    expect(names()).toEqual(['60 min', '60 min copy', '30 min', '10 min']);
    expect(thresholds()).toEqual([3_600_000, 2_700_000, 1_800_000, 600_000]);
    designerStore.undo();
    expect(names()).toEqual(['60 min', '30 min', '10 min']);

    chooseFromMenu(
      q<HTMLElement>(dialog, '[data-testid="steps-row-menu-1"]'),
      'Delete step “30 min”',
    );
    expect(names()).toEqual(['60 min', '10 min']);
    const notice = q<HTMLElement>(dialog, '[data-testid="steps-notice"]');
    expect(notice.textContent).toContain('Deleted step “30 min”.');
    const undo = [...notice.querySelectorAll('button')].find((b) => b.textContent === 'Undo');
    if (undo === undefined) throw new Error('no Undo');
    click(undo);
    expect(names()).toEqual(['60 min', '30 min', '10 min']);
  });

  it('🔴 Add step, Add change and Delete change (by its ⋯ menu) — each one undo step', () => {
    seed();
    const dialog = openDialog();
    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-add"]'));
    expect(names()).toEqual(['60 min', '30 min', '10 min', 'Step 4']);
    expect(thresholds()[3]).toBe(300_000);
    // The new step is selected; give it a change.
    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-add-change"]'));
    expect(clock().steps?.steps[3]?.changes).toHaveLength(1);
    const row = q<HTMLElement>(dialog, '[data-change="3:0"]');
    const trigger = q<HTMLElement>(row, '[aria-haspopup="menu"]');
    expect(trigger.getAttribute('aria-label')).toMatch(/^Actions for change: /);
    chooseFromMenu(
      trigger,
      trigger.getAttribute('aria-label')?.replace('Actions for', 'Delete') ?? '',
    );
    expect(clock().steps?.steps[3]?.changes).toHaveLength(0);
    designerStore.undo();
    expect(clock().steps?.steps[3]?.changes).toHaveLength(1);
    designerStore.undo();
    expect(clock().steps?.steps[3]?.changes).toHaveLength(0);
    designerStore.undo();
    expect(names()).toEqual(['60 min', '30 min', '10 min']);
  });

  it('🔴 an undo clears the selection and swaps the Inspector — the dialog stays open', () => {
    seed();
    designerStore.setSelection(['c1']);
    const dialog = openDialog();
    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-add"]'));
    expect(names()).toHaveLength(4);
    // Unmount the Inspector section the dialog was opened from, as the swap does.
    act(() => root?.render(createElement(StepsDialogHost)));
    act(() => designerStore.undo());
    expect(designerStore.get().selection.size).toBe(0);
    expect(names()).toHaveLength(3);
    const still = q<HTMLElement>(document.body, '[role="dialog"]');
    expect(still.querySelectorAll('[data-step]:not([data-step="b"])')).toHaveLength(3);
  });

  it('Escape inside an open ⋯ menu closes the MENU — the dialog stays', () => {
    seed();
    const dialog = openDialog();
    click(q<HTMLElement>(dialog, '[data-testid="steps-row-menu-0"]'));
    const item = q<HTMLElement>(document.body, '[role="menuitem"]');
    key(item, 'Escape');
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('🔴 the rehearse strip shows a step on the canvas while the dialog is open; Done hands it back to live', () => {
    seed();
    const dialog = openDialog();
    const strip = q<HTMLElement>(dialog, '[data-testid="steps-rehearse"]');
    expect([...strip.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Live',
      'Default',
      '60 min',
      '30 min',
      '10 min',
    ]);
    click(q<HTMLButtonElement>(strip, '[data-rehearse="1"]'));
    expect(designerStore.get().stepRehearsal).toEqual({ clockId: 'c1', step: 1 });
    expect(q<HTMLButtonElement>(strip, '[data-rehearse="1"]').getAttribute('aria-pressed')).toBe(
      'true',
    );
    const done = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Done');
    if (done === undefined) throw new Error('no Done');
    click(done);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(designerStore.get().stepRehearsal).toBeNull();
    // Nothing of the rehearsal reached the scene.
    expect(JSON.stringify(projected())).not.toContain('stepRehearsal');
  });

  it('a composition instance’s show / hide reads as its own entrance / exit', () => {
    seed({
      steps: [
        {
          name: 'Step 1',
          atMs: 60_000,
          changes: [{ elementId: 'i1', property: 'visible', value: true }],
        },
      ],
    });
    designerStore.addElement({
      ...(defaultShape('i1', 0, 0) as Element),
      name: 'Warn',
      type: 'composition',
      compositionId: 'missing',
    } as unknown as Element);
    const dialog = openDialog();
    const value = q<HTMLSelectElement>(dialog, '[data-change="0:0"] select[aria-label="value"]');
    expect([...value.options].map((o) => o.textContent)).toEqual([
      'Hide (exit)',
      'Show (entrance)',
    ]);
  });
});

describe('-H — the step operations behind the dialog', () => {
  const ladder = (...at: number[]): CountdownSteps => ({
    steps: at.map((atMs, i) => ({ name: `S${String(i)}`, atMs, changes: [] })),
  });

  it('a move stays inside its run: never across At zero, never onto Before', () => {
    const steps = ladder(600_000, 300_000, 0, -60_000, -120_000);
    expect(moveStep(steps, 0, 2)).toBe(steps); // onto At zero
    expect(moveStep(steps, 1, 3)).toBe(steps); // across zero
    expect(moveStep(steps, 2, 1)).toBe(steps); // At zero is pinned
    const after = moveStep(steps, 4, 3);
    expect(after.steps.map((s) => s.name)).toEqual(['S0', 'S1', 'S2', 'S4', 'S3']);
    expect(after.steps.map((s) => s.atMs)).toEqual([600_000, 300_000, 0, -60_000, -120_000]);
  });

  it('a duplicate needs a free whole second between its step and the next; At zero has none', () => {
    expect(duplicateStep(ladder(2000, 1000), 0)).toBeNull();
    expect(duplicateStep(ladder(60_000, 0), 1)).toBeNull();
    expect(duplicateStep(ladder(1000), 0)).toBeNull(); // half-way to zero is zero
    expect(duplicateStep(ladder(-60_000), 0)?.steps.map((s) => s.atMs)).toEqual([
      -60_000, -120_000,
    ]);
  });

  it('a new step lands after the last threshold above zero, before At zero', () => {
    const { steps, index } = addStep(ladder(600_000, 0, -60_000));
    expect(index).toBe(1);
    expect(steps.steps.map((s) => s.atMs)).toEqual([600_000, 300_000, 0, -60_000]);
  });
});

describe('the owner, 2026-10-15 — the steps’ DEFAULT colours, and a picker above the dialog', () => {
  it('🔴 the Default row is always first; choosing it and Add change gives the countdown’s own text colour — ONE undo step; Clear default removes it', () => {
    seed();
    const dialog = openDialog();
    const rows = [...dialog.querySelectorAll<HTMLElement>('[data-step]')];
    expect(rows[0]?.dataset['step']).toBe('b');
    expect(rows[0]?.textContent).toContain('Default');
    expect(rows[0]?.textContent).toContain('before the first step');
    // Nothing to clear yet, so no menu — and the old "+ Before" button is gone.
    expect(dialog.querySelector('[data-testid="steps-row-menu-b"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="steps-add-before"]')).toBeNull();

    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-row-b"]'));
    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-add-change"]'));
    expect(clock().steps?.before).toEqual({
      name: 'Default',
      changes: [{ elementId: 'c1', property: 'textColor', value: '#d50000' }],
    });
    designerStore.undo();
    expect(clock().steps?.before).toBeUndefined();

    click(q<HTMLButtonElement>(dialog, '[data-testid="steps-add-change"]'));
    chooseFromMenu(
      q<HTMLElement>(dialog, '[data-testid="steps-row-menu-b"]'),
      'Clear default “Default”',
    );
    expect(clock().steps?.before).toBeUndefined();
    expect(q<HTMLElement>(dialog, '[data-testid="steps-notice"]').textContent).toContain(
      'Cleared the default.',
    );
  });

  it('🔴 Escape while a popover opened from the dialog is open closes the POPOVER — the dialog stays', () => {
    seed();
    openDialog();
    // A popover is portaled to the body, outside the dialog (the colour picker does so).
    const popover = document.createElement('div');
    popover.setAttribute('data-cg-popover', '');
    document.body.appendChild(popover);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    popover.remove();
    // The control: with no popover, Escape closes the dialog as it always did.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { DEFAULT_MONITORS_SHOWN } from '../src/renderer/hooks/useShellLayout.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `MONITORS-01` — THE BOOT STATE, AND THE ONE THING THAT MUST SURVIVE IT.
 *
 * The console now boots with the monitor strip FOLDED AWAY. The reason is what the two panes
 * actually render, traced in `design.md` §19: PGM (`MonitorPanel`) is a fixed empty
 * placeholder for `C-016`, which is unbuilt and whose own acceptance says its panel would be
 * OFF by default; PVW (`PreviewPanel` → `RehearsalStage`) is a LOCAL browser render of the
 * rehearsing rows through `@cg/template-runtime`, and `R-022` is explicit that nothing is ever
 * sent to CasparCG. Neither is a picture of the channel, so neither earns 247.2 px and three
 * rows of the only surface that says what IS on air.
 *
 * ── WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT ───────────────────────────
 *
 * A default that hides a surface is only defensible while the surface still announces itself.
 * So the subject here is the WIRING of that announcement on the whole `App`: with the strip
 * folded, is there still exactly one control, in the header, that names the monitors in
 * words and says which state it is in — and does pressing it produce the strip.
 *
 * ⚠ IT MAKES NO CLAIM ABOUT WHAT IS ON SCREEN. jsdom has no layout, so `toBeVisible`-shaped
 * questions are unanswerable here and a geometry assertion would pass against a header of any
 * shape at all (golden rule 12c). VISIBILITY, containment in the header and the button's box
 * are asserted in a real engine by `shell-chrome.spec.ts` §B4. The split is deliberate: this
 * half runs on every gate, that half runs where the pixels are.
 *
 * ⚠ AND IT IS NOT A SECOND COPY OF THE FLAG'S OWN TESTS. `shellLayout.monitorsShown.dom.test.ts`
 * owns the hook — the axis, `reset()`, and A13's non-persistence. This file owns only what the
 * shell DOES with it.
 */

// jsdom has no ResizeObserver; nothing asserted here is a box.
class NoopResizeObserver {
  observe(): void {
    /* measured for real in the browser */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = 74;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;

/** Let every pending snapshot pull and push settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function strip(): Element | null {
  return document.querySelector('[data-monitor-strip]');
}

/**
 * Every control that offers the monitors, however it is labelled. Queried as a SET rather
 * than as one element on purpose: "there is exactly one" is half of what makes the header the
 * place the operator learns to look, and a second copy on another bar would pass a
 * single-element query silently.
 */
function toggles(): HTMLButtonElement[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Hide monitors"], button[aria-label="Show monitors"]',
    ),
  ];
}

function theToggle(): HTMLButtonElement {
  const all = toggles();
  expect(all, 'exactly one monitors toggle in the whole shell').toHaveLength(1);
  return all[0] as HTMLButtonElement;
}

async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
    await flush();
  });
}

beforeEach(async () => {
  // The offline mock, armed as the E2E harness arms it: test mode plus the declared bank,
  // so the shell has rows and renders its real chrome.
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-mon',
      name: 'monitors fixture',
      sourceFileName: 'mon.vcg',
      templateType: 'lower-third',
      fields: [{ id: 'anchor', label: 'Anchor', type: 'text', required: false, default: '' }],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  const res = await cg.fixedLayers.load({
    channel: 1,
    layer: ROW,
    itemId: 'item-mon',
    templateId: 'tpl-mon',
    fields: {},
  });
  expect(res.accepted, 'the fixture row loads').toBe(true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

describe('MONITORS-01 — the shell boots with the monitors folded away', () => {
  it('renders no monitor strip at boot, and the flag it follows is the shipped default', () => {
    expect(DEFAULT_MONITORS_SHOWN).toBe(false);
    expect(strip(), 'no monitor strip before the operator asks for one').toBeNull();
  });

  it('the operator can still tell the monitors exist: one control, in the header, in words', () => {
    const btn = theToggle();
    // IN THE HEADER — containment, which is a DOM fact and answerable here. Where it sits on
    // screen is `shell-chrome.spec.ts` §B4's question.
    const header = document.querySelector('[data-app-header]');
    expect(header, 'the app header is rendered').not.toBeNull();
    expect(header?.contains(btn), 'the monitors toggle sits in the app header').toBe(true);
    // IN WORDS, not only a glyph. In this state nothing else on the whole surface mentions
    // PVW or PGM, so this string is the entire announcement.
    expect(btn.textContent).toContain('SHOW MONITORS');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('monitor-strip');
  });

  it('one press produces the strip, and the control renames itself', async () => {
    await click(theToggle());
    expect(strip(), 'the strip is up after one press').not.toBeNull();
    const btn = theToggle();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toContain('HIDE MONITORS');
    // …and back, so the announcement is never a one-way door.
    await click(btn);
    expect(strip()).toBeNull();
    expect(theToggle().textContent).toContain('SHOW MONITORS');
  });

  it('POSITIVE CONTROL: this harness really does render the strip when the flag is on', async () => {
    // Without it, every "the strip is absent" above could mean the shell never renders one in
    // jsdom at all — the failure mode a negative observation has when its instrument is
    // unproven. The press above IS that control; this states it as its own case so deleting
    // the press cannot silently take the proof with it.
    expect(strip()).toBeNull();
    await click(theToggle());
    expect(strip()).not.toBeNull();
  });
});

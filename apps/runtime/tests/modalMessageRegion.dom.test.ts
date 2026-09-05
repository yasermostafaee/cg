// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import { Modal, ModalAction } from '../src/renderer/ui/Modal.js';
import { FixedBankConfigModal } from '../src/renderer/features/fixedLayers/FixedBankConfigModal.js';
import { SourcesModal } from '../src/renderer/features/sources/SourcesModal.js';
import { DelimitersModal } from '../src/renderer/features/inspector/DelimitersModal.js';
import { ServerSettingsPanel } from '../src/renderer/features/connections/ServerSettingsPanel.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { __resetDelimitersForTest } from '../src/renderer/features/inspector/delimiterStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * ONE MESSAGE REGION FOR EVERY MODAL — asserted as a CENSUS, not per dialog.
 *
 * ── WHY THIS FILE EXISTS BESIDE `modalPrimitive.dom.test.ts` ────────────────
 *
 * That file proves the PRIMITIVE pins its message outside the scroll container.
 * It proved nothing about whether the dialogs use it, and three of them did not:
 * `Live sources` and `Server connection` adopted the region and handed it a node
 * carrying their own `color: colors.error` (2.13:1 on the dialog surface — the
 * owner's report), and `Text file delimiters` skipped the region entirely and
 * rendered `<p role="alert">` as the last child of its scrolling body, which is
 * the exact defect the region was built to end.
 *
 * A primitive four dialogs use while a fifth hand-rolls reads as consistent
 * while not being consistent. So this walks EVERY dialog that can say something,
 * including the ones that already looked right — a modal that happens to look
 * right while bypassing the region is the next one to drift.
 *
 * ── WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT ──────────────────────────
 *
 * The MECHANISM: the message is a `[data-notice]` inside `[data-modal-message]`,
 * that region is not inside `[data-modal-body]`, and the dialog's own body
 * contains no announcement of its own. NEVER a colour — a test that pinned
 * `#FCD34D` would go red the next time the palette moves and would say nothing
 * about whether the shared rule is being followed. The contrast ratios that
 * justify the palette are recorded in `ui/Notice.tsx`, where the values are.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  __resetSourcesForTest();
  __resetDelimitersForTest();
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the dialog did not open');
  return dialog;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function clickButton(dialog: HTMLElement, label: string): Promise<void> {
  const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no “${label}” button in the dialog`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settle();
}

/**
 * THE ONE CHECK EVERY DIALOG OWES.
 *
 * Three properties, and each of them is a defect that actually shipped:
 *
 *  1. the message is rendered by the shared `Notice` (`[data-notice]`) — the
 *     three dialogs that passed a styled node of their own failed this;
 *  2. it is inside the primitive's pinned region and NOT inside the scrolling
 *     body — `Text file delimiters` failed this;
 *  3. the body announces nothing of its own — the same failure stated from the
 *     other side, so a dialog cannot satisfy (1) and (2) with a second copy while
 *     still shouting from inside the scroll.
 */
function expectMessageThroughTheRegion(dialog: HTMLElement, role: 'refusal' | 'notice'): void {
  const region = dialog.querySelector('[data-modal-message]');
  expect(region, 'the dialog must show its message at all').not.toBeNull();

  const notice = region?.querySelector(`[data-notice="${role}"]`);
  expect(notice, `the message must be a shared Notice of role "${role}"`).not.toBeNull();

  const body = dialog.querySelector('[data-modal-body]');
  expect(body?.contains(region as Node) ?? false, 'the message is inside the scrolling body').toBe(
    false,
  );

  // …and the body carries no announcement of its own.
  expect(body?.querySelectorAll('[role="alert"]').length ?? 0).toBe(0);
  expect(body?.querySelectorAll('[data-notice]').length ?? 0).toBe(0);
}

describe('the census — every Runtime dialog that can speak, speaks through the region', () => {
  /** `Candidate layers — configuration`: the reference implementation. */
  it('Candidate layers routes a bridge refusal through the region', async () => {
    // SESSION BR — `visible: []` was a key FixedLayerBank does not have (the real one is
    // `visibility`, a record, whose ABSENCE means every row is visible). It asserted nothing
    // and its removal is behaviour-identical: absent still means all thirty rows show, which
    // is what this spec needs in order to scroll.
    const bank: FixedLayerBank = {
      channel: 1,
      low: { start: 1, count: 9 },
      start: 70,
      count: 30,
      aliases: {},
    };
    const slots: FixedSlotState[] = Array.from({ length: 30 }, (_, i) => ({
      channel: 1,
      layer: 70 + i,
      observed: { kind: 'empty' as const },
      binding: null,
    }));
    const stub = {
      link: {
        status: () => 'live',
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
      stack: { snapshot: () => Promise.resolve([]), onStateChanged: () => () => undefined },
      fixedLayers: {
        setConfig: () =>
          Promise.resolve({
            ok: false,
            reason: 'untick-occupied',
            message: 'Layer 95 has a template on it.',
          }),
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;

    const dialog = await render(
      createElement(FixedBankConfigModal, { bank, slots, onClose: () => undefined }),
    );
    await settle();
    await clickButton(dialog, 'Apply');

    expectMessageThroughTheRegion(dialog, 'refusal');
    // BOTH lines survive the move into the primitive: the RULE and the bridge's
    // own sentence, which names the layer. The detail line was the one rendered in
    // a muted grey inside the amber box; it is a `Notice` line now, and the test
    // asserts it is still SAID rather than what colour it is said in.
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(text).toContain('remove its template first');
    expect(text).toContain('Layer 95 has a template on it.');
  });

  /** `Live sources`: adopted the region, kept its own 2.13:1 red. */
  it('Live sources routes its refusal through the region', async () => {
    const stub = {
      sources: {
        config: () => Promise.resolve({ sources: [] }),
        onConfigChanged: () => () => undefined,
        setConfig: () => Promise.resolve({ ok: true }),
        assignments: () => Promise.resolve({ assignments: [] }),
        onAssignmentsChanged: () => () => undefined,
        setAssignments: () => Promise.resolve({ ok: true }),
      },
      templates: { list: () => Promise.resolve([]) },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;

    const dialog = await render(createElement(SourcesModal, { onClose: () => undefined }));
    // Add with an empty name: the form's own refusal, no bridge round-trip needed.
    await clickButton(dialog, 'Add');

    expectMessageThroughTheRegion(dialog, 'refusal');
    expect(dialog.querySelector('[data-modal-message]')?.textContent ?? '').toContain(
      'Give the source a name',
    );
  });

  /** `Text file delimiters`: the full drift — wrong place AND wrong colour. */
  it('Text file delimiters routes its refusal through the region, not the body', async () => {
    const stub = {
      delimiters: {
        list: () => Promise.resolve({ delimiters: [] }),
        onChanged: () => () => undefined,
        set: () => Promise.resolve({ ok: true }),
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;

    const dialog = await render(createElement(DelimitersModal, { onClose: () => undefined }));
    // Add with no name: the form's own refusal.
    await clickButton(dialog, 'Add');

    expectMessageThroughTheRegion(dialog, 'refusal');
    expect(dialog.querySelector('[data-modal-message]')?.textContent ?? '').toContain(
      'Give the delimiter a name',
    );
  });

  /**
   * `Server connection`: FOUR private treatments for one thing. The on-air block
   * and the success line are asserted separately below, because they are the two
   * ROLES this dialog needs and collapsing them would hide exactly the distinction
   * the roles exist to keep.
   */
  it('Server connection routes its on-air block through the region as a refusal', async () => {
    const stub = {
      connections: {
        config: () =>
          Promise.resolve({
            servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
            strategy: 'mirror-sync',
            autoFailoverEnabled: true,
          }),
        onConfigChanged: () => () => undefined,
        setConfig: () => Promise.resolve({ ok: true }),
        // `B-223` — the panel carries the output check's technical section, which reads health.
        health: () => Promise.resolve(null),
        onHealthChanged: () => () => undefined,
        // `C-024` — the panel reads what is IN FORCE on open; nothing is masked here.
        templateServe: () =>
          Promise.resolve({
            serveHost: '127.0.0.1',
            port: 0,
            exposed: false,
            unreachable: [],
            flagOverrides: {},
            candidates: [],
          }),
      },
      stack: {
        snapshot: () =>
          Promise.resolve([
            { itemId: 'i1', templateId: 't1', fields: {}, status: 'on-air', pending: false },
          ]),
        onStateChanged: () => () => undefined,
      },
      link: {
        status: () => 'live',
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;

    const dialog = await render(
      createElement(ServerSettingsPanel, { open: true, onClose: () => undefined }),
    );
    await settle();

    expectMessageThroughTheRegion(dialog, 'refusal');
    expect(dialog.querySelector('[data-modal-message]')?.textContent ?? '').toContain(
      'Apply is blocked',
    );
  });

  /**
   * THE DIALOGS THAT SAY NOTHING STILL COUNT — they are the ones most likely to
   * grow a message later, and the region must be the only place it can appear. A
   * dialog with no message renders no region at all, so there is nowhere for a
   * local one to hide beside it.
   */
  it('a dialog with nothing to say renders no region at all', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Read only',
        onClose: () => undefined,
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
        children: 'body',
      }),
    );
    expect(dialog.querySelector('[data-modal-message]')).toBeNull();
    expect(dialog.querySelector('[data-notice]')).toBeNull();
  });
});

describe('the ROLE decides the treatment, exactly as it does for the action buttons', () => {
  it('maps the two roles to two announcement channels', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Roles',
        onClose: () => undefined,
        message: [
          { role: 'refusal' as const, text: 'why it did not happen', detail: 'the specifics' },
          { role: 'notice' as const, text: 'what happened when it worked' },
        ],
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );

    // A refusal is ASSERTIVE — it is always the consequence of something the
    // operator just did. A neutral outcome is not.
    expect(dialog.querySelector('[data-notice="refusal"]')?.getAttribute('role')).toBe('alert');
    expect(dialog.querySelector('[data-notice="notice"]')?.getAttribute('role')).toBe('status');
    // Both lines of a refusal are rendered; the detail is not swallowed.
    expect(dialog.querySelector('[data-notice="refusal"]')?.textContent).toContain('the specifics');
  });

  it('a role never resolves to two treatments across dialogs', async () => {
    // The same claim §2 makes for the button roles, and it has to be made across
    // TWO renderings for the same reason: "one treatment per role" is a statement
    // about every dialog, and a single dialog cannot make it.
    const first = await render(
      createElement(Modal, {
        title: 'One',
        onClose: () => undefined,
        message: { role: 'refusal' as const, text: 'a' },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );
    const firstStyle = first.querySelector<HTMLElement>('[data-notice="refusal"]')?.style.cssText;
    expect(firstStyle).toBeTruthy();
    await act(async () => {
      root?.unmount();
    });
    root = null;
    clearPortals();

    const second = await render(
      createElement(Modal, {
        title: 'Two',
        onClose: () => undefined,
        message: { role: 'refusal' as const, text: 'b — a different sentence entirely' },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );
    expect(second.querySelector<HTMLElement>('[data-notice="refusal"]')?.style.cssText).toBe(
      firstStyle,
    );
  });

  /**
   * PERSIAN / RTL — these strings sit beside RTL content, and a bridge's own
   * message may itself be Persian.
   *
   * `dir="auto"` on the message lines, so the paragraph direction follows the
   * TEXT rather than the chrome: a Persian refusal reads right-to-left with its
   * full stop in the right place, while an English one beside it is unaffected.
   * Asserted as the attribute rather than by measuring, because jsdom computes no
   * layout — the attribute IS the mechanism (`inspector.dirAuto` makes the same
   * call for the field editors).
   */
  it('lets the message direction follow the message, not the chrome', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'RTL',
        onClose: () => undefined,
        message: {
          role: 'refusal' as const,
          text: 'این ردیف اشغال است — ابتدا تمپلیت آن را حذف کنید.',
          detail: 'لایه ۹۵ یک تمپلیت روی خود دارد.',
        },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'بستن' }),
      }),
    );
    const lines = [...(dialog.querySelector('[data-notice="refusal"]')?.children ?? [])];
    expect(lines.length, 'both the rule and the specifics are rendered').toBe(2);
    for (const line of lines) expect(line.getAttribute('dir')).toBe('auto');
  });
});

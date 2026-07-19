// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';
import { VARIANT_ACCENT } from '../src/renderer/ui/Button.js';
import { cssVars } from '../src/renderer/theme.js';

/**
 * C-012 — colour must carry meaning on this row.
 *
 * The rule the mapping encodes, in one line: WARM touches air, COOL does not; and
 * within a warm pair, the FILLED one is the heavier consequence.
 *
 *   PLAY    solid  on-air red   — puts a graphic ON air (the sacred treatment)
 *   UPDATE  outline on-air red  — changes what is on air right now
 *   STOP    outline amber       — takes it off air, producer survives (recoverable)
 *   CLEAR   filled  amber       — takes it off air, producer destroyed
 *   REMOVE  outline danger red  — destroys it AND drops the row
 *
 * Two things this must never do: let a non-on-air control wear the SOLID on-air red
 * (reserved for PLAY and the ON AIR badge), and let any control read as B-081's muted
 * "unverifiable" tone, which means "we cannot confirm this" — not "this is safe".
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
  document.body.innerHTML = '';
});

function stubLink(): void {
  const stub = { link: { status: () => 'live', onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

const ok = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

async function renderRow(status: StackItemState['status']): Promise<HTMLElement> {
  stubLink();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: { itemId: 'i1', templateId: 't1', fields: {}, status, pending: false },
          selected: false,
          dirty: false,
          onSelect: () => undefined,
          onPlay: ok,
          onUpdate: ok,
          onStop: ok,
          onOut: ok,
          onRemove: ok,
        }),
      ),
    );
  });
  return container;
}

function classOf(el: HTMLElement, label: string): string {
  for (const btn of el.querySelectorAll('button')) {
    if (btn.textContent?.trim() === label) return btn.className;
  }
  throw new Error(`no button labelled ${label}`);
}

describe('stack-row palette — colour carries consequence', () => {
  it('maps each action to its family', async () => {
    const el = await renderRow('on-air');
    expect(classOf(el, 'PLAY')).toContain('cg-btn--play');
    expect(classOf(el, 'UPDATE')).toContain('cg-btn--air');
    expect(classOf(el, 'STOP')).toContain('cg-btn--caution');
    expect(classOf(el, 'CLEAR')).toContain('cg-btn--caution-strong');
    expect(classOf(el, 'REMOVE')).toContain('cg-btn--danger');
  });

  it('STOP and CLEAR are visibly DIFFERENT — same family, opposite weight', async () => {
    // They do different things: STOP leaves the producer resident, CLEAR destroys it.
    // Identical colour would imply identical consequence.
    const el = await renderRow('on-air');
    const stop = classOf(el, 'STOP');
    const clear = classOf(el, 'CLEAR');
    expect(stop).not.toBe(clear);
    // …but they stay one family: the outlined amber must not read as the filled one.
    expect(stop.includes('cg-btn--caution-strong')).toBe(false);
  });

  it('UPDATE is NOT the neutral staging treatment', async () => {
    // Load / Apply position / Add item are staging actions that touch nothing live;
    // UPDATE changes what is on air right now and must not look like them.
    const el = await renderRow('on-air');
    const update = classOf(el, 'UPDATE');
    expect(update).not.toContain('cg-btn--secondary');
    expect(update).not.toContain('cg-btn--primary');
  });

  it('only PLAY wears the SOLID on-air red', async () => {
    // The sacred rule: solid `--r-onair` means "this puts a graphic on air". UPDATE
    // shares the hue as an outline to say "this reaches air", which is why the two
    // must not share a class.
    const el = await renderRow('on-air');
    expect(classOf(el, 'UPDATE')).not.toContain('cg-btn--play');
    for (const label of ['STOP', 'CLEAR', 'REMOVE']) {
      expect(classOf(el, label), label).not.toContain('cg-btn--play');
    }
  });

  it('no action reads as the muted "unverifiable" tone', async () => {
    // B-081's muted grey means "we cannot confirm this". A control painted with it
    // would read as reassurance where none was offered.
    const el = await renderRow('on-air');
    for (const label of ['PLAY', 'UPDATE', 'STOP', 'CLEAR', 'REMOVE']) {
      expect(classOf(el, label), label).not.toContain('cg-btn--ghost');
    }
  });
});

describe('the AIR family spans every surface, not just the stack row', () => {
  it('the Inspector UPDATE matches the row UPDATE — it is the same action', async () => {
    // Both call `applyDraft`. An operator who learns the colour on one surface must
    // not have to relearn it on the other, and UPDATE must not sit in the neutral
    // family beside Discard / Apply position / Add item, which reach no air.
    const { Inspector } = await import('../src/renderer/features/inspector/Inspector.js');
    stubLink();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    (window as unknown as { cg: Record<string, unknown> }).cg = {
      link: { status: () => 'live', onStatusChanged: () => () => undefined },
      templates: { get: () => Promise.resolve(null) },
      stack: { setPosition: () => Promise.resolve({ ok: true }) },
    };
    await act(async () => {
      r.render(
        createElement(Inspector, {
          item: {
            itemId: 'i1',
            templateId: 't1',
            fields: {},
            status: 'on-air',
            pending: false,
            slot: { channel: 1, layer: 10, server: 'primary' },
          },
          onApply: ok,
          onDiscard: () => undefined,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const update = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Apply staged edits"]',
    );
    expect(update).not.toBeNull();
    expect(update?.className).toContain('cg-btn--air');
    expect(update?.className).not.toContain('cg-btn--secondary');

    // …and the staging control beside it stays neutral, so the contrast is legible.
    const discard = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Discard staged edits"]',
    );
    expect(discard?.className).toContain('cg-btn--ghost');
  });
});

describe('the menu takes its colour from the SAME declaration as the buttons', () => {
  it('every variant resolves through one shared accent map', () => {
    // The menu used to squash variants through its own default|caution|danger scheme
    // with its own values, which made it a third, half-matching palette. Both surfaces
    // now read VARIANT_ACCENT, so a menu item cannot be a colour the button is not.
    expect(VARIANT_ACCENT.play).toBe(cssVars['--r-onair']);
    expect(VARIANT_ACCENT.air).toBe(cssVars['--r-onair']);
    expect(VARIANT_ACCENT.caution).toBe(cssVars['--r-caution']);
    expect(VARIANT_ACCENT['caution-strong']).toBe(cssVars['--r-caution']);
    expect(VARIANT_ACCENT.danger).toBe(cssVars['--r-danger']);
    // Neutral variants inherit the surface text colour rather than naming one.
    expect(VARIANT_ACCENT.default).toBeUndefined();
    expect(VARIANT_ACCENT.ghost).toBeUndefined();
  });

  it('no accent collides with the muted tone or the success green', () => {
    const reserved = [cssVars['--r-text-muted'], cssVars['--r-success']];
    for (const [variant, accent] of Object.entries(VARIANT_ACCENT)) {
      if (accent === undefined) continue;
      expect(reserved, variant).not.toContain(accent);
    }
  });
});

/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectionCheckList } from '../src/renderer/features/firstRun/ConnectionCheckList.js';
import { colors } from '../src/renderer/theme.js';

/**
 * 🔴 `UI-POLISH-01` F — **A PASSING LINE'S ✓ IS GREEN, AND IT IS NOT THE ON-AIR GREEN.**
 *
 * The owner asked for the pass mark in green (2026-09-26); the recorded rule reserves `onAir` for
 * air. Both hold: the ICON of a passing line wears `checkPass`, its text keeps its ink, and every
 * other status is unchanged. The colours here are inline style VALUES, which jsdom resolves
 * exactly (golden rule 12 (c): a computed value is real in jsdom; geometry is not).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** The colour a browser would compute for a CSS colour string. */
function computed(css: string): string {
  const probe = document.createElement('span');
  probe.style.color = css;
  document.body.append(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}

function render(): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(ConnectionCheckList, {
        lines: [
          { id: 'amcp', status: 'pass', text: 'CasparCG answers on 127.0.0.1:5250.' },
          { id: 'api', status: 'fail', text: 'No OSC from CasparCG.' },
          { id: 'topology', status: 'warn', text: 'The return feed is on another host.' },
          { id: 'cors', status: 'wait', text: 'Not checked until an admin signs in.' },
        ],
      }),
    ),
  );
  return host;
}

const iconInk = (el: HTMLElement, id: string): string =>
  getComputedStyle(el.querySelector(`[data-check="${id}"] [data-check-icon]`) as HTMLElement).color;
const textInk = (el: HTMLElement, id: string): string =>
  getComputedStyle(el.querySelector(`[data-check="${id}"] [data-check-icon] + span`) as HTMLElement)
    .color;

describe('the connection check’s pass mark', () => {
  it('a passing line’s ✓ wears checkPass, which is not onAir; its text keeps its ink', () => {
    const el = render();
    expect(iconInk(el, 'amcp')).toBe(computed(colors.checkPass));
    expect(computed(colors.checkPass)).not.toBe(computed(colors.onAir));
    expect(textInk(el, 'amcp')).toBe(computed(colors.text));
  });

  it('every other status is unchanged — a failing line still wears the error ink (the control)', () => {
    const el = render();
    expect(iconInk(el, 'api')).toBe(computed(colors.errorText));
    expect(textInk(el, 'api')).toBe(computed(colors.errorText));
    expect(iconInk(el, 'topology')).toBe(computed(colors.pending));
    expect(iconInk(el, 'cors')).toBe(computed(colors.textSecondary));
  });
});

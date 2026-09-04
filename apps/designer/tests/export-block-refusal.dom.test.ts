/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExportIssue } from '@cg/shared-ipc';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { CompositionActionBar } from '../src/renderer/features/compositions/CompositionActionBar.js';

/**
 * ⭐ **`D-157` — THE BLOCKED EXPORT MUST NAME THE OFFENDER, not merely refuse.**
 *
 * The defect this pins: the component carried the only string in the app that named the Issues
 * panel — `window.alert('Export blocked: N validation error(s) in Issues panel.')` — and it could
 * never run, because the same `errorCount > 0` that produced it also set `disabled` on the
 * button. The tooltip that DID render said "Resolve validation errors first" — no count, no name,
 * no destination — and sat on a natively disabled control, where browsers suppress `title`
 * entirely.
 *
 * 🔴 So every assertion here is about the CLAIM, not about the refusal existing. "The export was
 * blocked" was never in doubt; "the author can tell which box" is the whole item.
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
});

const OVERLAP: ExportIssue = {
  severity: 'error',
  code: 'live-source-overlap',
  message:
    'Live Source "guest-1" overlaps "guest-2". Each is composited on its own CasparCG layer, ' +
    'so overlapping plates put two live sources over the same pixels and which one shows is a ' +
    'z-order accident.',
  elementId: 'guest-1',
};
const OVERLAP_B: ExportIssue = { ...OVERLAP, elementId: 'guest-2' };

/**
 * A project with an OPEN composition. Load-bearing: `!hasComp` is the OTHER refusal, and with
 * nothing open the bar is genuinely disabled for a reason that has nothing to do with issues.
 */
function render(issues: readonly ExportIssue[], withComposition = true): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  // `setScene` OPENS the first composition itself, so "no composition" is reached by closing
  // it rather than by omitting one — which is also the state the app is really in after
  // "Close composition".
  designerStore.setScene(scene, null);
  if (!withComposition) designerStore.setActiveComposition(null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(CompositionActionBar, { issues }));
  });
  return container;
}

const exportButton = (c: HTMLElement): HTMLButtonElement =>
  c.querySelector('button[aria-label="Export .vcg"]') as HTMLButtonElement;

describe('D-157 — the blocked Export names what and where', () => {
  it('🔴 the tooltip carries the COUNT and the FIRST OFFENDER, not a generic sentence', () => {
    const c = render([OVERLAP, OVERLAP_B]);
    const title = exportButton(c).getAttribute('title') ?? '';
    expect(title).toContain('2 errors');
    expect(title).toContain('guest-1');
    // The sentence this replaced. If it ever comes back, the item has regressed.
    expect(title).not.toBe('Resolve validation errors first');
  });

  it('🔴 the button is NOT natively disabled — a disabled control can show no tooltip at all', () => {
    // This is the mechanism, not a preference: browsers suppress `title` on disabled form
    // controls, and the app's own tooltip listens on `pointerover`, which they never dispatch.
    // Keeping it `disabled` would mean the enriched string above could not render either.
    const c = render([OVERLAP]);
    expect(exportButton(c).disabled).toBe(false);
    // ⚠ …and NOT `aria-disabled` either. That was the first draft: it would tell a screen-reader
    // user not to press the one control that would have explained the problem — this item's own
    // defect, aimed at the users least able to work around it.
    expect(exportButton(c).getAttribute('aria-disabled')).toBeNull();
    // The refusal reaches assistive technology as the accessible DESCRIPTION, which only works
    // because the control is enabled.
    expect(exportButton(c).getAttribute('title')).toContain('blocked');
    // …while the accessible NAME stays canonical, so every surface can still find the button.
    expect(exportButton(c).getAttribute('aria-label')).toBe('Export .vcg');
  });

  it('🔴 pressing it OPENS the Issues panel and SELECTS the offenders', () => {
    const c = render([OVERLAP, OVERLAP_B]);
    expect(designerStore.get().issuesOpen).toBe(false);

    act(() => exportButton(c).click());

    // One action, from the control the author actually pressed, to the full message.
    expect(designerStore.get().issuesOpen).toBe(true);
    // …and the canvas marks are now the boxes under the author's eye.
    expect(new Set(designerStore.get().selection)).toEqual(new Set(['guest-1', 'guest-2']));
  });

  it('the notice names the count and the offender too', () => {
    const c = render([OVERLAP]);
    act(() => exportButton(c).click());
    const notice = designerStore.get().notice ?? '';
    expect(notice).toContain('1 error');
    expect(notice).toContain('guest-1');
  });

  it('the unreachable alert is GONE — a press never calls window.alert', () => {
    // A string that can never render reads as coverage. Either it becomes reachable or it goes;
    // this asserts it went, rather than becoming a reachable modal nobody asked for.
    let alerted = 0;
    const original = window.alert;
    window.alert = () => {
      alerted += 1;
    };
    try {
      const c = render([OVERLAP]);
      act(() => exportButton(c).click());
      expect(alerted).toBe(0);
    } finally {
      window.alert = original;
    }
  });

  it('🔴 THE POSITIVE CONTROL — with no errors the button is LIVE and says what it does', () => {
    const c = render([]);
    const btn = exportButton(c);
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(btn.getAttribute('title')).toBe('Export this composition to .vcg');
  });

  it('NO COMPOSITION is the OTHER refusal — genuinely disabled, because nothing has anything to say', () => {
    // Collapsing the two refusals into one boolean is what made this control mute. Here there is
    // no composition to export AND no issue to explain, so a click would have nothing to answer
    // with — `disabled` is the honest state, and it is reached without any error at all.
    const c = render([], false);
    expect(exportButton(c).disabled).toBe(true);
    expect(exportButton(c).getAttribute('aria-disabled')).toBeNull();
  });

  it('a WARNING does not block — only error severity does', () => {
    const warn: ExportIssue = { ...OVERLAP, severity: 'warning' };
    const c = render([warn]);
    expect(exportButton(c).getAttribute('aria-disabled')).toBeNull();
  });

  it('the HTML export carries the same refusal, so the two doors cannot disagree', () => {
    const c = render([OVERLAP]);
    const html = c.querySelector('button[aria-label="Export HTML"]') as HTMLButtonElement;
    expect(html.disabled).toBe(false);
    expect(html.getAttribute('data-export-blocked')).toBe('errors');
    expect(html.getAttribute('title')).toContain('guest-1');
  });
});

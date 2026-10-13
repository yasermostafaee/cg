// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  selectSetupTab,
  stationSetupStub,
  tabOf,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `STATION-CHROME-02` §3 — **THE WHITE BOX THE OWNER COULD SEE AND THE SOURCE COULD NOT.**
 *
 * Owner, 2026-09-07: «روی آیتمهای منو وقتی یه بار بازدید میشن کادر سفید دورشون میمونه که
 * نباید بمونه» — once a rail item has been visited, a white box stays around it.
 *
 * ── THE MECHANISM, BECAUSE IT IS THE REUSABLE PART ──────────────────────────
 *
 * The rail was inline styles. A tab's resting style carried the SHORTHAND
 * `border: 1px solid transparent`; the selected style merged the LONGHAND
 * `borderColor` over it. On DESELECT React removes the longhand by assigning
 * `style.borderColor = ''`, and that deletes the four `border-*-color` declarations —
 * INCLUDING the ones the shorthand contributed, because they are the same four properties.
 * What is left is `border-width: 1px; border-style: solid` with no colour at all, which
 * Chrome paints WHITE. Measured live before the fix:
 *
 *   Channel, selected:   `border: 1px solid rgb(55,65,81)`      → rgb(55,65,81)
 *   Channel, deselected: `border-width: 1px; border-style: solid` → rgb(255,255,255)
 *   never selected:      `border: 1px solid transparent`         → transparent
 *
 * ⚠ Reading the source found `1px solid transparent` and explained nothing, which is why
 * `STATION-CHROME-01` shipped believing the rail was right. **The general rule: never mix a
 * shorthand with one of its own longhands across renders in one inline style object.**
 *
 * ── WHAT THIS SPEC ASSERTS, AND WHY IT IS SHAPED THIS WAY ───────────────────
 *
 * jsdom does not reproduce Chrome's white FALLBACK — its CSSOM resolves the missing colour
 * differently — so asserting the computed colour here would assert nothing about the
 * browser. What jsdom DOES reproduce exactly is the cause: whether React left a border
 * declaration on the element at all. So the assertion is on the STRUCTURE that made the
 * defect possible — no inline border on a rail tab, in any state — plus a source check that
 * the rail's states come from the stylesheet. Both fail against the old build.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const RENDERER = join(process.cwd(), 'src', 'renderer');

describe('§3 — the rail keeps no box after a visit', () => {
  it('🔴 a VISITED-THEN-LEFT tab carries no inline border of its own', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });

    // Channel is selected on open. Leave it, which is the whole reproduction.
    await selectSetupTab(dialog, 'servers');

    const visited = tabOf(dialog, 'channel');
    const inline = visited.getAttribute('style') ?? '';
    expect(
      inline,
      `a deselected rail tab must carry no inline border — it had: ${inline}`,
    ).not.toMatch(/border/i);

    // …and the SELECTED one does not either: the fix is that neither state is a style diff.
    expect(tabOf(dialog, 'servers').getAttribute('style') ?? '').not.toMatch(/border/i);
  });

  it('every rail tab is styled by the CLASS, in every state', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    const tabs = [...dialog.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) expect(tab.className).toContain('cg-rail-tab');
    // The rail itself too, so nothing is left hand-styling the container.
    expect(dialog.querySelector('[role="tablist"]')?.className).toContain('cg-rail');
  });

  it('POSITIVE CONTROL: the assertion really does see an inline border', async () => {
    // Without this, "no inline border" would also pass against a tab that rendered no style
    // attribute at all — including one that failed to render. This is the OLD spelling,
    // shown to be caught.
    const el = document.createElement('button');
    el.setAttribute('style', 'border: 1px solid transparent; border-radius: 0.25rem;');
    expect(el.getAttribute('style')).toMatch(/border/i);
  });

  it('the rail’s selected + hover states live in the stylesheet, not in a style object', async () => {
    const css = readFileSync(join(RENDERER, 'ui', 'controls.css'), 'utf8');
    expect(css).toContain(".cg-rail-tab[aria-selected='true']");
    expect(css).toContain('.cg-rail-tab:hover');
    // The states a stylesheet can express and an inline style cannot — the other half of
    // why this moved, and the reason a future "tidy-up" back to inline would be a
    // regression rather than a refactor.
    expect(css).toContain('.cg-rail-tab:focus-visible');

    /*
      …and no rail style object may come back. Matched on the USE (`styles.rail…`), never on
      the word: the file's own header NAMES the four objects it deleted, and a guard that
      forbade the name would forbid the explanation of why they went.
    */
    const tabs = readFileSync(join(RENDERER, 'ui', 'Tabs.tsx'), 'utf8');
    expect(tabs, 'no rail style object may come back').not.toMatch(/styles\.rail/);
  });

  it('the GROUP heading is not the same ink as an item under it (owner, 2026-09-07)', async () => {
    /*
      «استایل و رنگ دسته بندی در منو از آیتمهای هر دسته بندی مشخص تر باشه» — the group
      headings were `--r-text-muted` and so were the resting tabs, so PLAYOUT read as a
      disabled tab rather than as the heading over two of them. Asserted on the DECLARED
      roles rather than on a hex, for the same reason the badge specs are: the values may
      be retuned, the distinction may not collapse.
    */
    const css = readFileSync(join(RENDERER, 'ui', 'controls.css'), 'utf8');
    const rule = (selector: string): string => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };
    const group = rule('.cg-rail-group');
    const tab = rule('.cg-rail-tab');
    expect(group).toContain('color: var(--r-text-muted)');
    expect(tab).toContain('color: var(--r-text)');
    expect(group).toContain('text-transform: uppercase');
    // …and a rule above it, so the group is a section BREAK and not only a dimmer label.
    expect(group).toContain('border-top: 1px solid');
  });
});

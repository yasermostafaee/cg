import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `MODAL-CHROME-10` ADDENDUM A §A1 — **THE BAR HAS EXACTLY ONE WAY TO SEAT AN ICON BESIDE A
 * WORD.**
 *
 * The owner found FAILOVER's icon off the label's optical line with no gap before the word,
 * while Lock — two controls along in the same bar — was right. The cause was not that button:
 * `AsyncButton` wraps ALL its children in one `.cg-btn__label` span (so the spinner can take
 * the label's slot without the control's width jumping), and that wrapper was a plain inline
 * box, so `.cg-btn`'s own `align-items: center` and `gap` reached nothing inside it. `Button`
 * puts its icon and word as direct flex children and got both for free.
 *
 * Measured in Chromium at 1400 × 900, before → after:
 *
 * | control  | composed by   | gap icon→word | icon centre − word centre |
 * | -------- | ------------- | ------------- | ------------------------- |
 * | FAILOVER | `AsyncButton` | none → **8 px** | −1.03 px → **0.53 px**  |
 * | Lock     | `Button`      | 8 px → 8 px     | 0.53 px → 0.53 px       |
 *
 * ⚠ THIS SPEC COMPARES THE TWO RATHER THAN PINNING A NUMBER, deliberately. A margin on one
 * icon would have satisfied a pinned 8 px and left the next `AsyncButton` wrong; what must
 * hold is that both families compose the same way. If a third composition appears, this fails
 * without anyone having to remember to measure it.
 *
 * jsdom returns zeros for every box here, so none of this could be asserted without a browser
 * (golden rule 12c).
 */
test('§A1 — an AsyncButton and a Button seat their icon identically', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });

  const compose = async (label: string): Promise<{ gap: number; offBy: number }> =>
    page.evaluate((want) => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes(want),
      );
      if (btn === undefined) throw new Error(`no button reading ${want}`);
      const svg = btn.querySelector('svg');
      if (svg === null) throw new Error(`${want} has no icon`);
      // The text node WHEREVER it sits — a direct child for `Button`, inside `.cg-btn__label`
      // for `AsyncButton`. Measuring the wrapper instead is what made the first reading read
      // −15 px and mean nothing.
      const walk = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
      let word: Node | null = null;
      while (walk.nextNode()) {
        if ((walk.currentNode.textContent ?? '').trim() !== '') {
          word = walk.currentNode;
          break;
        }
      }
      if (word === null) throw new Error(`${want} has no word`);
      const range = document.createRange();
      range.selectNodeContents(word);
      const w = range.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      return {
        gap: +(w.left - s.right).toFixed(2),
        offBy: +(s.top + s.height / 2 - (w.top + w.height / 2)).toFixed(2),
      };
    }, label);

  const failover = await compose('FAILOVER');
  const lock = await compose('Lock');

  expect(failover.gap, 'FAILOVER has no gap between its icon and its word').toBeGreaterThan(0);
  expect(failover.gap, 'the two controls space their icon differently').toBe(lock.gap);
  expect(
    Math.abs(failover.offBy - lock.offBy),
    'the two controls sit their icon on different optical lines',
  ).toBeLessThan(0.5);
});

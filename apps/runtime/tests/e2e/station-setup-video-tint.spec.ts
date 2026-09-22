import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `MODAL-TRUTH-01` (owner, 2026-09-22) — **THE VIDEO-FORMAT CARD'S TWO GROUNDS, MEASURED
 * IN THE ENGINE THAT PAINTS THEM.**
 *
 * The owner photographed Station setup on a station with no bridge: every value in the card
 * read `not read yet` / `not configured`, inside a GREEN box. `ChannelSection.tsx` now sets
 * `data-video-read`, and `controls.css` hangs both grounds off it — the reference's green
 * for a channel that has been read, this dialog's DANGER ground for one that has not. The
 * owner settled that in three steps: not-green («بهتره وقتی متصل نیست سبز نباشه»), then
 * amber, then «نمیخواد زرد بشه اون باکس شاید قرمز بهتر باشه».
 *
 * ── WHY THIS SPEC EXISTS BESIDE THE DOM ONE, AND WHAT EACH HALF PROVES ──────
 *
 * The dom spec (`stationSetupVideoTint.dom.test.ts`) drives the real component and asserts
 * which VALUE the attribute takes. It cannot go further: the runtime's jsdom tests never
 * load `controls.css`, so a `getComputedStyle` background read there would come back empty
 * whatever the stylesheet says — a green assertion passing against a green card (golden
 * rule 12c). This half asserts the other link: that the attribute actually decides the
 * PAINT, in Chromium, through the real cascade.
 *
 * ⚠ The `no` state is produced by setting the attribute on the live element rather than by
 * a `CG_E2E_*` seed, deliberately: the mock always answers for its channel, and adding a
 * product-source flag to reach a CSS state would put a test-only branch in `MockRuntime`
 * for something the stylesheet can be asked directly. The component's own choice of value
 * is the dom spec's job; this one is about what the browser does with each value.
 *
 * ⚠ And the red is READ FROM THE TOKEN HOME rather than written here as a hex, so a token
 * that stops being consumed fails this spec instead of passing on a coincidence — the rule
 * `library-audit-geometry.spec.ts` states for its numbers. A colour has more than one
 * notation and `getComputedStyle` answers in `rgb(...)`, so the token is resolved BY THE
 * SAME ENGINE before the comparison rather than compared as a string.
 */

test('`MODAL-TRUTH-01` — the video card is green only while the channel has been read, and red when it has not', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await expect(setup).toBeVisible();

  const card = setup.locator('[data-raster-channel]');
  await expect(card).toBeVisible();
  // The mock answers for its channel, so this is the READ state end to end.
  await expect(card).toHaveAttribute('data-video-read', 'yes');

  /*
    The token home, resolved by THIS engine — so `--r-setup-danger-bg` is compared as the
    same `rgb(...)` the card reports, and a token renamed out from under the rule fails here.
  */
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const resolve = (name: string): string => {
      probe.style.color = cs.getPropertyValue(name).trim();
      return getComputedStyle(probe).color;
    };
    const out = {
      dangerBg: resolve('--r-setup-danger-bg'),
      dangerLine: resolve('--r-setup-danger-line'),
    };
    probe.remove();
    return out;
  });

  const read = async (): Promise<{ image: string; color: string; border: string }> =>
    card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { image: cs.backgroundImage, color: cs.backgroundColor, border: cs.borderTopColor };
    });

  /*
    The PLAIN card ground, read off a real one rather than from a token name. The Channel
    pane's only card IS the video card (Outputs renders one only once the bridge has
    answered), so the reference comes from Servers, whose `Primary server` card is always
    drawn — same dialog, same `[data-modal-size='fixed']` scope, same family.
  */
  await setup.getByRole('tab', { name: 'Servers' }).click();
  const plainCard = setup.locator('.cg-card:not(.cg-card--video)').first();
  await expect(plainCard).toBeVisible();
  const plain = await plainCard.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { image: cs.backgroundImage, color: cs.backgroundColor, border: cs.borderTopColor };
  });
  await setup.getByRole('tab', { name: 'Channel' }).click();
  await expect(card).toBeVisible();

  const green = await read();
  /*
    POSITIVE CONTROLS, before the assertions that matter: the green must be something this
    engine actually paints, and it must differ from the plain card ground. Without these,
    the comparisons below could be identical empty values agreeing with each other.
  */
  expect(green.image, 'the green tint is not a gradient this engine paints').toContain(
    'linear-gradient',
  );
  expect(green.image).not.toBe(plain.image);

  // Flip the one attribute the stylesheet keys on, and read the cascade again.
  await card.evaluate((el) => el.setAttribute('data-video-read', 'no'));
  const red = await read();

  // THE ASSERTIONS: no reading, no green — and the ground is this dialog's danger pair.
  expect(red.image).not.toBe(green.image);
  expect(red.image, 'the unread card kept a gradient').toBe('none');
  expect(red.color).toBe(tokens.dangerBg);
  expect(red.border).toBe(tokens.dangerLine);
  // Not the plain ground either — the owner asked for a colour, not an absence.
  expect(red.color).not.toBe(plain.color);
  expect(red.border).not.toBe(plain.border);

  await setup.getByRole('button', { name: 'Close' }).last().click();
  await expect(setup).toHaveCount(0);
});

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — the guarded surfaces that borrow geometry the reference DOES
 * draw, measured in a real engine against the token home (golden rule 12c: jsdom has no layout,
 * so a box asserted there compares zeros).
 *
 * Two surfaces the built app can reach in test mode: the LOCK (engaged through the operator's
 * own path on the status bar) and the NOTICE strips (the orphan seed raises both the warn strip
 * and the neutral one). The toast is not measured here — no e2e path raises a command refusal
 * deterministically against the offline mock — and is argued in `design.md` §16.3.
 *
 * Every expected number is READ FROM THE TOKEN HOME at run time (`--r-lock-*`, `--r-notice-*`),
 * never spelled: the spec pins that the surface is what the token home declares, so a retune
 * moves both sides and only a surface that stopped reading its token fails.
 */

/** A token's value as the page resolves it, read off `:root`. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

const px = (v: string): number => Number.parseFloat(v);

test('the lock card, icon box, PIN field and full-width submit are what the token home declares', async ({
  app,
}) => {
  await app.goto();
  await app.page.getByRole('button', { name: /Lock/ }).click();
  const prompt = app.page.getByRole('dialog');
  await prompt.getByLabel(/^Lock PIN \(/).fill('1234');
  await prompt.getByLabel('Lock PIN again').fill('1234');
  await prompt.getByRole('button', { name: 'Lock', exact: true }).click();

  const lock = app.page.getByRole('dialog', { name: 'Lock screen' });
  await expect(lock).toBeVisible();
  await expect(lock.getByText('Console locked')).toBeVisible();

  const [cardW, iconBox, pinH, submitH, titleFs] = await Promise.all([
    token(app.page, '--r-lock-card-w'),
    token(app.page, '--r-lock-icon-box'),
    token(app.page, '--r-lock-pin-h'),
    token(app.page, '--r-lock-submit-h'),
    token(app.page, '--r-lock-title-fs'),
  ]);
  // A red-first assertion against an absent token is `expect(undefined)…` — pin presence first.
  for (const v of [cardW, iconBox, pinH, submitH, titleFs]) expect(v).toMatch(/^\d+px$/);

  const measured = await lock.evaluate((el) => {
    const card = el.firstElementChild as HTMLElement;
    const title = el.querySelector('h2') as HTMLElement;
    const icon = title.previousElementSibling as HTMLElement;
    const pin = el.querySelector('input[aria-label="PIN"]') as HTMLElement;
    const submit = el.querySelector('button') as HTMLElement;
    const foot = submit.parentElement as HTMLElement;
    const footCs = getComputedStyle(foot);
    const footInner =
      foot.getBoundingClientRect().width -
      parseFloat(footCs.paddingLeft) -
      parseFloat(footCs.paddingRight);
    return {
      cardW: card.getBoundingClientRect().width,
      iconW: icon.getBoundingClientRect().width,
      iconH: icon.getBoundingClientRect().height,
      pinH: pin.getBoundingClientRect().height,
      submitH: submit.getBoundingClientRect().height,
      submitW: submit.getBoundingClientRect().width,
      footInner,
      titleFs: parseFloat(getComputedStyle(title).fontSize),
      tag: el.tagName,
      dialogs: el.querySelectorAll('dialog').length,
      buttons: el.querySelectorAll('button').length,
    };
  });

  expect(measured.cardW).toBeCloseTo(px(cardW), 0);
  expect(measured.iconW).toBeCloseTo(px(iconBox), 0);
  expect(measured.iconH).toBeCloseTo(px(iconBox), 0);
  expect(measured.pinH).toBeCloseTo(px(pinH), 0);
  expect(measured.submitH).toBeGreaterThanOrEqual(px(submitH) - 0.5);
  // Full width: the submit fills the foot's content box.
  expect(Math.abs(measured.submitW - measured.footInner)).toBeLessThan(1);
  expect(measured.titleFs).toBeCloseTo(px(titleFs), 0);
  // …and the contract, in the real engine too: not a <dialog>, one control, the release path.
  expect(measured.tag).not.toBe('DIALOG');
  expect(measured.dialogs).toBe(0);
  expect(measured.buttons).toBe(1);

  await lock.getByLabel('PIN').fill('1234');
  await lock.getByRole('button', { name: 'Unlock console' }).click();
  await expect(lock).toBeHidden();
});

test('the warn and neutral notice strips take the reference box and pairs from the token home', async ({
  app,
}) => {
  await app.goto();
  await app.page.addInitScript(() => {
    (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
  });
  await app.page.reload();

  const warn = app.page.getByRole('alert', { name: 'Orphaned on-air layers' });
  const neutral = app.page.getByRole('status', { name: 'Layers in use by other systems' });
  await expect(warn).toBeVisible();
  await expect(neutral).toBeVisible();

  const [pad, radius, fs, warnBg, warnLine, neutralBg, neutralLine] = await Promise.all([
    token(app.page, '--r-notice-pad'),
    token(app.page, '--r-notice-radius'),
    token(app.page, '--r-notice-fs'),
    token(app.page, '--r-notice-fill'),
    token(app.page, '--r-notice-line'),
    token(app.page, '--r-notice-neutral-bg'),
    token(app.page, '--r-notice-neutral-line'),
  ]);
  expect(pad).toMatch(/^\d+px \d+px$/);
  for (const v of [radius, fs]) expect(v).toMatch(/^\d+px$/);
  for (const v of [warnBg, warnLine, neutralBg, neutralLine]) expect(v).toMatch(/^#/);

  /** A colour as the engine resolves it, so a `#hex` token compares to a computed `rgb()`. */
  const resolved = async (hex: string): Promise<string> =>
    app.page.evaluate((h) => {
      const probe = document.createElement('span');
      probe.style.color = h;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, hex);

  const read = (loc: typeof warn) =>
    loc.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        padding: cs.padding,
        radius: cs.borderRadius,
        fs: cs.fontSize,
        bg: cs.backgroundColor,
        line: cs.borderTopColor,
      };
    });

  const w = await read(warn);
  expect(w.padding).toBe(pad);
  expect(w.radius).toBe(radius);
  expect(w.fs).toBe(fs);
  expect(w.bg).toBe(await resolved(warnBg));
  expect(w.line).toBe(await resolved(warnLine));

  const n = await read(neutral);
  expect(n.padding).toBe(pad);
  expect(n.radius).toBe(radius);
  expect(n.fs).toBe(fs);
  expect(n.bg).toBe(await resolved(neutralBg));
  expect(n.line).toBe(await resolved(neutralLine));
  // The two strips are two DIFFERENT pairs — a redesign that kept only the amber one would
  // delete the neutral contract (`design.md` §3 item 3).
  expect(n.bg).not.toBe(w.bg);
});

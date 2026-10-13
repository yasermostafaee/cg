import type { CDPSession, Page } from '@playwright/test';
import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * 🔴 `TEXT-DIGITS-01` — **WHAT IS EDITED LOOKS LIKE WHAT GOES ON AIR.** A title typed into the
 * canvas's double-click editor shows each digit in the element's Digits choice as it is typed, and
 * the exported page — the page CasparCG loads — draws the same.
 *
 * The digits are real key events: the top-row and numpad `1`/`4` a Windows keyboard sends, both of
 * which type U+0031…U+0039 on the owner's Persian layout (`field-digits` `design.md` §0.1),
 * dispatched through CDP as `FIELD-DIGITS-01` did — Playwright's own `Numpad4` models NumLock OFF.
 * The Persian words go through `keyboard.type`, which hands the page each character as an input
 * method does.
 */

interface DigitKey {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  location: number;
}

/** A digit as the top row (`Digit4`) or the numpad with NumLock on (`Numpad4`) sends it. */
async function pressDigit(page: Page, digit: string, from: 'row' | 'numpad'): Promise<void> {
  const numpad = from === 'numpad';
  const key: DigitKey = {
    key: digit,
    code: numpad ? `Numpad${digit}` : `Digit${digit}`,
    windowsVirtualKeyCode: (numpad ? 96 : 48) + Number(digit),
    location: numpad ? 3 : 0,
  };
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...key,
    isKeypad: numpad,
    text: digit,
    unmodifiedText: digit,
  });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key, isKeypad: numpad });
  await client.detach();
}

/** The faces the engine DREW a node's text with — CDP, not CSS: `family×glyphs`. */
async function drawnFaces(client: CDPSession, selector: string): Promise<string[]> {
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `no node for ${selector} — nothing below is measured`).toBeGreaterThan(0);
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => `${f.familyName}×${String(f.glyphCount)}`);
}

/** Add a title and open the canvas's double-click editor on it. Returns the element id. */
async function editNewTitle(app: DesignerApp, digits: 'persian' | 'latin' | 'as-typed') {
  await app.addTextElement({ x: 300, y: 200 });
  const id = (await app.timelineRowIds())[0]!;
  const choice = app.inspector.getByRole('combobox', { name: 'digits', exact: true });
  // A new element starts on Persian (the owner's decision); the others are chosen here.
  await expect(choice).toHaveValue('persian');
  if (digits !== 'persian') await choice.selectOption(digits);
  await app.selectTool('Select');
  await app.canvas.dblclick({ position: { x: 330, y: 215 } });
  const editor = app.page.locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  return { id, editor };
}

/** `اخبار ساعت 14`, the digits from the top row and the numpad. */
async function typeTitle(page: Page): Promise<void> {
  await page.keyboard.type('اخبار ساعت ');
  await pressDigit(page, '1', 'row');
  await pressDigit(page, '4', 'numpad');
}

/** The exported page, played the way CasparCG plays it. */
async function onAir(page: Page, html: string): Promise<Page> {
  const air = await page.context().newPage();
  await air.setContent(html);
  await air.waitForFunction(
    () => typeof (window as unknown as { play?: unknown }).play === 'function',
  );
  await air.evaluate(() => (window as unknown as { play: () => void }).play());
  await air.evaluate(async () => {
    await document.fonts.ready;
  });
  return air;
}

test('a Persian title typed `اخبار ساعت 14` shows and exports as `اخبار ساعت ۱۴`, drawn in one face', async ({
  app,
}, testInfo) => {
  const { page } = app;
  await app.newProject('TitleDigits');
  const { id, editor } = await editNewTitle(app, 'persian');
  // The instrument: every digit keydown the page receives, as `key|code|location`.
  await page.evaluate(() => {
    const w = window as unknown as { __keys: string[] };
    w.__keys = [];
    document.addEventListener(
      'keydown',
      (e) => {
        if (/^[0-9]$/.test(e.key)) w.__keys.push(`${e.key}|${e.code}|${String(e.location)}`);
      },
      true,
    );
  });
  await typeTitle(page);
  // While typing: what is edited looks like what goes on air.
  await expect(editor).toHaveText('اخبار ساعت ۱۴');
  // …from the keys a Windows keyboard really sends: U+0031 from the top row, U+0034 from the numpad.
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual([
    '1|Digit1|0',
    '4|Numpad4|3',
  ]);
  await page.screenshot({ path: testInfo.outputPath('persian-title-editing.png') });
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(app.canvasFrame.locator(`[data-cg-element-id="${id}"]`)).toHaveText('اخبار ساعت ۱۴');

  const { html } = await app.exportHtml();
  const air = await onAir(page, html);
  const sel = `[data-cg-element-id="${id}"]`;
  await expect(air.locator(sel)).toHaveText('اخبار ساعت ۱۴');
  const client = await air.context().newCDPSession(air);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  // All thirteen glyphs — the letters, both spaces and both digits — from ONE face, the Vazirmatn
  // the export inlines (measured: the element's own `Inter` draws none of them).
  expect(await drawnFaces(client, sel)).toEqual(['Vazirmatn×13']);
  await air.close();
});

test('the control: the same title set to Latin shows, and draws, `14`', async ({ app }) => {
  const { page } = app;
  await app.newProject('TitleDigitsLatin');
  const { id, editor } = await editNewTitle(app, 'latin');
  await typeTitle(page);
  await expect(editor).toHaveText('اخبار ساعت 14');
  await page.keyboard.press('Enter');
  const { html } = await app.exportHtml();
  const air = await onAir(page, html);
  await expect(air.locator(`[data-cg-element-id="${id}"]`)).toHaveText('اخبار ساعت 14');
  await air.close();
});

test('Keyboard: with the signal switched from latin to persian mid-typing, `12` then `34` reads `12۳۴`', async ({
  app,
}) => {
  const { page } = app;
  // The desktop shell's one read-only command, faked: its answer is whatever `__kb` holds.
  await page.addInitScript(() => {
    const w = window as unknown as { __kb: string; __TAURI_INTERNALS__: unknown };
    w.__kb = 'latin';
    w.__TAURI_INTERNALS__ = {
      invoke: (command: string) =>
        command === 'keyboard_language'
          ? Promise.resolve(w.__kb)
          : Promise.reject(new Error(`not faked here: ${command}`)),
    };
  });
  await page.reload();
  await app.newProject('KeyboardDigits');
  const { id, editor } = await editNewTitle(app, 'as-typed');
  await pressDigit(page, '1', 'row');
  await pressDigit(page, '2', 'numpad');
  await expect(editor).toHaveText('12');
  // The operator switches to Persian (Alt+Shift): the shell reports it on its next answer.
  await page.evaluate(() => {
    (window as unknown as { __kb: string }).__kb = 'persian';
  });
  await page.waitForTimeout(600); // two of the detector's 250 ms polls while the box has focus
  await pressDigit(page, '3', 'row');
  await pressDigit(page, '4', 'numpad');
  await expect(editor).toHaveText('12۳۴');
  await page.keyboard.press('Enter');
  // Keyboard is the identity on the page: the text draws exactly as it was written.
  await expect(app.canvasFrame.locator(`[data-cg-element-id="${id}"]`)).toHaveText('12۳۴');
});

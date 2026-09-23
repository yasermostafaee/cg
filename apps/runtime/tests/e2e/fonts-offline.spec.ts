import { expect, test } from '@playwright/test';

/**
 * `P-001` / `DESKTOP-APPS-01` §2B — **PERSIAN RENDERS IN VAZIRMATN WITH NO FONT REQUEST LEAVING
 * THE MACHINE.**
 *
 * Every host but the one serving the page is made unreachable, as it is on a LAN-only broadcast
 * machine, and every request that tries to leave is recorded.
 *
 *   - The ABSENCE: no font or stylesheet request is made to any host but the page's own.
 *   - Its CONTROL: the Persian face IS applied — the UI's own stack resolves to Vazirmatn, the
 *     Arabic-range Vazirmatn face reports `loaded`, and its file was fetched from the page's own
 *     origin. Without the control, a page that loaded no font at all would pass the absence.
 *
 * `test` comes from `@playwright/test` directly so nothing else is armed: the mock backend is
 * turned on here by hand, only so no bridge socket is attempted.
 */

test('P-001 — Persian renders in the self-hosted Vazirmatn, and no font request leaves the machine', async ({
  page,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('this spec needs the preview server baseURL');
  const local = new URL(baseURL).host;

  const offMachine: { url: string; type: string }[] = [];
  const localFonts: string[] = [];
  await page.route(
    (url) => url.protocol.startsWith('http') && url.host !== local,
    async (route) => {
      offMachine.push({ url: route.request().url(), type: route.request().resourceType() });
      await route.abort('internetdisconnected');
    },
  );
  page.on('request', (req) => {
    if (req.resourceType() === 'font' && new URL(req.url()).host === local) {
      localFonts.push(new URL(req.url()).pathname);
    }
  });
  await page.addInitScript(() => {
    const w = window as unknown as { CG_E2E: boolean; __CG_SPLASH_DISABLED__: boolean };
    w.CG_E2E = true;
    w.__CG_SPLASH_DISABLED__ = true;
  });

  await page.goto('/');
  // Persian text set in the UI's own font stack — the stack every surface inherits.
  const applied = await page.evaluate(async () => {
    const probe = document.createElement('p');
    probe.textContent = 'سلام، کنترل پخش ۱۲۳';
    probe.style.fontFamily = 'var(--cg-font)';
    document.body.append(probe);
    void probe.offsetWidth; // lay it out, so the unicode-range face is requested
    await document.fonts.ready;
    const arabicFace = [...document.fonts].find(
      (f) => f.family.replace(/["']/g, '') === 'Vazirmatn' && /U\+600/i.test(f.unicodeRange),
    );
    return {
      family: getComputedStyle(probe).fontFamily,
      arabicFaceStatus: arabicFace?.status ?? 'missing',
    };
  });

  // The control: the face is applied, and it came from this machine.
  expect(applied.family).toMatch(/^"?Vazirmatn"?,/);
  expect(applied.arabicFaceStatus).toBe('loaded');
  expect(localFonts.some((p) => p.startsWith('/fonts/vazirmatn/vazirmatn-arabic-'))).toBe(true);
  // The absence, measured against that control.
  expect(offMachine.filter((r) => r.type === 'font' || r.type === 'stylesheet')).toEqual([]);
  expect(offMachine.map((r) => r.url).filter((u) => u.includes('jsdelivr'))).toEqual([]);
});

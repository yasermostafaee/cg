import { expect, test } from '@playwright/test';

/**
 * `P-001` / `DESKTOP-APPS-01` §2B — **PERSIAN RENDERS IN VAZIRMATN WITH NO FONT REQUEST LEAVING
 * THE MACHINE** — the Designer's half of the Runtime spec of the same name.
 *
 * The Designer already self-hosted its faces; this pins it, because CG Designer now ships as an
 * installed app on machines that are often offline. Every host but the page's own is made
 * unreachable and every attempt to leave is recorded.
 *
 *   - The ABSENCE: no font or stylesheet request is made to any host but the page's own.
 *   - Its CONTROL: Persian set in Vazirmatn — the family authored text uses — loads the
 *     Arabic-range face from the page's own origin and reports it `loaded`.
 *
 * ⚠ The probe names Vazirmatn itself rather than inheriting the body stack, and that was a
 * measured choice: the Designer's CHROME stack put `system-ui` / `'Segoe UI'` before Vazirmatn
 * (`index.css`), so on Windows Persian chrome text rendered in Segoe UI and never requested
 * Vazirmatn at all. ⭐ `B-263` (`MULTI-CHANNEL-01` §2 K) fixed the chrome stack; that fix is
 * measured by `chrome-persian-font.spec.ts`, and this spec keeps asking its own question — the
 * AUTHORED family — unchanged.
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
  const applied = await page.evaluate(async () => {
    const probe = document.createElement('p');
    probe.textContent = 'سلام، طراح گرافیک ۱۲۳';
    probe.style.fontFamily = 'Vazirmatn';
    document.body.append(probe);
    void probe.offsetWidth;
    await document.fonts.ready;
    const arabicFace = [...document.fonts].find(
      (f) => f.family.replace(/["']/g, '') === 'Vazirmatn' && /U\+600/i.test(f.unicodeRange),
    );
    return {
      family: getComputedStyle(probe).fontFamily,
      arabicFaceStatus: arabicFace?.status ?? 'missing',
    };
  });

  expect(applied.family).toMatch(/^"?Vazirmatn"?$/);
  expect(applied.arabicFaceStatus).toBe('loaded');
  expect(localFonts.some((p) => p.startsWith('/fonts/vazirmatn/vazirmatn-arabic-'))).toBe(true);
  expect(offMachine.filter((r) => r.type === 'font' || r.type === 'stylesheet')).toEqual([]);
});

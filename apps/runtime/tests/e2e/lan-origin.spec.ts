import { expect, test } from '@playwright/test';

/**
 * `P-041` — a page served from a LAN address probes the bridge at THAT address.
 *
 * The defect, stated so it can be tested: a page opened at `192.168.21.93:5174` that
 * calls `127.0.0.1:5280`. It cannot be tested from the dev machine by opening the LAN
 * address, because there `localhost` and the LAN address are the same box and a wrong
 * client still connects. So this spec gives the page an origin that CANNOT be loopback —
 * an unresolvable name, `cg-plant-dev.test` — and routes every request for it to the real
 * preview server at the network layer, before DNS ever sees the name. The page believes it
 * was served from that host; the only thing that can make its bridge probe target
 * `ws://cg-plant-dev.test:5280` is deriving the host from the page's own origin.
 *
 * `test` comes from `@playwright/test` directly, not `./fixtures/runtime.js`: the shared
 * harness arms `CG_E2E` (the mock — no socket at all) and pins `__CG_BRIDGE_URL__` (the
 * override that would win over the derivation). Neither may be set here; the LIVE backend
 * must decide the URL by itself. The probe is refused (nothing listens at that name) and
 * the app lands in its honest DISCONNECTED state, which is fine — the assertion is the
 * URL, not the connection. The WebSocket is observed at creation, so it needs no bridge.
 */

const LAN_HOST = 'cg-plant-dev.test';
const LAN_PORT = 5174;
const BRIDGE_PORT = 5280;

test('a page opened at a LAN host derives its bridge URL from that host, never loopback', async ({
  page,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('this spec needs the preview server baseURL');
  const origin = `http://${LAN_HOST}:${String(LAN_PORT)}`;

  // Proxy the fake LAN origin to the real preview server.
  await page.route(
    (url) => url.href.startsWith(`${origin}/`),
    async (route) => {
      const real = route.request().url().replace(origin, baseURL);
      const response = await route.fetch({ url: real });
      await route.fulfill({ response });
    },
  );
  await page.addInitScript(() => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
  });

  // Two witnesses, because they see different failures. Playwright's `websocket` event
  // fires for a socket whose NAME cannot resolve (the fake host) but not for one refused
  // at connect (a loopback port with no listener — exactly what the OLD constant produced
  // on a second machine). Chromium's console names both: "WebSocket connection to
  // 'ws://…' failed". Reading both means the negative assertion below can actually see
  // a loopback attempt rather than merely fail to see the right one.
  const sockets: string[] = [];
  page.on('websocket', (ws) => {
    sockets.push(ws.url());
  });
  page.on('console', (m) => {
    const match = /WebSocket connection to '([^']+)'/.exec(m.text());
    if (match?.[1] !== undefined) sockets.push(match[1]);
  });

  await page.goto(`${origin}/`);

  await expect
    .poll(() => sockets.find((u) => u.includes(`:${String(BRIDGE_PORT)}`)), { timeout: 15_000 })
    .toBe(`ws://${LAN_HOST}:${String(BRIDGE_PORT)}/`);
  // And never the old constant — from a second machine that is ITS loopback, not the dev box.
  expect(sockets.filter((u) => /127\.0\.0\.1|localhost/.test(u))).toEqual([]);
});

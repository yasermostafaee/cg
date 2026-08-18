// @ts-check
import http from 'node:http';

/**
 * THE BEACON HARNESS — the PAGE half of a plant probe, beside `live-probe-lib.mjs`'s
 * AMCP half.
 *
 * 🔴 **Why it is committed rather than rebuilt each time.** This is the SECOND AMCP
 * harness this project has reconstructed from a prose description of the first
 * (session AK built `live-probe-lib.mjs`; session AR rebuilt this half from
 * `design.md` §9.1). That is one rule derived twice in instrument form — the shape this
 * repo names as its most frequent failure — and it has a second cost the usual one does
 * not: **a measurement whose instrument cannot be re-run cannot be re-verified.** These
 * readings are among the most expensive artefacts the project produces (plant access, a
 * live channel, an owner's time), so the instrument lives beside them.
 *
 * ── WHAT IT ADDS OVER `live-probe-lib.mjs` ─────────────────────────────────
 *
 * That module can send AMCP and read pixels back through `PRINT`. It cannot see INSIDE
 * the page, and it cannot see a page DIE. This one serves instrumented pages that beacon
 * back over HTTP, timestamped **at receipt on this side**, so every delta shares one
 * clock:
 *
 *   ready   — script eval
 *   frame   — first COMMITTED frame (double `requestAnimationFrame`)
 *   hb      — one per animation frame
 *   update  — `window.update()` fired, carrying its payload
 *
 * ⭐ **The `hb` heartbeat is the load-bearing one.** A page that stops beaconing has
 * stopped being ticked, which is what makes "did this producer die?" answerable without a
 * frame capture. It is how session AR established that a second `CG ADD` at a different
 * cg-layer REPLACES the page rather than layering on top of it.
 *
 * ── THE CONTROL DISCIPLINE, BUILT IN ───────────────────────────────────────
 *
 * 🔴 **A negative observation is not a result.** Reading "no beacon" as "the page is dead"
 * is only valid once the instrument is proven live, so {@link assertAlive} refuses (throws
 * VOID) rather than returning a value when a page cannot be shown to be beaconing. Pair it
 * with {@link negativeControl}, which proves the plant reaches this harness at all and that
 * a page which never loads produces silence — without it, "no beacon" is equally explained
 * by a command that never landed.
 *
 * Plain ESM, no build step, no dependency — same reason as its sibling: this runs at a
 * plant, where `pnpm build` and `node_modules` are the least available things in the
 * building.
 */

/** The LAN address the plant must be able to reach this harness on. */
export const DEFAULT_LAN_HOST = '192.168.21.93';

const GIF_1PX = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');

/**
 * The beacon preamble every instrumented page carries.
 *
 * `new Image().src` rather than `fetch` or `sendBeacon`: it is fire-and-forget, never
 * blocks the frame it is reporting, and is not subject to the batching that would smear a
 * per-frame heartbeat into a useless average.
 */
function beaconScript(id, origin) {
  return `
var ID=${JSON.stringify(id)};
function b(kind, extra){
  var i=new Image();
  i.src=${JSON.stringify(origin)}+'/b?id='+ID+'&k='+kind+
    (extra===undefined?'':('&v='+encodeURIComponent(String(extra))))+'&r='+Math.random();
}
b('ready');
var __first=false;
requestAnimationFrame(function(){requestAnimationFrame(function(){
  if(!__first){__first=true;b('frame');}
  (function tick(){b('hb');requestAnimationFrame(tick);})();
});});
window.update=function(d){b('update', typeof d==='string'?d:JSON.stringify(d));};
window.play=function(){b('play');};
window.stop=function(){b('stop');};`;
}

/**
 * An instrumented page: your CSS and body, plus the beacon preamble.
 *
 * `extraScript` runs AFTER the preamble, so it can call `b(kind, value)` to report its own
 * readings — which is how the CEF capability, curve-interpolation and frame-rate probes
 * report without needing a channel to be captured.
 */
export function instrumentedPage({ id, origin, css = '', body = '', extraScript = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${id}</title>
<style>html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden}${css}</style>
</head><body>${body}
<script>${beaconScript(id, origin)}
${extraScript}
</script></body></html>`;
}

/** A full-frame opaque page — the standard "is this one on the layer?" probe subject. */
export function solidPage(id, colour, origin) {
  return instrumentedPage({
    id,
    origin,
    css: `body{background:${colour}}#t{font:700 120px sans-serif;color:#fff;padding:40px}`,
    body: `<div id="t">${id}</div>`,
  });
}

/**
 * Start the harness. `pages` maps a pathname to a function of `origin` returning HTML, so
 * a page can embed the beacon origin it must post back to.
 */
export async function startBeaconServer({
  port = 7912,
  lanHost = DEFAULT_LAN_HOST,
  pages = {},
} = {}) {
  const origin = `http://${lanHost}:${String(port)}`;
  const log = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', origin);
    log.push({ t: Date.now(), path: u.pathname, q: Object.fromEntries(u.searchParams) });
    if (u.pathname === '/b') {
      res.writeHead(200, { 'content-type': 'image/gif', 'cache-control': 'no-store' });
      res.end(GIF_1PX);
      return;
    }
    const make = pages[u.pathname];
    if (make === undefined) {
      // A 404 here is not a fault: the NEGATIVE CONTROL depends on the plant being able
      // to fetch a URL that yields no page.
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('no page');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(make(origin));
  });
  await new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(undefined)));

  const api = {
    origin,
    url: (pathname) => `${origin}${pathname}`,
    events: () => log,
    clear: () => {
      log.length = 0;
    },
    /** Beacons of one kind from one page id, in receipt order. */
    beacons: (id, kind) => log.filter((e) => e.path === '/b' && e.q.id === id && e.q.k === kind),
    /** Did the plant FETCH this path from us? The proof it can reach the harness at all. */
    fetched: (pathname) => log.filter((e) => e.path === pathname),
    until: async (pred, ms) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (pred()) return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    },
    /** Heartbeats per second over `ms`, measured now. */
    rate: async (id, ms = 600) => {
      const before = api.beacons(id, 'hb').length;
      await new Promise((r) => setTimeout(r, ms));
      return (api.beacons(id, 'hb').length - before) / (ms / 1000);
    },
    stop: () => new Promise((r) => server.close(() => r(undefined))),
  };
  return api;
}

/**
 * 🔴 POSITIVE CONTROL — prove a page is ALIVE before any later silence is allowed to mean
 * anything. THROWS (VOID) rather than returning false: a measurement whose setup was not
 * verified is not a result, and the one outcome worse than no value is a wrong one.
 */
export async function assertAlive(harness, id, { minRate = 5, windowMs = 600 } = {}) {
  const rate = await harness.rate(id, windowMs);
  if (rate < minRate) {
    throw new Error(
      `VOID — page "${id}" is not heart-beating (${rate.toFixed(1)}/s < ${String(minRate)}/s). ` +
        'Its silence later would prove nothing.',
    );
  }
  return rate;
}

/**
 * 🔴 NEGATIVE CONTROL — a `CG ADD` at a URL this harness 404s.
 *
 * Both halves matter and neither is sufficient: the command must be ACCEPTED and the plant
 * must be seen FETCHING the bad URL from us. Without those, "no beacon fired" is equally
 * explained by a command that never landed or a plant that cannot reach us — and the whole
 * instrument would be measuring nothing.
 */
export async function negativeControl(command, harness, { channel = 1, layer = 150 } = {}) {
  const path = '/__no-such-page.html';
  const before = harness.events().length;
  const reply = await command(
    `CG ${String(channel)}-${String(layer)} ADD 0 "${harness.url(path)}" 1 "{}"`,
    {
      expectOk: false,
    },
  );
  const fetched = await harness.until(() => harness.fetched(path).length > 0, 4000);
  const beaconed = harness
    .events()
    .slice(before)
    .some((e) => e.path === '/b');
  await command(`CLEAR ${String(channel)}-${String(layer)}`, { expectOk: false });
  return {
    accepted: reply.code >= 200 && reply.code < 300,
    plantFetchedTheBadUrl: fetched,
    anyBeaconFired: beaconed,
    valid: reply.code >= 200 && reply.code < 300 && fetched && !beaconed,
  };
}

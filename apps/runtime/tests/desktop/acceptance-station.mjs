#!/usr/bin/env node
/**
 * 🔴 `RELEASE-0110-01` §3 — **A FAKE STATION FOR THE INSTALLED APPS: the Playout and CasparCG's
 * stand-in, on this runner's loopback**, so the release acceptance (`release-acceptance.mjs`) can drive
 * the INSTALLED CG Bridge and CG Control end to end — sign in, a channel, a take on air, a clear — and
 * prove an upgrade sends CasparCG no `CLEAR`.
 *
 * It is the test suite's own composition (`tools/caspar-bridge/tests/support/fake-station.ts`, as
 * `pnpm dev:station --fake` runs it): the fake Playout (its automatic path open to this loopback
 * machine) and `@cg/amcp-mock` on 127.0.0.1:5250 with two channels behind that Playout's allow list.
 * The fakes are TypeScript, run by Node's own type stripping (Node 23.6 or newer), from a checkout
 * whose workspace is installed and whose `@cg/amcp-mock` is built.
 *
 * It writes `station.json` (the Playout's address, the fixture account, the AMCP address, and a
 * control port) and then serves, on 127.0.0.1 only, what the acceptance reads of CasparCG's side:
 *
 *   GET /lines            every AMCP line CasparCG received, in order
 *   GET /layer?channel&layer   what is on that layer (`MockHandle.layerState`), or null
 *   GET /playout/offline  `B-320` — the Playout stops answering, its port and every URL kept
 *   GET /playout/online   …and answers again, on the same port
 *
 * It runs until it is killed. Test instrumentation only: nothing here ships.
 *
 *   node acceptance-station.mjs --out <dir> [--control-port 59321] [--amcp-port 5250]
 *                               [--playout-port 8080]
 */
/* global process, URL */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, all) =>
        i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs,
      [],
    ),
);
const OUT = path.resolve(args.out ?? 'acceptance');
const CONTROL_PORT = Number(args['control-port'] ?? 59321);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SUPPORT = path.join(REPO, 'tools', 'caspar-bridge', 'tests', 'support');
const load = (file) => import(pathToFileURL(file).href);

const major = Number(process.versions.node.split('.')[0]);
if (major < 23) {
  process.stderr.write(
    `the fakes need Node 23.6 or newer (type stripping); this is ${process.version}\n`,
  );
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const [playoutMod, feedMod, stationMod, casparMod] = await Promise.all([
  load(path.join(SUPPORT, 'fake-playout.ts')),
  load(path.join(SUPPORT, 'fake-pgm-feed.ts')),
  load(path.join(SUPPORT, 'fake-station.ts')),
  load(path.join(REPO, 'tools', 'amcp-mock', 'dist', 'index.js')),
]);
// The runner's CasparCG is the standard 5250 (CG Bridge's installer writes it); another port only
// for a dry run of this file on a machine whose 5250 is somebody else's.
const ports =
  args['amcp-port'] === undefined
    ? stationMod.FAKE_STATION_PORTS
    : { ...stationMod.FAKE_STATION_PORTS, amcp: Number(args['amcp-port']), pgm: [] };
// The Playout where CG Bridge's installer looks by default (`cg-bridge.nsi`: http://127.0.0.1:8080), so
// an install with no arguments — the guide's — finds it, exactly as on a Playout machine.
const playoutPort = Number(args['playout-port'] ?? 8080);
const station = await stationMod.startFakeStation(
  {
    startFakePlayout: (options) => playoutMod.startFakePlayout({ ...options, port: playoutPort }),
    createMock: casparMod.createMock,
    startFakePgmFeed: feedMod.startFakePgmFeed,
  },
  ports,
  { tracePath: path.join(OUT, 'amcp-trace.ndjson') },
);
const caspar = station.caspar;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${String(CONTROL_PORT)}`);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/lines') {
    send(
      200,
      caspar.receivedCommands().map((c) => c.line),
    );
    return;
  }
  if (url.pathname === '/layer') {
    const channel = Number(url.searchParams.get('channel'));
    const layer = Number(url.searchParams.get('layer'));
    send(200, caspar.layerState({ channel, layer }) ?? null);
    return;
  }
  /*
    `B-320` (`SIGNIN-ESCAPE-01`) — the owner's stuck station is a CG Bridge whose Playout does not
    answer. The fake goes OFFLINE keeping its port, its key and every URL, so CG Bridge's configuration
    does not change, and comes back ONLINE as it was.
  */
  if (url.pathname === '/playout/offline' || url.pathname === '/playout/online') {
    const going =
      url.pathname === '/playout/offline'
        ? station.playout.goOffline()
        : station.playout.goOnline();
    going.then(
      () => send(200, { ok: true }),
      (err) => send(500, { error: String(err) }),
    );
    return;
  }
  send(404, { error: 'unknown' });
});
await new Promise((resolve) => server.listen(CONTROL_PORT, '127.0.0.1', resolve));

const facts = {
  playout: station.playout.baseUrl,
  username: playoutMod.FAKE_ADMIN.username,
  password: playoutMod.FAKE_PLAYOUT_PASSWORD,
  amcp: `${stationMod.FAKE_STATION_HOST}:${String(caspar.amcpPort)}`,
  control: `http://127.0.0.1:${String(CONTROL_PORT)}`,
  notes: station.notes,
};
fs.writeFileSync(path.join(OUT, 'station.json'), JSON.stringify(facts, null, 2));
process.stdout.write(`fake station up: ${JSON.stringify(facts)}\n`);

const stop = async () => {
  server.close();
  await station.stop();
  process.exit(0);
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

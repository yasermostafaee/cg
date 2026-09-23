import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `DESKTOP-APPS-01-B` B1.4 — **THE BRIDGE REACHES THE PLAYOUT DIRECTLY, WHATEVER THE ENVIRONMENT
 * SAYS ABOUT PROXIES.**
 *
 * A Playout 2.8.54 trusts the SOURCE of a station-admin's server-side read, and does not honour
 * `X-Forwarded-For` — so a read that leaves through a proxy trusts the proxy, and this station's
 * AMCP stays shut. Measured 2026-09-23 on Node 26: with `NODE_USE_ENV_PROXY=1` and `HTTP_PROXY`
 * set, the global `fetch` — and `jose`'s key-set read, which uses it — went to the proxy.
 *
 * The proof runs in a CHILD process, because Node reads those variables at start-up. It points
 * them at a port with nothing listening, then asks three things of the built bridge:
 *
 *   - CONTROL: the global `fetch` in that child fails — the environment really is proxying there;
 *   - `playoutFetch` (the D4 and D9 reads) reaches the fake Playout;
 *   - `PlayoutAuth.verify` fetches the JWKS and accepts a token — the key set too went direct.
 *
 * On a Node that ignores `NODE_USE_ENV_PROXY` the control cannot hold, and the test SKIPS saying
 * so rather than passing on an instrument that measured nothing.
 */

const DIST = pathToFileURL(fileURLToPath(new URL('../dist/index.js', import.meta.url))).href;

let playout: FakePlayout | null = null;
afterEach(async () => {
  await playout?.stop();
  playout = null;
});

function deadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

const CHILD = `
const [dist, channelsUrl, jwksUrl, issuer, token] = process.argv.slice(1);
const { playoutFetch, PlayoutAuth } = await import(dist);
const out = {};
try {
  const r = await fetch(channelsUrl, { headers: { authorization: 'Bearer ' + token } });
  out.globalFetch = r.status;
} catch (err) {
  out.globalFetch = 'failed: ' + (err.cause?.code ?? err.message);
}
try {
  const r = await playoutFetch(channelsUrl, { headers: { authorization: 'Bearer ' + token } });
  out.playoutFetch = r.status;
} catch (err) {
  out.playoutFetch = 'failed: ' + (err.cause?.code ?? err.message);
}
const auth = new PlayoutAuth({
  address: null, issuer, jwksUrl, tokenUrl: channelsUrl, refreshUrl: channelsUrl,
  channelsUrl, revokedUrl: channelsUrl, audience: 'cg-control',
});
const verified = await auth.verify(token);
out.verify = verified.ok ? 'ok' : verified.refusal;
auth.dispose();
process.stdout.write(JSON.stringify(out));
`;

describe('B1.4 — no proxy between the bridge and the Playout', () => {
  it('with the environment proxying everything, the D4/D9 reads and the key set still go direct', async (ctx) => {
    playout = await startFakePlayout();
    const admin = await playout.issueToken({ user: 'admin' });
    const proxy = `http://127.0.0.1:${String(await deadPort())}`;
    // ASYNC, never `spawnSync`: the fake Playout lives in THIS process and must stay free to answer.
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        CHILD,
        DIST,
        playout.channelsUrl,
        playout.jwksUrl,
        playout.issuer,
        admin.token,
      ],
      {
        env: {
          ...process.env,
          NODE_USE_ENV_PROXY: '1',
          HTTP_PROXY: proxy,
          HTTPS_PROXY: proxy,
          http_proxy: proxy,
          https_proxy: proxy,
          NO_PROXY: '',
          no_proxy: '',
        },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const status = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 30_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    expect(status, stderr).toBe(0);
    const out = JSON.parse(stdout) as Record<string, unknown>;

    if (typeof out.globalFetch === 'number') {
      process.stderr.write(
        `[B1.4] SKIPPED — Node ${process.version} ignores NODE_USE_ENV_PROXY: the control could ` +
          'not show the environment proxying, so the absence below would have measured nothing\n',
      );
      ctx.skip();
    }
    // CONTROL — in this child the environment's proxy is live: the global fetch went to it.
    expect(out.globalFetch).toMatch(/^failed/);
    // The bridge's reads did not.
    expect(out.playoutFetch).toBe(200);
    expect(out.verify).toBe('ok');
    // And the fake saw them arrive from this machine, not from anything in between.
    const seen = playout.requestLog.map((r) => `${r.method} ${r.path} ${r.source}`);
    expect(seen).toContain('GET /api/cg/channels 127.0.0.1');
    expect(seen).toContain('GET /.well-known/jwks.json 127.0.0.1');
  });
});

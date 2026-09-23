import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_STATION_NOT_SET_UP,
  AUTH_TOKEN_WRONG_STATION,
  defaultFixedLayerBank,
} from '@cg/shared-ipc';
import {
  createBridge,
  loadPlayoutFile,
  persistAdoptedIssuer,
  PlayoutCatalogue,
  resolveCatalogueHost,
  resolvePlayoutSettings,
  writePlayoutAddress,
  type BridgeHandle,
} from '../src/index.js';
import { deadConnection, expectRefusedWith, openClient, waitFor } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `DESKTOP-APPS-01-A` — **FIRST-RUN MUST NOT DEPEND ON THE CLIENT'S ADDRESSES.**
 *
 *   A1 — every endpoint derives from the configured Playout ADDRESS; the issuer is optional.
 *   A2 — the issuer is LEARNED from the first `station-admin` sign-in, persisted, then compared.
 *   A3 — before adoption, only adoption is accepted; an unset issuer never means "any `iss`".
 *   A4 — a loopback `casparHost` is the Playout's own machine, resolved inside the one D4 reader.
 *
 * A fixed, address-free `iss` (`urn:apasai:playout`, the Playout team's proposal) is used on
 * purpose: nothing may be derived from it, and the bridge must never need it typed.
 */

const URN = 'urn:apasai:playout';

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  await playout?.stop();
  handle = null;
  playout = null;
});

function tmpConfig(): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cg-playout-address-')),
    'bridge-playout.json',
  );
}

describe('A1 — the endpoints derive from the Playout address; the issuer is not required', () => {
  it('with only an address, all five endpoints derive from it and there is no issuer yet', () => {
    const settings = resolvePlayoutSettings(
      {},
      { auth: 'playout', playout: { address: 'http://playout.example:8080/' } },
    );
    expect(settings.playout).toEqual({
      address: 'http://playout.example:8080',
      issuer: null,
      jwksUrl: 'http://playout.example:8080/.well-known/jwks.json',
      tokenUrl: 'http://playout.example:8080/api/cg/auth/token',
      refreshUrl: 'http://playout.example:8080/api/cg/auth/refresh',
      channelsUrl: 'http://playout.example:8080/api/cg/channels',
      revokedUrl: 'http://playout.example:8080/api/cg/revoked',
      audience: 'cg-control',
    });
  });

  it('an address-free issuer is accepted as a value to compare — nothing is derived from it', () => {
    const settings = resolvePlayoutSettings(
      { address: 'http://10.0.0.9:8080', issuer: URN },
      { auth: 'playout' },
    );
    expect(settings.playout?.issuer).toBe(URN);
    expect(settings.playout?.jwksUrl).toBe('http://10.0.0.9:8080/.well-known/jwks.json');
  });

  it('CONTROL — an explicit issuer + jwksUrl, with no address, behaves exactly as before', () => {
    const settings = resolvePlayoutSettings(
      {
        auth: 'playout',
        issuer: 'http://playout.local:8080',
        jwksUrl: 'http://keys.local/jwks.json',
      },
      null,
    );
    expect(settings).toEqual({
      mode: 'playout',
      playout: {
        address: null,
        issuer: 'http://playout.local:8080',
        jwksUrl: 'http://keys.local/jwks.json',
        tokenUrl: 'http://playout.local:8080/api/cg/auth/token',
        refreshUrl: 'http://playout.local:8080/api/cg/auth/refresh',
        channelsUrl: 'http://playout.local:8080/api/cg/channels',
        revokedUrl: 'http://playout.local:8080/api/cg/revoked',
        audience: 'cg-control',
      },
    });
    // …and without an address the issuer is still REQUIRED, exactly as before.
    expect(() => resolvePlayoutSettings({ auth: 'playout' }, null)).toThrow(
      /playout\.issuer is missing/,
    );
  });
});

/** A bridge configured the way first-run leaves it: the address in the file, nothing else. */
async function addressOnlyBridge(configPath: string, fake: FakePlayout): Promise<BridgeHandle> {
  writePlayoutAddress(configPath, fake.baseUrl);
  return createBridge({ port: 0, connection: deadConnection(), playoutConfigPath: configPath });
}

describe('A2/A3 — the issuer is learned from the first station-admin sign-in, never typed', () => {
  it('before adoption an operator is refused as "not set up", and NOTHING is persisted', async () => {
    playout = await startFakePlayout();
    const configPath = tmpConfig();
    handle = await addressOnlyBridge(configPath, playout);
    const client = await openClient(handle);

    const operator = await playout.issueToken({ user: 'operator', issuer: URN });
    const res = await client.authenticate('a1', operator.token);
    expectRefusedWith(res.error, AUTH_STATION_NOT_SET_UP, 'an operator before adoption');
    // The absence…
    expect(handle.playoutAuth?.issuer).toBeNull();
    expect(loadPlayoutFile(configPath)?.playout?.issuer).toBeUndefined();

    // …and its control: the SAME operator token is accepted once a station-admin has adopted.
    const admin = await playout.issueToken({ user: 'admin', issuer: URN });
    expect((await client.authenticate('a2', admin.token)).error).toBeUndefined();
    const second = await openClient(handle);
    expect((await second.authenticate('a3', operator.token)).error).toBeUndefined();
  });

  it('the first station-admin sign-in adopts and PERSISTS its iss; a different iss is then refused', async () => {
    playout = await startFakePlayout();
    const configPath = tmpConfig();
    handle = await addressOnlyBridge(configPath, playout);
    const client = await openClient(handle);

    const admin = await playout.issueToken({ user: 'admin', issuer: URN });
    expect((await client.authenticate('b1', admin.token)).error).toBeUndefined();
    expect(handle.playoutAuth?.issuer).toBe(URN);
    expect(loadPlayoutFile(configPath)?.playout).toEqual({ address: playout.baseUrl, issuer: URN });

    // A station-admin of ANOTHER issuer is refused — never re-adopted, and said in words.
    const stranger = await playout.issueToken({ user: 'admin', issuer: 'urn:someone:else' });
    const other = await openClient(handle);
    expectRefusedWith(
      (await other.authenticate('b2', stranger.token)).error,
      AUTH_TOKEN_WRONG_STATION,
      'a different iss after adoption',
    );
    expect(handle.playoutAuth?.issuer).toBe(URN);
    expect(loadPlayoutFile(configPath)?.playout?.issuer).toBe(URN);
  });

  it('a restarted bridge keeps the adopted issuer: it is now a configured one', async () => {
    playout = await startFakePlayout();
    const configPath = tmpConfig();
    writePlayoutAddress(configPath, playout.baseUrl);
    persistAdoptedIssuer(configPath, URN);
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      playoutConfigPath: configPath,
    });
    expect(handle.playoutAuth?.issuer).toBe(URN);
    const client = await openClient(handle);
    const operator = await playout.issueToken({ user: 'operator', issuer: URN });
    expect((await client.authenticate('c1', operator.token)).error).toBeUndefined();
  });

  it('changing the Playout address clears the adopted issuer; the next station-admin adopts again', async () => {
    const configPath = tmpConfig();
    writePlayoutAddress(configPath, 'http://old-playout:8080');
    persistAdoptedIssuer(configPath, URN);
    expect(loadPlayoutFile(configPath)?.playout?.issuer).toBe(URN); // control: it WAS adopted

    const written = writePlayoutAddress(configPath, 'http://new-playout:8080/');
    expect(written).toBe('http://new-playout:8080');
    expect(loadPlayoutFile(configPath)).toEqual({
      auth: 'playout',
      playout: { address: 'http://new-playout:8080' },
    });
    expect(resolvePlayoutSettings({}, loadPlayoutFile(configPath)).playout?.issuer).toBeNull();
  });
});

describe('A4 — a loopback casparHost is the Playout’s own machine', () => {
  const row = (casparHost: string) => ({ id: 'r', name: 'n', casparHost, casparChannel: 2 });

  it('every loopback spelling resolves to the Playout host; any other host passes byte for byte', () => {
    for (const loop of ['127.0.0.1', '127.9.8.7', 'localhost', 'LOCALHOST', '::1']) {
      expect(resolveCatalogueHost(row(loop), '192.168.50.7').casparHost, loop).toBe('192.168.50.7');
    }
    // Control: a real host is untouched.
    expect(resolveCatalogueHost(row('10.1.2.3'), '192.168.50.7').casparHost).toBe('10.1.2.3');
    // And a Playout that is itself on loopback rewrites nothing — loopback already names it.
    expect(resolveCatalogueHost(row('127.0.0.1'), '127.0.0.1').casparHost).toBe('127.0.0.1');
  });

  it('the ONE D4 reader applies it, so first-run and channels.list both see the Playout host', async () => {
    playout = await startFakePlayout();
    const configPath = tmpConfig();
    // The address names a NON-loopback Playout host (TEST-NET, never contacted); keys and the
    // catalogue are read from the fake through explicit endpoint overrides, which still win.
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        auth: 'playout',
        playout: {
          address: 'http://192.0.2.50:8080',
          jwksUrl: playout.jwksUrl,
          channelsUrl: playout.channelsUrl,
          revokedUrl: playout.revokedUrl,
        },
      }),
    );
    playout.setChannels([
      { id: 'prog', name: 'Programme', casparHost: '127.0.0.1', casparChannel: 1 },
      { id: 'cg2', name: 'cg-test2', casparHost: 'localhost', casparChannel: 2 },
      { id: 'far', name: 'Elsewhere', casparHost: '10.9.8.7', casparChannel: 3 },
    ]);
    handle = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '192.0.2.50', amcpPort: 1, oscPort: 0 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      },
      fixedLayers: { ...defaultFixedLayerBank(), channel: 2 },
      playoutConfigPath: configPath,
    });
    const client = await openClient(handle);
    const admin = await playout.issueToken({ user: 'admin', issuer: URN, cgChannels: '*' });
    expect((await client.authenticate('d1', admin.token)).error).toBeUndefined();
    await waitFor(() => (handle?.playoutCatalogue?.rows() ?? null) !== null);

    const catalogue = (await client.ask('d2', 'channels.catalogue')).payload as {
      rows: { casparHost: string; casparChannel: number }[];
    };
    expect(catalogue.rows.map((r) => [r.casparChannel, r.casparHost])).toEqual([
      [1, '192.0.2.50'],
      [2, '192.0.2.50'],
      [3, '10.9.8.7'], // control: a non-loopback host is unchanged
    ]);

    const list = (await client.ask('d3', 'channels.list')).payload as {
      channels: { channel: number; named: { name: string } | null }[];
    };
    const named = (n: number): string | null =>
      list.channels.find((c) => c.channel === n)?.named?.name ?? null;
    expect(named(2)).toBe('cg-test2'); // joined, because its host is now this station's server
    expect(named(3)).toBeNull(); // control: a row on another host joins nothing
  });
});

describe('the unjoined catalogue is filtered by the asker’s grant, per row host', () => {
  it('a station-admin granted one channel sees that channel alone', async () => {
    playout = await startFakePlayout();
    const configPath = tmpConfig();
    handle = await addressOnlyBridge(configPath, playout);
    const client = await openClient(handle);
    const admin = await playout.issueToken({
      user: 'admin',
      issuer: URN,
      cgChannels: [{ host: '127.0.0.1', channel: 2 }],
    });
    expect((await client.authenticate('e1', admin.token)).error).toBeUndefined();
    await waitFor(() => (handle?.playoutCatalogue?.rows() ?? null) !== null);
    const catalogue = (await client.ask('e2', 'channels.catalogue')).payload as {
      rows: { casparChannel: number }[];
    };
    // The fake's catalogue names channels 1 and 2; the grant names 2.
    expect(catalogue.rows.map((r) => r.casparChannel)).toEqual([2]);
  });
});

describe('--first-run — the phase, and a station that has not chosen declares nothing', () => {
  it('auth off → target; then, with no bank declared → channel; declared → no phase', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-first-run-'));
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      firstRun: true,
      fixedLayersPath: path.join(dir, 'bridge-fixed-layers.json'),
    });
    expect(handle.fixedBankSource).toEqual({ bank: null, source: 'first-run' });
    const client = await openClient(handle);
    const caps = (await client.ask('f1', 'bridge.capabilities', {})).payload as { setup?: string };
    expect(caps.setup).toBe('target');
    await handle.close();

    playout = await startFakePlayout();
    const configPath = tmpConfig();
    writePlayoutAddress(configPath, playout.baseUrl);
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      firstRun: true,
      fixedLayersPath: path.join(dir, 'bridge-fixed-layers.json'),
      playoutConfigPath: configPath,
    });
    const admin = await openClient(handle);
    const phaseOf = async (id: string): Promise<string | undefined> =>
      ((await admin.ask(id, 'bridge.capabilities', {})).payload as { setup?: string }).setup;
    expect(await phaseOf('f2')).toBe('channel');

    const token = await playout.issueToken({ user: 'admin', issuer: URN, cgChannels: '*' });
    expect((await admin.authenticate('f3', token.token)).error).toBeUndefined();

    /*
      The bank first-run declares: the chosen channel, the default bands, EVERY row shown. With no
      CasparCG link yet every occupancy is unknown, and installing a bank that already HIDES a row
      is refused (`untick-unknown`) — the rule that stops a live install sliding an on-air layer
      out of sight. Control: the default visibility is refused for exactly that reason.
    */
    const hiding = (
      await admin.ask('f4a', 'fixedLayers.set-config', {
        ...defaultFixedLayerBank(),
        channel: 2,
      })
    ).payload as { ok: boolean; reason?: string };
    expect(hiding.reason).toBe('untick-unknown');
    const base = defaultFixedLayerBank();
    const shown = (v: Record<string, boolean> | undefined): Record<string, boolean> =>
      Object.fromEntries(Object.keys(v ?? {}).map((k) => [k, true]));
    const declared = (
      await admin.ask('f4', 'fixedLayers.set-config', {
        ...base,
        channel: 2,
        visibility: shown(base.visibility),
        low: { ...base.low, visibility: shown(base.low.visibility) },
      })
    ).payload as { ok: boolean; reason?: string; message?: string };
    expect(declared).toEqual({ ok: true });
    expect(await phaseOf('f5')).toBeUndefined();
    expect(fs.existsSync(path.join(dir, 'bridge-fixed-layers.json'))).toBe(true);
  });

  it('CONTROL — without --first-run the phase is never advertised and the default bank applies', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-first-run-'));
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      fixedLayersPath: path.join(dir, 'bridge-fixed-layers.json'),
    });
    expect(handle.fixedBankSource.source).toBe('built-in default');
    const client = await openClient(handle);
    const caps = (await client.ask('g1', 'bridge.capabilities', {})).payload as { setup?: string };
    expect(caps.setup).toBeUndefined();
  });
});

describe('the reader itself — A4 lives inside it, not in a consumer', () => {
  it('rewrites a loopback host on read', async () => {
    const body = {
      channels: [
        { id: 'a', name: 'A', casparHost: '127.0.0.1', casparChannel: 1 },
        { id: 'b', name: 'B', casparHost: '10.0.0.4', casparChannel: 2 },
      ],
    };
    const reader = new PlayoutCatalogue('http://playout.example/api/cg/channels', () => 'bearer', {
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }),
      playoutHost: '192.168.21.200',
    });
    await reader.refresh();
    expect(reader.rows()?.map((r) => r.casparHost)).toEqual(['192.168.21.200', '10.0.0.4']);
  });
});

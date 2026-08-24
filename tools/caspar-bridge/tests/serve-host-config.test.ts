import { afterEach, expect, it } from 'vitest';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import {
  normalizeServeHost,
  normalizeServePort,
  resolveServeOverride,
  storedServeOverride,
} from '../src/serve-host-config.js';

/**
 * `C-024` — **the advertised template address, from CONFIGURATION rather than from the command
 * line alone.**
 *
 * `B-162` gave the bridge `--template-serve-host` / `--template-serve-port` and no stored layer, so
 * the address had to be re-typed at every start. These tests pin the three-layer resolution that
 * closes it — **flag > file > derivation** — and the two failures that resolution can produce, both
 * of which are SILENT on every other surface (`CG ADD` returns 200 whether or not the page's later
 * fetch succeeds):
 *
 * 1. a stored value silently beating a flag, which would invert `B-162`'s fix;
 * 2. an empty stored value being advertised as an address (`http://:7911/…`), which every server
 *    accepts and none can fetch.
 */

let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
});

const LOCAL: ConnectionConfig = {
  servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
};

/** A config with a REMOTE backup — the `B-162` shape, where the address actually matters. */
const REMOTE_BACKUP: ConnectionConfig = {
  ...LOCAL,
  servers: {
    A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 },
    B: { host: '192.168.21.50', amcpPort: 5251, oscPort: 6251 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The normalizer — where empty and absent are collapsed, ONCE.
// ─────────────────────────────────────────────────────────────────────────────

it('C-024: an EMPTY serve host is "derive it", never an address — and so is whitespace', () => {
  /*
    🔴 The failure this forbids is not a crash. `serveHost: ''` produces `http://:7911/template/x`,
    which `CG ADD` accepts with a 200 and no server can fetch — `B-162`'s exact silent failure,
    arrived at from the surface built to prevent it.
  */
  expect(normalizeServeHost('')).toBeUndefined();
  expect(normalizeServeHost('   ')).toBeUndefined();
  expect(normalizeServeHost(undefined)).toBeUndefined();
  expect(normalizeServeHost(' 10.0.0.7 ')).toBe('10.0.0.7');
});

it('C-024: port 0 SURVIVES normalization — it is the explicit spelling of ephemeral, not an absence', () => {
  // A `?? 0` anywhere on this path would make a deliberate pin indistinguishable from the
  // derivation. `oscPort` already reads 0 the same way.
  expect(normalizeServePort(0)).toBe(0);
  expect(normalizeServePort(7911)).toBe(7911);
  expect(normalizeServePort(undefined)).toBeUndefined();
  expect(normalizeServePort(-1)).toBeUndefined();
  expect(normalizeServePort(70000)).toBeUndefined();
});

it('C-024: an empty stored host contributes NO key, so it cannot mask the derivation', () => {
  expect(storedServeOverride({ ...LOCAL, templateServeHost: '' })).toEqual({});
  expect(storedServeOverride({ ...LOCAL, templateServeHost: '10.0.0.7' })).toEqual({
    serveHost: '10.0.0.7',
  });
});

it('C-024: the flag layer wins FIELD BY FIELD, not object by object', () => {
  /*
    A `--template-serve-port` with no `--template-serve-host` must mask the port and leave the
    stored host in force. Merging object-wise would drop the stored host the moment any flag was
    passed, which is the kind of change nothing errors on.
  */
  expect(resolveServeOverride({ serveHost: 'stored.host', port: 1111 }, { port: 2222 })).toEqual({
    serveHost: 'stored.host',
    port: 2222,
  });
  expect(resolveServeOverride({ serveHost: 'stored.host' }, { serveHost: 'flag.host' })).toEqual({
    serveHost: 'flag.host',
  });
  expect(resolveServeOverride({ serveHost: 'stored.host' }, {})).toEqual({
    serveHost: 'stored.host',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The runtime — the three layers as the bridge actually resolves them.
// ─────────────────────────────────────────────────────────────────────────────

it('C-024: a STORED serve host is what the bridge advertises (the layer B-162 lacked)', () => {
  runtime = new CasparRuntime({ ...REMOTE_BACKUP, templateServeHost: '192.168.21.93' });
  expect(runtime.templateServeInfo().serveHost).toBe('192.168.21.93');
});

it('C-024: a FLAG overrides the stored value, and the bridge reports the mask rather than the stored one', () => {
  /*
    🔴 Precedence is `R-010`'s, unchanged: boot scripts and automation pass flags, and a value
    saved from a panel silently beating one would be the inverse of the confusion `B-162` fixed —
    undetectable from any surface, because the resulting address is perfectly well-formed.

    And the bridge must SAY so: the panel cannot infer a mask by comparing values (a stored-empty
    host with a derived result differs from the store on every fresh install), so the flag layer is
    reported directly.
  */
  runtime = new CasparRuntime(
    { ...REMOTE_BACKUP, templateServeHost: '192.168.21.93' },
    {
      serveHost: '10.9.9.9',
    },
  );
  const info = runtime.templateServeInfo();
  expect(info.serveHost).toBe('10.9.9.9');
  expect(info.flagOverrides.serveHost).toBe('10.9.9.9');
});

it('C-024: with no flag, NOTHING is reported as masked — a derived host is not an override', () => {
  runtime = new CasparRuntime({ ...REMOTE_BACKUP, templateServeHost: '192.168.21.93' });
  expect(runtime.templateServeInfo().flagOverrides).toEqual({});
});

it('C-024: an EMPTY stored serve host derives, and is byte-identical to an ABSENT one', () => {
  /*
    The two are different VALUES kept deliberately distinct in the schema — the panel must be able
    to CLEAR the field, so `''` has to round-trip through the store — and they must produce the
    IDENTICAL outcome. Testing both is the point: folding them at the schema would take the clear
    away, and treating `''` as an address would advertise nothing fetchable.
  */
  const empty = new CasparRuntime({ ...LOCAL, templateServeHost: '' });
  const absent = new CasparRuntime(LOCAL);
  try {
    expect(empty.templateServeInfo().serveHost).toBe(absent.templateServeInfo().serveHost);
    expect(empty.templateServeInfo().port).toBe(absent.templateServeInfo().port);
  } finally {
    void empty.stop();
    void absent.stop();
  }
});

it('C-024: a stored serve host that a remote server cannot fetch is NAMED, not silently accepted', () => {
  /*
    `B-162`'s ONE predicate, reached through the stored layer. A loopback address typed into the
    panel while a remote server is configured is the `--template-serve-host 127.0.0.1` typo with a
    different door, and it must reach the same verdict.
  */
  runtime = new CasparRuntime({ ...REMOTE_BACKUP, templateServeHost: '127.0.0.1' });
  expect(runtime.templateServeInfo().unreachable).toEqual(['192.168.21.50']);
});

it('C-024: a PINNED stored port is the port served; an absent one stays ephemeral', async () => {
  runtime = new CasparRuntime({ ...LOCAL, templateServePort: 0 });
  // 0 is the explicit ephemeral request, so the bound port is whatever the OS gave — the point is
  // that the pin travelled at all, which the derived case cannot show.
  expect(runtime.templateServeInfo().port).toBe(0);
  await runtime.stop();

  const pinned = new CasparRuntime({ ...LOCAL, templateServePort: 7913 });
  runtime = pinned;
  expect(pinned.templateServeInfo().port).toBe(7913);
});

it('C-024: an applied config puts a NEW serve host in force on the RUNNING bridge, with no restart', async () => {
  /*
    The line that makes the panel work at all. `connections.set-config` already tears down and
    rebuilds template serving, so the address lands on the running process — which is why nothing
    in this change starts, stops or restarts a bridge, and why the panel must not offer to.
  */
  runtime = new CasparRuntime(LOCAL);
  const applied = await runtime.setConfig({ ...LOCAL, templateServeHost: '10.1.2.3' });
  expect(applied.ok).toBe(true);
  expect(runtime.templateServeInfo().serveHost).toBe('10.1.2.3');
});

it('C-024: a flag STILL wins after an apply — the stored value cannot take the address back', async () => {
  /*
    The regression this guards is subtle and one-directional: `#applyConfig` re-derives, and if it
    read the stored layer without re-applying the flag layer on top, an apply would silently hand
    the address to whatever the panel last saved. The flag is process-lifetime; an apply must not
    outlive it.
  */
  runtime = new CasparRuntime(LOCAL, { serveHost: '10.9.9.9' });
  await runtime.setConfig({ ...LOCAL, templateServeHost: '10.1.2.3' });
  expect(runtime.templateServeInfo().serveHost).toBe('10.9.9.9');
  expect(runtime.templateServeInfo().flagOverrides.serveHost).toBe('10.9.9.9');
});

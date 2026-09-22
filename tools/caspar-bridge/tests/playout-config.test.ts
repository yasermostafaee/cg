import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_OFF,
  DEFAULT_PLAYOUT_AUDIENCE,
  PLAYOUT_CONTRACT_VERSION,
  PlayoutConfigError,
  defaultPlayoutConfigPath,
  loadPlayoutFile,
  resolvePlayoutSettings,
} from '../src/index.js';

/**
 * 🔴 `C-037` — **`playout.*`, UNDER `R-010`'s PRECEDENCE: CLI flags > file > default.**
 *
 * …and the half the PRD states as a refusal rather than a value: _"A mode of `playout` with a
 * missing `issuer` or `jwksUrl` is a boot failure with a sentence naming the key, not a silent
 * fall-back to `off` — a bridge that was told to authenticate and quietly does not is the
 * firewall rule that was written and not enforced."_
 *
 * ── WHY THIS GROUP DOES NOT LIVE IN `ConnectionConfig` ──────────────────────
 *
 * The two facts that decided it, both measured in the tree:
 *
 *  1. `ConnectionConfigSchema` IS the `connections.set-config` REQUEST body
 *     (`channels/connections.ts`). Auth configuration there would be rewritable over the very
 *     socket `C-037` exists to gate.
 *  2. `loadPersistedConnection` WARNS AND IGNORES an invalid file and falls through to the
 *     default. Correct for a server address; here the fall-through is "no auth configured at
 *     all".
 *
 * So it follows the RESERVED-LAYERS doctrine instead — its own file, and present-but-unusable
 * is a hard startup failure. These specs pin both halves.
 */

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeConfig(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-playout-config-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'bridge-playout.json');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const ISSUER = 'http://playout.test.local:8080';
const JWKS = `${ISSUER}/.well-known/jwks.json`;

describe('C-037 — the default is OFF, and OFF is today', () => {
  it('no flags and no file resolves to auth off with no Playout at all', () => {
    expect(resolvePlayoutSettings({}, null)).toEqual(AUTH_OFF);
    expect(AUTH_OFF).toEqual({ mode: 'off', playout: null });
  });

  it('a file that says nothing about auth is still off', () => {
    expect(resolvePlayoutSettings({}, {})).toEqual(AUTH_OFF);
  });

  it('a file that explicitly says `off` carries no config, even when one is written beside it', () => {
    /*
      ⚠ The TYPE cannot express a configured OFF bridge, and this spec pins that it stays that
      way. A `mode: 'off'` that still handed out a `playout` object would let a future reader
      treat "there is a config" as "auth is on" — two facts that must never be two.
    */
    const resolved = resolvePlayoutSettings(
      {},
      {
        auth: 'off',
        playout: { issuer: ISSUER, jwksUrl: JWKS },
      },
    );
    expect(resolved).toEqual(AUTH_OFF);
  });
});

describe('C-037 — R-010 precedence: CLI flags > file > default', () => {
  it('the FILE supplies the whole group when no flag contradicts it', () => {
    const resolved = resolvePlayoutSettings(
      {},
      {
        auth: 'playout',
        playout: { issuer: ISSUER, jwksUrl: JWKS },
      },
    );
    expect(resolved.mode).toBe('playout');
    expect(resolved.playout?.issuer).toBe(ISSUER);
    expect(resolved.playout?.jwksUrl).toBe(JWKS);
  });

  it('🔴 a FLAG overrides the file, field by field, and the file is not clobbered', () => {
    const file = {
      auth: 'playout' as const,
      playout: { issuer: ISSUER, jwksUrl: JWKS, audience: 'file-audience' },
    };
    const resolved = resolvePlayoutSettings({ issuer: 'http://other.local:9090' }, file);

    expect(resolved.playout?.issuer, 'the flag must win').toBe('http://other.local:9090');
    // …and the fields the flag said nothing about still come from the file.
    expect(resolved.playout?.jwksUrl, 'an unmentioned field keeps the file value').toBe(JWKS);
    expect(resolved.playout?.audience).toBe('file-audience');
    // The FILE OBJECT is untouched — flags are session overrides, exactly as R-010 says.
    expect(file.playout.issuer).toBe(ISSUER);
  });

  it('a flag can turn auth ON over a file that says off, and OFF over a file that says on', () => {
    const on = resolvePlayoutSettings(
      { auth: 'playout', issuer: ISSUER, jwksUrl: JWKS },
      {
        auth: 'off',
      },
    );
    expect(on.mode).toBe('playout');

    const off = resolvePlayoutSettings(
      { auth: 'off' },
      {
        auth: 'playout',
        playout: { issuer: ISSUER, jwksUrl: JWKS },
      },
    );
    expect(off).toEqual(AUTH_OFF);
  });
});

describe('C-037 — the four addresses the contract fixes are DERIVED, the two that matter are not', () => {
  it('token / refresh / channels / revoked default to the contract paths under the issuer', () => {
    const { playout } = resolvePlayoutSettings(
      { auth: 'playout', issuer: ISSUER, jwksUrl: JWKS },
      null,
    );
    expect(playout?.tokenUrl).toBe(`${ISSUER}/api/cg/auth/token`);
    expect(playout?.refreshUrl).toBe(`${ISSUER}/api/cg/auth/refresh`);
    expect(playout?.channelsUrl).toBe(`${ISSUER}/api/cg/channels`);
    expect(playout?.revokedUrl).toBe(`${ISSUER}/api/cg/revoked`);
    expect(playout?.audience).toBe(DEFAULT_PLAYOUT_AUDIENCE);
    expect(DEFAULT_PLAYOUT_AUDIENCE).toBe('cg-control');
  });

  it('…and an explicit address REPLACES the derivation rather than refining it', () => {
    const { playout } = resolvePlayoutSettings(
      {
        auth: 'playout',
        issuer: ISSUER,
        jwksUrl: JWKS,
        revokedUrl: 'http://elsewhere.local:1234/revoked',
      },
      null,
    );
    expect(playout?.revokedUrl).toBe('http://elsewhere.local:1234/revoked');
    // The others still derive — an override is per address, not a switch.
    expect(playout?.tokenUrl).toBe(`${ISSUER}/api/cg/auth/token`);
  });

  it('🔴 `issuer` is never DERIVED from anything — a jwksUrl alone does not supply it', () => {
    /*
      ADR 0010 rule 1: `iss` is compared byte-for-byte to `playout.issuer`, "copied verbatim
      from the Playout's configured value … and never derived". Deriving an issuer from the
      JWKS address would be exactly that, and it would be wrong the first time a Playout served
      its keys from another host.
    */
    expect(() => resolvePlayoutSettings({ auth: 'playout', jwksUrl: JWKS }, null)).toThrow(
      PlayoutConfigError,
    );
  });
});

describe('C-037 — a bridge told to authenticate REFUSES TO START rather than falling back', () => {
  it('🔴 a missing `issuer` throws, and the sentence NAMES THE KEY', () => {
    let thrown: unknown = null;
    try {
      resolvePlayoutSettings({ auth: 'playout', jwksUrl: JWKS }, null);
    } catch (err) {
      thrown = err;
    }
    expect(thrown, 'a bridge with no issuer must not resolve to a working config').toBeInstanceOf(
      PlayoutConfigError,
    );
    const message = (thrown as Error).message;
    /*
      ⚠ Asserting the KEY NAME and the REFUSAL, not the whole sentence. At 03:00 the difference
      between "the bridge will not start" and "the bridge will not start, `playout.issuer` is
      missing" is the whole night — and a later rewording that keeps the key name should not
      redden this spec for nothing.
    */
    expect(message).toContain('playout.issuer');
    expect(message.toLowerCase()).toContain('refusing to start');
  });

  it('🔴 a missing `jwksUrl` throws, and names THAT key instead', () => {
    let thrown: unknown = null;
    try {
      resolvePlayoutSettings({ auth: 'playout', issuer: ISSUER }, null);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PlayoutConfigError);
    const message = (thrown as Error).message;
    expect(message).toContain('playout.jwksUrl');
    // The positive control for the pair: it must not name the OTHER key, or one sentence is
    // being used for two faults and neither is actually diagnosed.
    expect(message).not.toContain('playout.issuer is missing');
  });

  it('an issuer that is not an absolute http(s) URL is refused, naming the key', () => {
    for (const bad of ['playout.local', '/api', 'ftp://playout.local', '']) {
      expect(
        () => resolvePlayoutSettings({ auth: 'playout', issuer: bad, jwksUrl: JWKS }, null),
        `${JSON.stringify(bad)} was accepted as an issuer`,
      ).toThrow(PlayoutConfigError);
    }
  });

  it('a TRAILING SLASH on the issuer is a WARNING, never a rewrite and never a refusal', () => {
    /*
      ⚠ Three behaviours are pinned at once and each rules out a tempting alternative:
        · it does NOT throw — a differently configured Playout may legitimately issue one;
        · it does NOT strip the slash — `iss` is compared byte for byte and rewriting it here
          would silently change the comparison;
        · it DOES say so at boot — otherwise the failure mode is every sign-in refused as "not
          for this station", which is true and gives no hint why.
    */
    const warnings: string[] = [];
    const { playout } = resolvePlayoutSettings(
      { auth: 'playout', issuer: `${ISSUER}/`, jwksUrl: JWKS },
      null,
      (m) => warnings.push(m),
    );
    expect(playout?.issuer, 'the issuer must reach the verifier byte for byte').toBe(`${ISSUER}/`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('byte for byte');

    // The positive control: an issuer WITHOUT a trailing slash warns about nothing, so the
    // spec above is not passing on a function that warns unconditionally.
    const quiet: string[] = [];
    resolvePlayoutSettings({ auth: 'playout', issuer: ISSUER, jwksUrl: JWKS }, null, (m) =>
      quiet.push(m),
    );
    expect(quiet).toEqual([]);
  });
});

describe('C-037 — the persisted file: absent is normal, unusable is fatal', () => {
  it('an ABSENT file is null, not an error — a station that does not authenticate has none', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-playout-config-'));
    tmpDirs.push(dir);
    expect(loadPlayoutFile(path.join(dir, 'nothing-here.json'))).toBeNull();
  });

  it('🔴 a file that is not JSON THROWS — it does not warn and ignore', () => {
    /*
      The one place this group deliberately diverges from `bridge-connection.json`. That file
      warns and falls back to a default server address; falling back HERE would mean "no auth
      configured at all" on a station that was told to authenticate.
    */
    const file = writeConfig('{ this is not json');
    expect(() => loadPlayoutFile(file)).toThrow(PlayoutConfigError);
    expect(() => loadPlayoutFile(file)).toThrow(/not valid JSON/);
  });

  it('🔴 a file whose SHAPE is wrong throws, naming the file', () => {
    const file = writeConfig(JSON.stringify({ auth: 'maybe' }));
    let thrown: unknown = null;
    try {
      loadPlayoutFile(file);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PlayoutConfigError);
    expect((thrown as Error).message).toContain(file);
    expect((thrown as Error).message).toContain('schema-invalid');
  });

  it('a VALID file round-trips through the loader and then through the resolver', () => {
    const file = writeConfig(
      JSON.stringify({ auth: 'playout', playout: { issuer: ISSUER, jwksUrl: JWKS } }, null, 2),
    );
    const loaded = loadPlayoutFile(file);
    expect(loaded).toEqual({ auth: 'playout', playout: { issuer: ISSUER, jwksUrl: JWKS } });
    expect(resolvePlayoutSettings({}, loaded).mode).toBe('playout');
  });

  it('the default path follows the `~/.cg-runtime/bridge-<thing>.json` convention', () => {
    /*
      Pinned as a FUNCTION rather than a literal in `bin/`, for `live-layers-store`'s reason: a
      default buried in a `.mjs` script is a default no test can reach.

      ⚠ Built with `path.join` rather than a POSIX literal, because this suite runs on Windows
      too and a `/`-spelled expectation fails there for a reason that has nothing to do with
      the rule being pinned — which is the separator, not the path.
    */
    expect(defaultPlayoutConfigPath(path.join('home', 'op'))).toBe(
      path.join('home', 'op', '.cg-runtime', 'bridge-playout.json'),
    );
    // The part that IS platform-independent and is the actual convention.
    expect(defaultPlayoutConfigPath('x').endsWith('bridge-playout.json')).toBe(true);
    expect(defaultPlayoutConfigPath('x')).toContain('.cg-runtime');
  });
});

describe('C-037 — the contract version the bridge advertises', () => {
  it('is `1.1` — v1 plus D9, which is what this bridge implements', () => {
    // A string and not a number: the contract's own versions are `1` and `1.1`.
    expect(PLAYOUT_CONTRACT_VERSION).toBe('1.1');
    expect(typeof PLAYOUT_CONTRACT_VERSION).toBe('string');
  });
});

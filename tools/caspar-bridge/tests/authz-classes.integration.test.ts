import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CLASSES,
  grantsChannel,
  holdsPermissionClass,
  type PermissionClass,
} from '@cg/shared-ipc';
import { buildRoutes } from '../src/index.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `C-038` — **THE PERMISSION CENSUS. It walks EVERY route rather than sampling.**
 *
 * "Every route has a permission class" and "no route is more permissive than the station
 * allows" are claims about EACH channel, and no sample can make one. This file is the
 * third census over the same table — `lock-refuses-intents` (`B-229`) and `auth-gate`
 * (`C-037`) are its siblings, and all three exist for the identical reason: a new route
 * added without answering their question would otherwise ship silently.
 *
 * ⚠ **THE CLASS LIST IS PINNED, NOT SAMPLED.** `R-028` (6.5)'s lesson one axis over: the
 * danger is never that one rung is implemented wrongly — it is that nothing enumerated the
 * set, and a narrowing written against two of three is a correct-looking test that silently
 * forbids the missing class.
 */

/**
 * The real route table. `buildRoutes` only wires handlers onto the backing runtime — it
 * binds nothing — so an unstarted runtime is enough and this spec opens no sockets.
 */
function routes(): ReturnType<typeof buildRoutes> {
  const runtime = new CasparRuntime(
    {
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  return buildRoutes(runtime);
}

describe('C-038 — every route carries a permission class', () => {
  it('the three classes are exactly these, in this order', () => {
    expect(PERMISSION_CLASSES).toEqual(['read', 'operator', 'station-admin']);
  });

  it('holdsPermissionClass applies the hierarchy, and fails closed off the end of it', () => {
    // `read` is the bottom rung: ANY signed-in principal, a viewer included (ADR rule 2).
    expect(holdsPermissionClass([], 'read')).toBe(true);
    expect(holdsPermissionClass(['viewer'], 'read')).toBe(true);

    expect(holdsPermissionClass(['viewer'], 'operator')).toBe(false);
    expect(holdsPermissionClass(['operator'], 'operator')).toBe(true);
    expect(holdsPermissionClass(['operator'], 'station-admin')).toBe(false);
    expect(holdsPermissionClass(['station-admin'], 'station-admin')).toBe(true);

    /*
      🔴 The defensive half, and it is not theoretical tidiness: the contract says `roles`
      arrives CUMULATIVE, so a bare `['station-admin']` should never appear — but under a
      membership test it would be refused every `operator` route while holding strictly MORE
      authority than an operator, which is a refusal nobody could explain.
    */
    expect(holdsPermissionClass(['station-admin'], 'operator')).toBe(true);

    // Everything unrecognised grants nothing above the bottom rung.
    expect(holdsPermissionClass(['administrator', 'ADMIN', 'Operator'], 'operator')).toBe(false);
  });
});

describe('C-038 — grantsChannel, the ONE channel predicate', () => {
  const OURS = ['127.0.0.1', '10.0.0.5'];

  it("'*' authorises every channel; [] authorises none", () => {
    expect(grantsChannel('*', OURS, 1)).toBe(true);
    expect(grantsChannel('*', OURS, 99)).toBe(true);
    expect(grantsChannel([], OURS, 1)).toBe(false);
  });

  it('a grant must match BOTH the channel and one of this station’s hosts', () => {
    const grants = [{ host: '127.0.0.1', channel: 1 }];
    expect(grantsChannel(grants, OURS, 1)).toBe(true);
    expect(grantsChannel(grants, OURS, 2)).toBe(false);
  });

  /**
   * 🔴 **THE PROPERTY THE HOST RULE EXISTS FOR.** A grant naming ANOTHER station's host does
   * not authorise this station's channel 1 — the channel number matching is not enough.
   */
  it("another station's host does not authorise this station's channel", () => {
    expect(grantsChannel([{ host: '192.0.2.10', channel: 1 }], OURS, 1)).toBe(false);
  });

  /**
   * ⚠ **B's host is accepted as well as A's — a TOLERANCE, recorded deliberately.** A and B
   * are MIRRORS of one channel set rather than a partition, so requiring A's spelling would
   * refuse every operator on a redundant station. The Playout issues A's host today, so
   * nothing changes in practice.
   */
  it("B's host authorises too, because A and B mirror one channel set", () => {
    expect(grantsChannel([{ host: '10.0.0.5', channel: 1 }], OURS, 1)).toBe(true);
  });

  /**
   * ⭐ And the verdict does NOT move with which server is primary — it is the SET that is
   * consulted. Reordering the hosts is the cheapest expression of a failover this predicate
   * must be blind to (golden rule 8).
   */
  it('the verdict is independent of host ORDER, so a failover cannot move it', () => {
    const grant = [{ host: '10.0.0.5', channel: 1 }];
    expect(grantsChannel(grant, OURS, 1)).toBe(grantsChannel(grant, [...OURS].reverse(), 1));
  });
});

describe('C-038 — the census: every route, classified', () => {
  it('every route carries one of the three classes, and the table is the real one', () => {
    const table = routes();
    expect(table.size, 'the census is looking at the real table').toBeGreaterThan(50);

    const bad = [...table.entries()].filter(
      ([, r]) => !PERMISSION_CLASSES.includes(r.perm as PermissionClass),
    );
    expect(
      bad.map(([name]) => name),
      'a route carries no permission class',
    ).toEqual([]);
  });

  /**
   * 🔴 **THE SIX `station-admin` ROUTES, PINNED BY NAME.**
   *
   * Written as an exact list rather than a count, for `R-028` (6.5)'s reason: a count passes
   * while the SET drifts, and the set is what an operator's access actually turns on. A
   * seventh route quietly joining this class is a privilege change that should have to be
   * argued for — so it reddens here, and the argument happens in review.
   */
  it('exactly six routes are station-admin, and they are the configuration verbs', () => {
    const admin = [...routes().entries()]
      .filter(([, r]) => r.perm === 'station-admin')
      .map(([name]) => name)
      .sort();

    expect(admin).toEqual([
      'channelSettings.set',
      'connections.set-config',
      'delimiters.set',
      'fixedLayers.set-config',
      'sources.set-assignments',
      'sources.set-config',
    ]);
  });

  /**
   * 🔴 **EVERY `read`-CLASS ROUTE, PINNED BY NAME — the list a VIEWER may reach.**
   *
   * This is the assertion a privilege escalation would trip. A route moved into `read` by a
   * future author who classified it by VERB rather than by PRINCIPAL reddens here, which is
   * the one place that mistake is cheap to catch.
   */
  it('the read class is exactly the reads, plus auth.sign-out', () => {
    const read = [...routes().entries()]
      .filter(([, r]) => r.perm === 'read')
      .map(([name]) => name)
      .sort();

    expect(read).toEqual([
      'air.emptied',
      'app.info',
      'audit.health',
      'audit.recent',
      /*
        ⚠ **`auth.sign-out` IS HERE AND IT WRITES.** `read` names the bottom rung of the
        principal hierarchy, not a promise about the verb — ADR 0010 rule 2 is a statement
        about WHO ("any signed-in principal, a viewer included"). A viewer must be able to
        sign out; what they write is their own session, never the station.
      */
      'auth.sign-out',
      'auth.state',
      'bridge.capabilities',
      'channelSettings.get',
      'connections.config',
      'connections.health',
      'connections.template-serve',
      'delimiters.list',
      'fixedLayers.config',
      'fixedLayers.state',
      'layers.orphans',
      'layers.owned-occupancy',
      'liveLayers.state',
      'lock.state',
      'playoutLayers.state',
      'rehearse.state',
      'sources.assignments',
      'sources.config',
      'stack.snapshot',
      'templates.get',
      'templates.list',
      'update.state',
    ]);
  });

  /**
   * 🔴 **THE LOCK AND THE PERMISSION CLASS ARE DIFFERENT QUESTIONS.**
   *
   * `lock.release` is the sharpest case and it is asserted rather than described: it is
   * EXEMPT from the lock (it is the way out) and it still requires `operator`, because a
   * viewer must not unlock a console an operator deliberately locked. A future author who
   * "harmonises" the two axes breaks this.
   */
  it('lock.engage and lock.release are both operator, whatever their lock policy is', () => {
    const table = routes();
    const engage = table.get('lock.engage');
    const release = table.get('lock.release');
    if (engage === undefined || release === undefined) throw new Error('the lock is not routed');

    expect(engage.perm).toBe('operator');
    expect(release.perm).toBe('operator');
    // …and the two axes genuinely disagree on this route, which is the point.
    expect(release.lock).toBe('unlock');
  });

  /**
   * 🔴🔴 `silenceAllLivePlates` **STAYS UNSCOPED** — owner answer A16 and CLAUDE.md's cadence
   * floor. It takes the `operator` class like any other intent, and NO channel check.
   */
  it('stack.silence-all-live-plates is operator and resolves to NO channels', () => {
    const table = routes();
    const route = table.get('stack.silence-all-live-plates');
    if (route === undefined) throw new Error('the panic button is not routed');
    expect(route.perm).toBe('operator');
  });
});

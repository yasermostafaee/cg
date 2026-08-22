import { describe, expect, it } from 'vitest';
import * as ipc from '@cg/shared-ipc';
import { buildRoutes } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * B-074 (a) — route-coverage guard.
 *
 * The gap this closes: NOTHING in the suite noticed a channel that the Runtime SPA
 * declares and calls but that the bridge never routes. An unrouted channel is not a
 * type error (the renderer talks to the bridge over a WebSocket, so the contract is
 * only checked at runtime) and it is not a test failure — the bridge simply answers
 * `unknown channel: <name>` to a call no test makes. That is exactly how R-011's
 * `stack.set-position` could break silently, and recon confirmed the hole is real:
 * deleting `route(StackSetPositionChannel, ...)` from bridge.ts reddened NOTHING.
 *
 * So: enumerate the channels @cg/shared-ipc actually exports (no hand-maintained list
 * to drift) and assert the bridge routes every one the RUNTIME owns. Deleting a route
 * now fails here, and adding a runtime channel without routing it fails here too.
 */

/*
  🔴 `B-153` — THE DERIVATION MOVED TO `@cg/shared-ipc` (`runtimeRequestChannelNames`), and
  this test now CALLS it rather than carrying its own copy.

  The reason is the whole point of that function: the Runtime asks the RUNNING bridge the
  same question at connect (the capability handshake), and a build-time guard that passed
  while the run-time one used a narrower rule would be worse than having neither — every
  operator would see a skew banner on a perfectly matched pair, and would learn to ignore
  it. Two lists, one question, is how that happens. There is one list.
*/
const routedNames = (): string[] => {
  // buildRoutes() only wires handlers onto the backing runtime — it neither connects
  // nor binds anything, so an unstarted CasparRuntime is enough and this test opens
  // no sockets.
  const runtime = new CasparRuntime({
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  });
  return [...buildRoutes(runtime).keys()].sort();
};

describe('bridge route coverage (B-074)', () => {
  it('routes EVERY runtime channel exported from @cg/shared-ipc', () => {
    const routed = new Set(routedNames());
    const runtimeChannels = ipc.runtimeRequestChannelNames(ipc);

    const unrouted = runtimeChannels.filter((n) => !routed.has(n));

    // Named explicitly so the failure says WHICH channel lost its route.
    expect(unrouted).toEqual([]);
    // Sanity: the guard is actually looking at something.
    expect(runtimeChannels).toContain('stack.set-position'); // the R-011 channel
    // R-021 stage 2a (S11) — the fixed-bank request channels are covered.
    expect(runtimeChannels).toContain('fixedLayers.config');
    expect(runtimeChannels).toContain('fixedLayers.set-config');
    expect(runtimeChannels).toContain('fixedLayers.state');
    expect(runtimeChannels.length).toBeGreaterThan(20);
  });

  it('R-021 stage 2a (S11) — the fixed-bank publish channels are exported for wirePublishes', () => {
    // Publish channels are not request routes; pin their existence + names so a
    // rename cannot silently orphan the wirePublishes() subscriptions.
    expect(ipc.FixedLayersConfigChangedChannel.name).toBe('fixedLayers.config-changed');
    expect(ipc.FixedLayersStateChangedChannel.name).toBe('fixedLayers.state-changed');
  });

  it('every route the bridge declares corresponds to a real exported channel', () => {
    // The other direction: a route keyed on a name no channel exports is dead code
    // (a typo'd or renamed channel), and the caller would still get `unknown channel`.
    // Every EXPORTED request channel, runtime and Designer alike — this direction asks
    // whether a route names something real, which the Designer split has no bearing on.
    const values: unknown[] = Object.values(ipc);
    const exported = new Set(
      values
        .filter(
          (v): v is { name: string } =>
            typeof v === 'object' && v !== null && 'name' in v && 'request' in v,
        )
        .map((c) => c.name),
    );
    expect(routedNames().filter((n) => !exported.has(n))).toEqual([]);
  });

  it('the Designer-only exemption list is honest — every namespace still exists', () => {
    // Stops the allowlist from silently growing stale and exempting channels that were
    // since deleted (or, worse, moved into the runtime).
    const runtimeOwned = new Set(ipc.runtimeRequestChannelNames(ipc));
    for (const ns of ipc.DESIGNER_ONLY_NAMESPACES) {
      // The namespace still exists as an EXPORTED channel, and the filter still excludes it.
      const values: unknown[] = Object.values(ipc);
      const inNamespace = values.filter(
        (v): v is { name: string } =>
          typeof v === 'object' &&
          v !== null &&
          'name' in v &&
          'request' in v &&
          (v as { name: string }).name.startsWith(ns),
      );
      expect(inNamespace.length, ns).toBeGreaterThan(0);
      expect(
        inNamespace.every((c) => !runtimeOwned.has(c.name)),
        ns,
      ).toBe(true);
    }
  });
});

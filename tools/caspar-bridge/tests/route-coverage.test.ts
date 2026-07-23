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

/** A request/response channel — `definePublishChannel` products have `payload`, not `request`. */
interface RequestChannel {
  readonly name: string;
  readonly request: unknown;
  readonly response: unknown;
}

function isRequestChannel(value: unknown): value is RequestChannel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string' &&
    'request' in value &&
    'response' in value
  );
}

/**
 * Namespaces the DESIGNER owns. `@cg/shared-ipc` is shared by both SPAs, so these
 * channels are exported here but are deliberately not part of the playout bridge.
 *
 * This is a default-DENY list: anything outside it is required to be routed. A new
 * runtime channel is therefore covered the moment it is exported — the author has to
 * either route it or consciously declare it Designer-only.
 */
const DESIGNER_ONLY_NAMESPACES = ['projects.', 'assets.', 'sharedImages.', 'export.', 'preview.'];

const isDesignerOnly = (name: string): boolean =>
  DESIGNER_ONLY_NAMESPACES.some((ns) => name.startsWith(ns));

const exportedRequestChannels = Object.values(ipc)
  .filter(isRequestChannel)
  .map((c) => c.name)
  .sort();

const routedNames = (): string[] => {
  // buildRoutes() only wires handlers onto the backing runtime — it neither connects
  // nor binds anything, so an unstarted CasparRuntime is enough and this test opens
  // no sockets.
  const runtime = new CasparRuntime({
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
    strategy: 'single',
    autoFailoverEnabled: false,
  });
  return [...buildRoutes(runtime).keys()].sort();
};

describe('bridge route coverage (B-074)', () => {
  it('routes EVERY runtime channel exported from @cg/shared-ipc', () => {
    const routed = new Set(routedNames());
    const runtimeChannels = exportedRequestChannels.filter((n) => !isDesignerOnly(n));

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
    const exported = new Set(exportedRequestChannels);
    expect(routedNames().filter((n) => !exported.has(n))).toEqual([]);
  });

  it('the Designer-only exemption list is honest — every namespace still exists', () => {
    // Stops the allowlist from silently growing stale and exempting channels that were
    // since deleted (or, worse, moved into the runtime).
    for (const ns of DESIGNER_ONLY_NAMESPACES) {
      expect(exportedRequestChannels.some((n) => n.startsWith(ns))).toBe(true);
    }
  });
});

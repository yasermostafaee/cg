import { afterEach, expect, it } from 'vitest';
import { CasparRuntime } from '@cg/caspar-bridge';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { StackItemStateSchema, type Position, type StackItemState } from '@cg/shared-schema';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

/**
 * B-074(b) — MockRuntime ↔ real-bridge PARITY guard.
 *
 * The offline mock is what the Runtime SPA is developed and E2E'd against, so
 * every divergence from the real `CasparRuntime`/`WebSocketRuntime` path ships a
 * UX built on semantics the bridge does not have. Twice already:
 *
 * - B-070 — the mock ACCEPTED `update` on an idle/producerless item; the real
 *   bridge refuses to send one (no producer ⇒ commit only). The Inspector UX was
 *   built and tested against the mock's fiction.
 * - B-072 — the real bridge republishes `StackItemState` with the APPLIED
 *   `position` override; the mock had no read-back, so the on-air position picker
 *   "worked" offline and lied on air.
 *
 * Nothing in the suite compared the two. These assertions do — on the CONTRACT
 * SURFACE and the published STATE SHAPE, with no AMCP, no sockets: a method the
 * bridge routes but the mock lacks, a `RuntimeBridge` call the SPA can make on one
 * backend but not the other, or a dropped `position` read-back all go RED here.
 */

/** Every `CasparRuntime` method the bridge's `buildRoutes()` routes a channel to. */
const BACKING_METHODS = [
  'load',
  'take',
  'update',
  'out',
  'remove',
  'setPosition',
  'removeAll',
  'clearAll',
  'stackSnapshot',
  'config',
  'setConfig',
  'health',
  'failover',
  'orphans',
  'clearLayer',
  'ownedOccupancy',
  'engage',
  'release',
  'lockState',
  'templateGet',
  'templateList',
  'templateImport',
  'auditRecent',
  'updateRequest',
  'updateState',
  'updateCancel',
  'settingsGet',
  'settingsSet',
] as const;

/** Every emitter the bridge's `wirePublishes()` subscribes to. */
const BACKING_EMITTERS = [
  'stackChanged',
  'healthChanged',
  'configChanged',
  'orphansChanged',
  'ownedOccupancyChanged',
  'lockChanged',
  'updateChanged',
  'settingsChanged',
] as const;

type BridgeMethodName = {
  [K in keyof RuntimeBridge]: RuntimeBridge[K] extends (...args: never[]) => unknown ? K : never;
}[keyof RuntimeBridge];
type BridgeGroupName = Exclude<keyof RuntimeBridge, BridgeMethodName>;

/**
 * The `RuntimeBridge` method tree the SPA is allowed to call. The mapped type
 * pins it to the interface: a NEW group in `runtime-bridge.ts` fails typecheck
 * here, and a new method inside a group fails the set-equality below (both
 * implementations have it; this list does not) — so the guard can never drift
 * into fiction while the real surface grows.
 */
const BRIDGE_SURFACE: {
  readonly methods: readonly BridgeMethodName[];
  readonly groups: { readonly [G in BridgeGroupName]: readonly (keyof RuntimeBridge[G])[] };
} = {
  methods: ['getAppInfo'],
  groups: {
    link: ['status', 'onStatusChanged'],
    stack: [
      'load',
      'take',
      'update',
      // C-012 — the graceful stop, beside the destroying `out`.
      'stop',
      // R-028 (5.4) — advance the template's sequence.
      'next',
      'out',
      'remove',
      'setPosition',
      'removeAll',
      'clearAll',
      'stopAll',
      'snapshot',
      'onStateChanged',
    ],
    connections: [
      'config',
      'setConfig',
      'health',
      'failover',
      'onHealthChanged',
      'onConfigChanged',
    ],
    layers: ['orphans', 'clear', 'onOrphansChanged', 'ownedOccupancy', 'onOwnedOccupancyChanged'],
    // R-028 part B — `fixedLayers` was MISSING from this guard (recorded as a
    // part-A seam): `tests/**` is not typechecked, so the mapped type above
    // never caught the omission and any mock↔bridge divergence in the fixed
    // surface shipped silently. Both layer groups are covered now, and
    // `playoutLayers` especially: it is a SAFETY surface, and a mock that
    // cleared where the bridge refuses would teach test mode a more dangerous
    // model than air.
    fixedLayers: ['config', 'setConfig', 'load', 'state', 'onConfigChanged', 'onStateChanged'],
    playoutLayers: ['state', 'clear', 'onStateChanged'],
    lock: ['engage', 'release', 'state', 'onStateChanged'],
    // R-028 (o1) — `onChanged`: the bridge-owned catalogue push.
    templates: ['get', 'list', 'import', 'remove', 'onChanged'],
    audit: ['recent'],
    update: ['request', 'state', 'cancel', 'onStateChanged'],
    settings: ['get', 'set', 'onChanged'],
  },
};

const GROUP_NAMES = Object.keys(BRIDGE_SURFACE.groups) as readonly BridgeGroupName[];

function hasMethod(target: object, name: string): boolean {
  return typeof (Reflect.get(target, name) as unknown) === 'function';
}

/** An emitter is anything the bridge can `.subscribe()` to (its only publish contract). */
function hasEmitter(target: object, name: string): boolean {
  const value = Reflect.get(target, name) as unknown;
  return typeof value === 'object' && value !== null && hasMethod(value, 'subscribe');
}

/** Function-valued keys of an object, own + inherited (sorted, for set comparison). */
function methodKeys(target: object): string[] {
  const keys = new Set<string>();
  for (
    let cursor: object | null = target;
    cursor !== null && cursor !== Object.prototype;
    cursor = Reflect.getPrototypeOf(cursor)
  ) {
    for (const key of Object.getOwnPropertyNames(cursor)) {
      if (key === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (typeof descriptor?.value === 'function') keys.add(key);
    }
  }
  return [...keys].sort();
}

/** Loopback config for a NEVER-STARTED `CasparRuntime` — the ctor is pure (no I/O). */
function offlineConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

/** A socket that never opens: `WebSocketRuntime` only needs to be SHAPED, not live. */
function inertSocket(): WebSocketLike {
  return {
    readyState: 0,
    send: () => undefined,
    close: () => undefined,
    addEventListener: () => undefined,
  };
}

let live: WebSocketRuntime | null = null;

afterEach(() => {
  live?.dispose();
  live = null;
});

it('the mock implements every backing method + emitter the bridge routes (B-070)', () => {
  const real = new CasparRuntime(offlineConnection());
  const mock = new MockRuntime();

  // Anchor the list to reality first: a name the real runtime does NOT have means
  // this guard has drifted into fiction and proves nothing about the mock.
  expect(BACKING_METHODS.filter((name) => !hasMethod(CasparRuntime.prototype, name))).toEqual([]);
  expect(BACKING_EMITTERS.filter((name) => !hasEmitter(real, name))).toEqual([]);

  // The real assertion: the mock backs the SAME surface the bridge routes to.
  expect(BACKING_METHODS.filter((name) => !hasMethod(mock, name))).toEqual([]);
  expect(BACKING_EMITTERS.filter((name) => !hasEmitter(mock, name))).toEqual([]);
});

it('the mock bridge exposes the same RuntimeBridge method tree as the live one', () => {
  live = new WebSocketRuntime('ws://127.0.0.1:1/parity-never-connects', {
    createWebSocket: () => inertSocket(),
  });
  const mock: RuntimeBridge = createMockBridge();
  const real: RuntimeBridge = live;

  for (const name of BRIDGE_SURFACE.methods) {
    expect(hasMethod(real, name)).toBe(true);
    expect(hasMethod(mock, name)).toBe(true);
  }

  // Every group the SPA can reach, method for method: an intent implemented on one
  // backend but missing on the other is a UX built against a phantom contract.
  for (const group of GROUP_NAMES) {
    const declared = [...(BRIDGE_SURFACE.groups[group] as readonly string[])].sort();
    expect({ group, methods: methodKeys(mock[group]) }).toEqual({ group, methods: declared });
    expect({ group, methods: methodKeys(real[group]) }).toEqual({ group, methods: declared });
  }
});

it('the mock publishes the applied position override in StackItemState (B-072)', () => {
  const mock = new MockRuntime();
  const published: (readonly StackItemState[])[] = [];
  mock.stackChanged.subscribe((snapshot) => published.push(snapshot));

  const itemId = 'item-parity';
  const position: Position = { anchor: 'bottom-left', offset: { x: 120, y: -40 } };
  mock.load(itemId, 'irib-news', {});
  expect(mock.setPosition(itemId, position)).toEqual({ ok: true });

  // The read-back the real bridge does in `#published()`: the override the operator
  // applied comes back on the ITEM STATE — both channels (snapshot and the
  // state-changed publish), because the picker reads what is actually on air.
  const snapshot = mock.stackSnapshot();
  const latest = published.at(-1) ?? [];
  expect(snapshot.find((i) => i.itemId === itemId)?.position).toEqual(position);
  expect(latest.find((i) => i.itemId === itemId)?.position).toEqual(position);

  // ABSENT (not null/empty) for an item with no override — the consumer falls back
  // to the template's manifest default, exactly as the bridge's contract says.
  expect(snapshot.find((i) => i.itemId === 'item-ticker')?.position).toBeUndefined();

  // And the whole published state still satisfies the shared contract.
  for (const item of snapshot) expect(() => StackItemStateSchema.parse(item)).not.toThrow();
});

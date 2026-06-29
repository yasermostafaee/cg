import { DEFAULT_BRIDGE_WS_URL } from '@cg/shared-ipc';
import type { AppInfo, BridgeLinkStatus, RuntimeBridge } from '../shared/runtime-bridge.js';
import { MockRuntime } from './MockRuntime.js';
import { WebSocketRuntime } from './WebSocketRuntime.js';

const APP_INFO: AppInfo = { name: 'cg Runtime', version: '0.0.0', platform: 'browser' };

/** Boot probe budget — reachable within this window → use the bridge (C-001). */
const PROBE_TIMEOUT_MS = 1500;

/**
 * Build the browser `RuntimeBridge`, deciding the backend **once** at boot
 * (C-001 Phase 1).
 *
 * Probes the configured bridge WebSocket with a short timeout: reachable →
 * `WebSocketRuntime` (live, real round-trips to the local bridge); refused or
 * timed out → the in-memory `MockRuntime` in an explicit, persistent
 * **offline-mock** mode. The choice is fixed for the session — a live link that
 * later drops surfaces as `disconnected` (handled in `WebSocketRuntime`), never
 * a silent fall-back to the mock.
 */
export async function createRuntimeBridge(): Promise<RuntimeBridge> {
  const url = resolveBridgeUrl();
  const ws = new WebSocketRuntime(url);
  try {
    await withTimeout(ws.whenReady(), PROBE_TIMEOUT_MS);
    return ws;
  } catch {
    ws.dispose();
    return createMockBridge();
  }
}

function resolveBridgeUrl(): string {
  const override = (globalThis as { __CG_BRIDGE_URL__?: string }).__CG_BRIDGE_URL__;
  return typeof override === 'string' && override.length > 0 ? override : DEFAULT_BRIDGE_WS_URL;
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bridge probe timed out')), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Offline fallback: the existing in-memory simulation, wrapped to satisfy the
 * `RuntimeBridge` contract. Its link status is a constant `offline-mock` — an
 * explicit, persistent offline mode the indicator surfaces unmistakably.
 */
function createMockBridge(): RuntimeBridge {
  const mock = new MockRuntime();
  const OFFLINE: BridgeLinkStatus = 'offline-mock';

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

    link: {
      status: () => OFFLINE,
      // Constant mode — never changes, so nothing to emit; the unsubscribe is a noop.
      onStatusChanged: () => () => undefined,
    },

    stack: {
      load: (req) => Promise.resolve(mock.load(req.itemId, req.templateId, req.fields)),
      take: (req) => Promise.resolve(mock.take(req.itemId)),
      update: (req) => Promise.resolve(mock.update(req.itemId, req.fields, req.mergeMode)),
      out: (req) => Promise.resolve(mock.out(req.itemId)),
      remove: (req) => Promise.resolve(mock.remove(req.itemId)),
      snapshot: () => Promise.resolve(mock.stackSnapshot()),
      onStateChanged: (handler) => mock.stackChanged.subscribe(handler),
    },

    connections: {
      config: () => Promise.resolve(mock.config()),
      health: () => Promise.resolve(mock.health()),
      failover: () => Promise.resolve(mock.failover()),
      onHealthChanged: (handler) => mock.healthChanged.subscribe(handler),
    },

    lock: {
      engage: (req) => mock.engage(req.pin),
      release: (req) => mock.release(req.pin),
      state: () => Promise.resolve(mock.lockState()),
      onStateChanged: (handler) => mock.lockChanged.subscribe(handler),
    },

    templates: {
      get: (req) => Promise.resolve(mock.templateGet(req.templateId)),
      list: () => Promise.resolve(mock.templateList()),
      import: (req) => Promise.resolve(mock.templateImport(req.template)),
    },

    audit: {
      recent: (req) => Promise.resolve(mock.auditRecent(req.limit, req.action, req.actor)),
    },

    update: {
      request: (req) => Promise.resolve(mock.updateRequest(req.version, req.notes)),
      state: () => Promise.resolve(mock.updateState()),
      cancel: () => Promise.resolve(mock.updateCancel()),
      onStateChanged: (handler) => mock.updateChanged.subscribe(handler),
    },

    settings: {
      get: () => Promise.resolve(mock.settingsGet()),
      // Drop absent keys so `exactOptionalPropertyTypes` stays happy and a
      // missing field never overwrites the stored value with `undefined`.
      set: (req) =>
        Promise.resolve(
          mock.settingsSet(req.telemetry !== undefined ? { telemetry: req.telemetry } : {}),
        ),
      onChanged: (handler) => mock.settingsChanged.subscribe(handler),
    },
  };
}

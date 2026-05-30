import type { AppInfo, RuntimeBridge } from '../shared/runtime-bridge.js';
import { MockRuntime } from './MockRuntime.js';

const APP_INFO: AppInfo = { name: 'cg Runtime', version: '0.0.0', platform: 'browser' };

/**
 * Build the browser `RuntimeBridge` — the in-process replacement for the
 * Electron preload's `window.cg`. Until the CasparCG WebSocket↔TCP bridge
 * lands, it is backed by an in-memory simulation (`MockRuntime`): the
 * operator UI is fully interactive, but no frames reach a real playout
 * server. The renderer is unchanged; only the implementation differs.
 */
export function createRuntimeBridge(): RuntimeBridge {
  const mock = new MockRuntime();

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

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

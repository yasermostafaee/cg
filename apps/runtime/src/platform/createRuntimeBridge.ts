import { DEFAULT_BRIDGE_WS_URL } from '@cg/shared-ipc';
import type { AppInfo, BridgeLinkStatus, RuntimeBridge } from '../shared/runtime-bridge.js';
import { MockRuntime } from './MockRuntime.js';
import { WebSocketRuntime } from './WebSocketRuntime.js';
import { LibraryStore } from './library/LibraryStore.js';
import { initRuntimeWorkspace } from './library/workspace.js';
import { StackRetentionStore } from './stack/StackRetentionStore.js';
import { getOperatorName, setOperatorName } from './operatorName.js';
import { isTestMode } from './testMode.js';

const APP_INFO: AppInfo = { name: 'cg Runtime', version: '0.0.0', platform: 'browser' };

/** Boot probe budget — reachable within this window → use the bridge (C-001). */
const PROBE_TIMEOUT_MS = 1500;

export interface CreateRuntimeBridgeOptions {
  /**
   * Reconnect-reconciliation — surface for a failed template re-delivery
   * during the post-reconnect resync (the renderer passes its command-error
   * reporter). Only used by the live `WebSocketRuntime` backend.
   */
  onResyncError?: (message: string) => void;
}

/**
 * Build the browser `RuntimeBridge`, deciding the backend **once** at boot (C-001 Phase 1).
 *
 * R-006 — **an unreachable bridge NEVER selects the mock.** It used to: the probe failed,
 * a bare `catch` swapped in `MockRuntime`, and the session was pinned for its whole life to
 * an in-memory simulation that reports SUCCESS for commands that reach nothing. The
 * operator pressed PLAY, the row went solid-red ON AIR beside a green "PRIMARY A HEALTHY",
 * and no graphic existed. That is a broadcast-safety failure, and it was observed live.
 *
 * Now:
 * - **Test mode requested explicitly** (operator, or a test harness) → the mock, and the UI
 *   says so unmistakably at all times.
 * - **Otherwise** → the LIVE backend, always. If the probe fails we still return it: the
 *   `WebSocketRuntime` reconnects on its own and REJECTS every command while it is down
 *   ("Bridge disconnected — command rejected. Not sent to CasparCG."), which is the honest
 *   behavior. The probe now only decides how fast the first paint knows the truth.
 *
 * The backend is fixed for the session either way — a live link that later drops surfaces
 * as `disconnected`, never a silent fall-back to a simulation.
 */
export async function createRuntimeBridge(
  options: CreateRuntimeBridgeOptions = {},
): Promise<RuntimeBridge> {
  // The ONLY door to the mock. Never inferred from a failed probe.
  if (isTestMode()) return createMockBridge();

  const url = resolveBridgeUrl();
  // B-085 — the browser-local template library (source of truth). Hydrated from
  // persistent storage BEFORE the runtime is returned, so the renderer's first
  // `templates.list()` sees the operator's library even with the bridge down.
  const workspace = await initRuntimeWorkspace();
  const library = new LibraryStore(workspace);
  // B-092 — the browser-local stack INTENT, so the stack survives a restart of
  // the bridge process. Hydrated BEFORE the first connect: the retention is
  // re-delivered during `#resync`, and an unhydrated store would re-deliver
  // nothing and let the empty snapshot stand.
  const stackRetention = new StackRetentionStore(workspace);
  await Promise.all([library.hydrate(), stackRetention.hydrate()]);
  const ws = new WebSocketRuntime(url, {
    library,
    stackRetention,
    ...(options.onResyncError !== undefined ? { onResyncError: options.onResyncError } : {}),
  });
  try {
    await withTimeout(ws.whenReady(), PROBE_TIMEOUT_MS);
  } catch {
    // Unreachable at boot. Keep the live backend and let it reconnect — do NOT dispose it,
    // and do NOT substitute the mock. The app lands in an explicit, loud DISCONNECTED state
    // where commands are refused, which is the truth.
  }
  return ws;
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
 * The in-memory simulation, wrapped to satisfy the `RuntimeBridge` contract. Its link
 * status is a constant `offline-mock`, which the UI renders as a loud, persistent TEST MODE
 * banner — not a pill among pills.
 *
 * R-006 — this is NO LONGER a fallback. It is reached only from an explicit test-mode
 * request (`isTestMode()`); nothing infers it from an unreachable bridge.
 *
 * Exported for the B-074 mock↔bridge parity guard (`tests/mock-bridge-parity.test.ts`),
 * which compares this adapter's method tree against `WebSocketRuntime`'s.
 */
export function createMockBridge(): RuntimeBridge {
  const mock = new MockRuntime();
  const OFFLINE: BridgeLinkStatus = 'offline-mock';

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

    link: {
      status: () => OFFLINE,
      // Constant mode — never changes, so nothing to emit; the unsubscribe is a noop.
      onStatusChanged: () => () => undefined,
      // §4 — the offline mock never resyncs: there is no socket and no re-delivery, so its
      // stack is ALWAYS the settled answer. Constant `false` is the honest value here, not a
      // stub — a mock that reported a delivery in flight would suppress an alarm test mode
      // is genuinely entitled to raise.
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
      // `B-153` — there is no bridge PROCESS in test mode, so there is nothing this page
      // could be skewed against. `null` is the honest answer and not a stub: a mock that
      // reported skew would raise an alarm about a build that does not exist, and one that
      // reported "checked, fine" would be a claim nobody made.
      skew: () => null,
      onSkewChanged: () => () => undefined,
    },

    stack: {
      load: (req) => Promise.resolve(mock.load(req.itemId, req.templateId, req.fields)),
      take: (req) => Promise.resolve(mock.take(req.itemId)),
      update: (req) =>
        Promise.resolve(mock.update(req.itemId, req.fields, req.mergeMode, req.lookBindings)),
      stop: (req) => Promise.resolve(mock.stop(req.itemId)),
      // R-028 (5.4) — advance the template's sequence.
      next: (req) => Promise.resolve(mock.next(req.itemId)),
      out: (req) => Promise.resolve(mock.out(req.itemId)),
      remove: (req) => Promise.resolve(mock.remove(req.itemId)),
      setPosition: (req) => Promise.resolve(mock.setPosition(req.itemId, req.position)),
      // C-015 (6.5f) — the per-plate audio intent.
      setPlateVolume: (req) =>
        Promise.resolve(mock.setPlateVolume(req.itemId, req.plateId, req.volume)),
      // `add-multibox-audio` — the MAP door (FADER / ON-OFF / SOLO).
      setPlateVolumes: (req) => Promise.resolve(mock.setPlateVolumes(req.itemId, req.volumes)),
      // PANIC — no arguments: the scope is the LEDGER's, not the caller's.
      silenceAllLivePlates: () => Promise.resolve(mock.silenceAllLivePlates()),
      // R-048 — the per-plate live-source swap.
      swapLiveSource: (req) =>
        // Session BM: `lookId` absent is R-048 (every look); present is one look’s binding.
        Promise.resolve(mock.swapLiveSource(req.itemId, req.plateId, req.sourceId, req.lookId)),
      // §14 (LOOKS) Stage E — the row’s look picker.
      setActiveLook: (req) => Promise.resolve(mock.setActiveLook(req.itemId, req.lookId)),
      removeAll: () => Promise.resolve(mock.removeAll()),
      clearAll: () => Promise.resolve(mock.clearAll()),
      stopAll: () => Promise.resolve(mock.stopAll()),
      snapshot: () => Promise.resolve(mock.stackSnapshot()),
      onStateChanged: (handler) => mock.stackChanged.subscribe(handler),
      /*
       * B-108 — PARITY BY HONEST EMPTINESS, not by a missing method.
       *
       * Test mode has no bridge at all (`link.status()` is a constant
       * `offline-mock`), so it has no retention, no `restore()` and therefore no
       * rows a restore could fail to bring back. The truthful report is an EMPTY
       * one, delivered once, forever — which is exactly what a healthy live session
       * reports too, so the surface behaves identically in both backends instead of
       * being absent in one.
       *
       * This is the same shape as `templates.html` returning `null` here: the mock
       * answers the contract with the true value for a session that has no such
       * thing, rather than dropping the method and forcing every consumer to branch.
       */
      onRestoreSkips: (handler) => {
        handler([]);
        return () => undefined;
      },
    },

    connections: {
      config: () => Promise.resolve(mock.config()),
      setConfig: (req) => Promise.resolve(mock.setConfig(req)),
      health: () => Promise.resolve(mock.health()),
      failover: () => Promise.resolve(mock.failover()),
      onHealthChanged: (handler) => mock.healthChanged.subscribe(handler),
      onConfigChanged: (handler) => mock.configChanged.subscribe(handler),
    },

    layers: {
      orphans: () => Promise.resolve(mock.orphans()),
      clear: (req) => Promise.resolve(mock.clearLayer(req.channel, req.layer)),
      onOrphansChanged: (handler) => mock.orphansChanged.subscribe(handler),
      ownedOccupancy: () => Promise.resolve(mock.ownedOccupancy()),
      onOwnedOccupancyChanged: (handler) => mock.ownedOccupancyChanged.subscribe(handler),
    },

    // R-021 stage 2a — fixed-bank parity (offline: occupancy honestly unknown).
    fixedLayers: {
      config: () => Promise.resolve(mock.fixedLayersConfig()),
      setConfig: (req) => Promise.resolve(mock.setFixedLayers(req)),
      // R-021 stage 3 — the exact-slot load (mock models the bridge's refusals).
      load: (req) =>
        Promise.resolve(
          mock.loadFixed(req.channel, req.layer, req.itemId, req.templateId, req.fields),
        ),
      // The bank-scoped clear (mock models the bridge's two structural guards).
      clearLayer: (req) => Promise.resolve(mock.clearBankLayer(req.channel, req.layer)),
      state: () => Promise.resolve(mock.fixedLayersState()),
      onConfigChanged: (handler) => mock.fixedConfigChanged.subscribe(handler),
      onStateChanged: (handler) => mock.fixedStateChanged.subscribe(handler),
    },

    // R-028 part B — the declared playout layers (offline: seeded, else empty).
    playoutLayers: {
      state: () => Promise.resolve(mock.playoutLayersState()),
      clear: (req) => Promise.resolve(mock.playoutClear(req.channel, req.layer)),
      onStateChanged: (handler) => mock.playoutStateChanged.subscribe(handler),
    },

    // B-145 (2.8) — the bridge-owned Live Source ledger (offline: e2e-seeded, else
    // empty, because the mock has seated nothing). No clear verb: the sanctioned
    // ones are item-scoped and already on `stack`.
    liveLayers: {
      state: () => Promise.resolve(mock.liveLayersState()),
      onStateChanged: (handler) => mock.liveLayersChanged.subscribe(handler),
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
      // B-038 Phase 2 — offline accepts and IGNORES `req.html`: the mock has no
      // HTTP server and no CasparCG, so there is nothing to serve. Only the live
      // bridge retains the HTML; offline stays "OFFLINE (mock) — nothing renders".
      import: (req) => Promise.resolve(mock.templateImport(req.template, req.redelivery ?? false)),
      // R-005 — the mock applies the same refuse-while-referenced predicate as the bridge.
      remove: (req) => Promise.resolve(mock.templateRemove(req.templateId)),
      // R-028 (o1) — the catalogue push, mirrored by the mock's own emitter.
      onChanged: (handler) => mock.templatesChanged.subscribe(handler),
      // R-022 — the mock retains no rendered page (it accepts and ignores `html`
      // at import, per the note above), so it honestly holds none. The rehearsal
      // panel renders its "unavailable in this browser" state rather than a blank
      // box — which is the truthful answer in test mode, not a degradation.
      html: () => Promise.resolve(null),
    },

    audit: {
      recent: (req) => Promise.resolve(mock.auditRecent(req.limit, req.action, req.actor)),
      health: () => Promise.resolve(mock.auditHealth()),
      // Browser-local in the mock exactly as in the real bridge — same storage, same
      // module. The mock's own rows record it too, so the offline console shows the
      // same attribution the live one would.
      operatorName: () => getOperatorName(),
      setOperatorName: (name: string) => {
        setOperatorName(name);
      },
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

    // R-034 — offline parity. The mock stands in for the bridge's disk-persisted
    // list; it uses `localStorage`, which is the closest thing test mode has to
    // "survives a restart". Cross-browser sharing is the one property the mock
    // genuinely cannot model — there is no shared party in offline mode — and
    // that is a property of test mode, not a gap in the contract.
    // D-137 / C-015 — offline parity for both halves. The mock shares the
    // bridge's VALIDATORS (`checkSourceCatalog` / `checkSourceAssignments`) and
    // its delete CASCADE (`pruneAssignmentsForCatalog`), so a refusal the
    // operator meets here is the one the real station would give.
    sources: {
      config: () => Promise.resolve(mock.sourceCatalog()),
      setConfig: (req) => Promise.resolve(mock.setSourceCatalog(req)),
      onConfigChanged: (handler) => mock.sourceCatalogChanged.subscribe(handler),
      assignments: () => Promise.resolve(mock.sourceAssignments()),
      setAssignments: (req) => Promise.resolve(mock.setSourceAssignments(req)),
      onAssignmentsChanged: (handler) => mock.sourceAssignmentsChanged.subscribe(handler),
    },

    delimiters: {
      list: () => Promise.resolve(mock.delimitersList()),
      set: (req) => Promise.resolve(mock.delimitersSet(req.delimiters)),
      onChanged: (handler) => mock.delimitersChanged.subscribe(handler),
    },

    // R-022 — offline parity for REHEARSE. The mock holds the same interlock:
    // `take` refuses a rehearsing item, so the guard is exercised in test mode
    // rather than only against the real bridge.
    rehearse: {
      state: () => Promise.resolve(mock.rehearseState()),
      enter: (req) => Promise.resolve(mock.enterRehearse(req.itemId)),
      exit: (req) => Promise.resolve(mock.exitRehearse(req.itemId)),
      onStateChanged: (handler) => mock.rehearseChanged.subscribe(handler),
    },

    // R-030 — offline parity for the channel raster, same shape and same reason
    // as the delimiter list above.
    channelSettings: {
      get: () => Promise.resolve(mock.channelSettingsState()),
      set: (req) => Promise.resolve(mock.setChannelSettings(req)),
      onChanged: (handler) => mock.channelSettingsChanged.subscribe(handler),
    },
  };
}

import {
  activeRangeOf,
  listBoundSequenceIds,
  playoutOf,
  sequenceItemInstanceId,
  sequenceItemTextFieldIds,
  type Element,
  type FrameRange,
  type ListItem,
  type NestedFieldValues,
  type Playout,
  type Scene,
} from '@cg/shared-schema';
import {
  applyAnimationAtFrame,
  entranceSettleFrame,
  type AnimatedElement,
} from './animation-applier.js';
import { applyScopedFieldValues } from './bindings.js';

/**
 * Deep-merge a nested field-value patch into the current values. Plain objects
 * (namespaces) merge recursively; scalars / image `{assetId}` / arrays replace.
 * So a partial `update({ home: { score: 2 } })` keeps `home.teamName`.
 */
function mergeNestedValues(base: NestedFieldValues, patch: NestedFieldValues): NestedFieldValues {
  const out: NestedFieldValues = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const prev = out[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !('assetId' in v) &&
      prev !== null &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      !('assetId' in prev)
    ) {
      out[k] = mergeNestedValues(prev, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * D-083 — navigate a nested value object to the sub-object at a dotted scope path
 * (`''` = root). Used to read a sequence item's per-item values at the sequence's OWN
 * scope (so a sequence nested in a composition instance reads its scoped sub-object,
 * not a root-level one).
 */
function resolveScopeValues(values: NestedFieldValues, path: string): NestedFieldValues {
  if (path === '') return values;
  let cur: NestedFieldValues = values;
  for (const seg of path.split('.')) {
    const next = cur[seg];
    cur =
      next !== null && typeof next === 'object' && !Array.isArray(next)
        ? (next as NestedFieldValues)
        : {};
  }
  return cur;
}
import { ensureBaselineCss } from './css.js';
import { EventBus } from './event-bus.js';
import { LifecycleStateMachine } from './lifecycle.js';
import { PlayoutController } from './playout-controller.js';
import {
  buildRepeaterRows,
  buildScene,
  buildSequenceCompositionItem,
  repeaterItemValues,
} from './scene-builder.js';
import { ClockDriver } from './clock-driver.js';
import {
  RepeaterDriver,
  registerRepeaterDriver,
  type RepeaterRowHandle,
} from './repeater-driver.js';
import {
  SequenceDriver,
  registerSequenceDriver,
  type RenderedSequenceItem,
  type SequenceCompositionRenderer,
} from './sequence-driver.js';
import { TickerDriver, registerTickerDriver, type TickerSeparatorImage } from './ticker-driver.js';
import type {
  FieldScope,
  PlayOptions,
  PlayoutOverride,
  RuntimeBootOptions,
  StopOptions,
  TemplateRuntime,
  UpdateOptions,
} from './types.js';

/**
 * D-112 — one of a scope's OWN hold-eligible content sources (ticker / countdown clock / sequence),
 * UNFILTERED by `drivesHold`, so the PARENT's aggregation can re-filter it per the instance override
 * (which may force-include a child-excluded element or force-exclude a child-included one). `drivesHold`
 * is the element's OWN authored flag (absent ⇒ `true`); `id` is the content element's stable id.
 */
interface ContentDriver {
  id: string;
  drivesHold: boolean;
  whenComplete: () => Promise<void>;
}

/** D-026 — a node in the controller tree paralleling the field-scope tree. */
interface ScopeNode {
  controller: PlayoutController;
  /** Wiring-tree children: nested composition instances AND stamped repeater rows (the cascade walks these). */
  children: ScopeNode[];
  /** D-104 — this scope's hold is content-driven (a "coordinator"). */
  isCoordinator: boolean;
  /** D-104 — reset + start this scope's OWN content drivers (tickers / clocks / sequences). */
  startOwnContent: () => void;
  /** D-104 — this scope's OWN content completion (`Promise.all` of its content sources), or null if it has none. */
  ownContentWait: () => Promise<void> | null;
  /**
   * D-112 — this scope's OWN hold-eligible drivers, UNFILTERED (each with its own `drivesHold`), so
   * an instancing PARENT can re-filter them by its per-instance `holdOverrides` (see {@link
   * nestedContentWait}). `ownContentWait` is the `drivesHold`-only subset used by THIS scope's own hold.
   */
  contentDrivers: readonly ContentDriver[];
  /**
   * D-112 — the per-instance hold overrides from the composition-instance element that produced THIS
   * scope (keyed by nested content element id), set by the instancing parent. Applied to
   * `contentDrivers` when the PARENT aggregates; absent key ⇒ the element's own `drivesHold`.
   */
  holdOverrides?: Readonly<Record<string, boolean>> | undefined;
  /** D-104 — composition-INSTANCE children only (NOT repeater rows), for content aggregation up the tree. */
  instanceChildren: ScopeNode[];
  /**
   * B-031 — resolves when THIS scope's controller SETTLES (after its own outro). A
   * content-driven parent waits on a nested CONTENT-DRIVEN (coordinator) child's settle,
   * so a content-driven nested composition DRIVES the parent's hold while still
   * self-settling (its own outro) — the staggered content-first / background-last exit.
   */
  whenSettled: () => Promise<void>;
}

/**
 * D-104 — reset + start `node`'s own content drivers and those of its
 * non-coordinator nested-composition descendants, so a coordinator parent starts
 * nested content at ITS hold entry (after the parent's intro). A coordinator
 * descendant owns + self-starts its own subtree, so the recursion STOPS at it.
 */
function startContentTree(node: ScopeNode): void {
  node.startOwnContent();
  for (const child of node.instanceChildren) {
    if (!child.isCoordinator) startContentTree(child);
  }
}

/**
 * B-031 — aggregate a scope's content completion for a content-driven hold: its OWN
 * content sources (already D-107 `drivesHold`-filtered) PLUS, for each
 * composition-instance child, EITHER the recursed wait of a NON-coordinator child
 * (whose content this coordinator starts + waits on), OR a CONTENT-DRIVEN
 * (coordinator) child's SELF-SETTLE (`whenSettled`). A content-driven nested
 * composition self-starts and self-settles its own content (honoring its own
 * `drivesHold`); the parent holds until it has played out — so it DRIVES the parent's
 * hold too (the D-104 unconditional skip is removed). An infinite nested coordinator
 * never settles, so the parent holds until `stop()`. null when nothing finite is
 * coordinated (a zero-length hold).
 */
function aggregateContentWait(
  ownWait: Promise<void> | null,
  instanceChildren: readonly ScopeNode[],
): Promise<void> | null {
  const waits: Promise<void>[] = [];
  if (ownWait !== null) waits.push(ownWait);
  for (const child of instanceChildren) {
    if (child.isCoordinator) {
      waits.push(child.whenSettled());
    } else {
      const childWait = nestedContentWait(child);
      if (childWait !== null) waits.push(childWait);
    }
  }
  return waits.length > 0 ? Promise.all(waits).then(() => undefined) : null;
}

/**
 * D-112 — does content driver `d` drive the hold of the PARENT that instanced its scope? The
 * instance's per-instance `overrides[d.id]` wins when defined; otherwise the element's own
 * `drivesHold`. This is consulted ONLY by the parent's aggregation — the child's own hold uses
 * `ownContentWait` (its own `drivesHold`), and content still starts/runs regardless.
 */
function effectiveDrivesParentHold(
  overrides: Readonly<Record<string, boolean>> | undefined,
  d: ContentDriver,
): boolean {
  const o = overrides?.[d.id];
  return o !== undefined ? o : d.drivesHold;
}

/**
 * D-112 — a NON-coordinator nested child's content as seen by its PARENT: its OWN drivers re-filtered
 * by THIS instance's `holdOverrides` (so a parent can include/exclude a nested element without
 * touching the shared child), PLUS its instance children (a coordinator grandchild self-settles;
 * a non-coordinator grandchild recurses, applying ITS OWN overrides — cascade per level). Replaces
 * the old `contentTreeWait` (which used `ownContentWait`, baking only the child's own `drivesHold`).
 */
function nestedContentWait(node: ScopeNode): Promise<void> | null {
  const waits: Promise<void>[] = [];
  for (const d of node.contentDrivers) {
    if (effectiveDrivesParentHold(node.holdOverrides, d)) waits.push(d.whenComplete());
  }
  for (const child of node.instanceChildren) {
    if (child.isCoordinator) {
      waits.push(child.whenSettled());
    } else {
      const childWait = nestedContentWait(child);
      if (childWait !== null) waits.push(childWait);
    }
  }
  return waits.length > 0 ? Promise.all(waits).then(() => undefined) : null;
}

/**
 * B-032 — does this scope's content tree have any EFFECTIVE hold driver: an OWN ticker / sequence /
 * countdown clock that EFFECTIVELY drives, OR one reachable through a nested instance child
 * (recursively)? Mirrors `@cg/shared-schema`'s `hasEffectiveHoldDrivers` (which walks the scene
 * tree) over the already-BUILT `FieldScope` tree. Consumed by `effectivePlayoutFor` to fall a
 * `content-driven` hold with NO drivers back to `timed`, so the authored `holdMs` is honored.
 * D-112 — effective participation through a nested instance is the instance's `holdOverrides[id]`
 * when defined (force-include / force-exclude per instance), else the element's own `drivesHold`
 * (matching the parent's `nestedContentWait` aggregation), cascading per instance level. `overrides`
 * is undefined at the scope's own level (its own content uses its own `drivesHold`).
 */
function scopeHasEffectiveHoldDrivers(
  scope: FieldScope,
  overrides?: Readonly<Record<string, boolean>>,
): boolean {
  const drives = (el: { id: string; drivesHold?: boolean | undefined }): boolean =>
    overrides?.[el.id] ?? el.drivesHold !== false;
  for (const t of scope.tickers) if (drives(t.element)) return true;
  for (const c of scope.clocks)
    if (c.element.mode === 'countdown' && drives(c.element)) return true;
  for (const sq of scope.sequences) if (drives(sq.element)) return true;
  for (const child of scope.children)
    if (scopeHasEffectiveHoldDrivers(child.scope, child.holdOverrides)) return true;
  return false;
}

/**
 * D-030 — one WIRED subtree: the controller tree + every driver of one scope
 * tree, with symmetric teardown. The static scene is one subtree; a repeater
 * stamps one more per row at each fresh play and destroys them on re-stamp.
 * Wiring-tree membership is what the play/pause/resume/next/settle cascades
 * iterate — distinct from the D-025 NAMESPACE tree (`scope.children`), which
 * feeds field aggregation/GDD and which stamped rows never join.
 */
interface WiredSubtree {
  node: ScopeNode;
  tickers: TickerDriver[];
  clocks: ClockDriver[];
  sequences: SequenceDriver[];
  repeaters: RepeaterDriver[];
  /** Stop + destroy every driver and controller of this subtree, deregister. */
  destroy(): void;
}

/** Flatten every scope's animated elements (parent first) into one list. */
function collectScopeAnimated(scope: FieldScope, out: AnimatedElement[]): void {
  for (const entry of scope.animated) out.push(entry);
  for (const child of scope.children) collectScopeAnimated(child.scope, out);
}

/**
 * D-062 — set `src` on every built `<img data-cg-asset-id>` whose id is in the
 * host-supplied `assetUrls` map. The single seam both exporters use to render
 * image elements; the Designer preview passes no map and wires `src` itself.
 */
function applyAssetUrls(
  container: HTMLElement,
  assetUrls?: Readonly<Record<string, string>>,
): void {
  if (assetUrls === undefined) return;
  const nodes = container.querySelectorAll<HTMLImageElement>('img[data-cg-asset-id]');
  nodes.forEach((node) => {
    const id = node.dataset['cgAssetId'];
    if (id === undefined) return;
    const url = assetUrls[id];
    if (url !== undefined && url !== '') node.src = url;
  });
}

/**
 * Build the runtime. Caller is responsible for `await`ing
 * `runtime.ready` before the first `runtime.play()`. The CasparCG
 * adapter (installed by `installCasparGlobals`) does this internally.
 */
export function createRuntime(scene: Scene, options: RuntimeBootOptions = {}): TemplateRuntime {
  const doc = options.root?.ownerDocument ?? document;
  const root = options.root ?? doc.body;

  ensureBaselineCss(doc);
  doc.body.classList.add('cg-pending');

  const built = buildScene(scene, doc);
  root.appendChild(built.container);

  // D-062 — wire image `src` from a host-supplied assetId→URL map. The scene
  // builder emits `<img data-cg-asset-id>` with no `src`; exporters pass the
  // resolved URLs here (packaged relative paths for `.vcg`, base64 data URIs for
  // single-file HTML) so images render in exported output. Absent ⇒ no-op, so the
  // Designer preview keeps wiring `src` host-side, unchanged.
  applyAssetUrls(built.container, options.assetUrls);

  // D-020/D-026 — per-scope, non-persistent overrides (preview session / future
  // rundown) override the stored playout — and the scope's tickers' own
  // repeat/boundary — for THIS run only, keyed by the scope's instance-name path
  // (`''` = root). `playoutOverride` is the legacy root-only alias for
  // `scopeOverrides['']`.
  const overrides: Record<string, PlayoutOverride> = { ...(options.scopeOverrides ?? {}) };
  if (options.playoutOverride !== undefined && overrides[''] === undefined) {
    overrides[''] = options.playoutOverride;
  }

  const machine = new LifecycleStateMachine();
  const bus = new EventBus();
  // Nested so namespaced child-instance values (e.g. { home: { teamName } }) route
  // by namespace; a flat scene just uses top-level keys.
  let currentValues: NestedFieldValues = {};

  // D-083 — sequences whose ITEM-LIST is data-bound (across the scene + every comp): the
  // bound list owns their items, so the per-item operator TEXT override is suppressed for
  // them (no double-drive) — matching the field aggregation, which exposes per-item fields
  // only for NON-bound sequences.
  const listBoundSeqIds = new Set<string>([
    ...listBoundSequenceIds(scene),
    ...(scene.compositions ?? []).flatMap((c) => [...listBoundSequenceIds(c)]),
  ]);
  // D-083 follow-up — EXPLICIT per-item TEXT bindings across the scene + every comp, as
  // `sequence elementId → (item id → bound field id)`. A text item is operator-editable ONLY
  // when present here; unbound items stay static. Element ids are globally unique, so one
  // merged map serves every scope (each sequence reads its own entry by element id).
  const seqItemTextFields = sequenceItemTextFieldIds(scene);
  for (const c of scene.compositions ?? []) {
    for (const [elId, m] of sequenceItemTextFieldIds(c)) seqItemTextFields.set(elId, m);
  }

  // B-029 — per-element lifespan visibility, evaluated at a given frame. Late-bound: the
  // gates are collected after the scene builds (below), but the ROOT controller's
  // per-frame `applyFrame` (wired before that) calls this so lifespan is honored during
  // PLAYBACK too (not only the designer scrubber's `tick`). Without it, a frame trimmed to
  // `lifespan.in > 0` is hidden by an open-time scrub and never restored on play (dropped),
  // and the export ignores lifespan entirely.
  let applyLifespanGatesAtFrame: (frame: number) => void = () => undefined;

  const ready: Promise<void> = options.skipFontLoad ? Promise.resolve() : waitForFonts(doc);
  void ready.then(() => bus.emit('ready'));

  // D-020/D-028 — each controller owns its scope's playhead. The default is
  // play-once-and-hold: it plays `[activeRange.in → outPoint]` once (an absent
  // `outPoint` is the last active frame) and holds, then the `mode` orchestration
  // (auto-out / loop-cycle) runs, with `holdSource` deciding what ends each hold
  // (timed `holdMs` vs. the scope's content sources completing). The stored
  // `playout` carries the defaults; `overrides` layers the session knobs per scope.
  const effectivePlayoutFor = (scope: FieldScope, path: string): Playout => {
    const b = playoutOf(scope.source);
    const o = overrides[path];
    const merged: Playout = {
      mode: o?.mode ?? b.mode,
      holdSource: o?.holdSource ?? b.holdSource,
      holdMs: o?.holdMs ?? b.holdMs,
      repeat: o?.repeat ?? b.repeat,
    };
    // B-032 — a content-driven hold with NO effective content drivers (own + nested, drivesHold-aware)
    // is a zero-length, meaningless hold: resolve it to TIMED so the authored `holdMs` is honored and
    // export + on-air agree. The static `@cg/shared-schema` `hasEffectiveHoldDrivers` does the same on
    // the scene tree for the exporter / inspector.
    if (merged.holdSource === 'content-driven' && !scopeHasEffectiveHoldDrivers(scope)) {
      return { ...merged, holdSource: 'timed' };
    }
    return merged;
  };

  // D-026 — the root scope alone drives the global lifecycle machine + events: its
  // exit settles the whole template's state/visibility once per exit.
  const rootOnExitStart = (): void => {
    if (machine.state === 'on-air' || machine.state === 'playing') {
      machine.transition('exiting');
      bus.emit('stop.start');
    }
  };
  const rootOnSettle = (): void => {
    if (machine.state === 'exiting') machine.transition('stopped');
    doc.body.classList.add('cg-pending');
    bus.emit('stop.end');
  };

  const noop = (): void => undefined;
  // Assigned once the wiring exists (the closure below fires long after). The
  // ROOT settling on its own (auto-out / finite loop-cycle / finite
  // content-driven) takes the whole template off air: cascade stop() to every
  // nested scope (settled children no-op per D-026) and freeze every driver —
  // otherwise an infinite nested lifecycle keeps timers/rAF rolling under the
  // hidden stage, with stop() unreachable (machine already 'stopped').
  let onRootSettled: () => void = noop;

  // Every wired subtree, in wiring order (the static tree first; repeater rows
  // join per stamp). The runtime-level cascades iterate this set.
  const subtrees = new Set<WiredSubtree>();

  /**
   * D-030 — wire ONE scope subtree: instantiate its drivers (tickers with
   * per-scope overrides, clocks, sequences) and build its controller tree,
   * returning a handle with symmetric teardown. Extracted from the original
   * inline wiring so a repeater can stamp/tear down row subtrees with exactly
   * the same machinery the static tree uses; behavior-preserving for the
   * static tree (`isRootSubtree` gates the root-only hooks: the external
   * `contentHold` override and the global machine/event wiring).
   */
  const wireScopeSubtree = (
    subtreeScope: FieldScope,
    subtreePath: string,
    isRootSubtree: boolean,
  ): WiredSubtree => {
    const tickers: TickerDriver[] = [];
    const clocks: ClockDriver[] = [];
    const sequences: SequenceDriver[] = [];
    const repeaters: RepeaterDriver[] = [];
    const controllers: PlayoutController[] = [];

    const wireScope = (
      scope: FieldScope,
      path: string,
      isSubtreeRoot: boolean,
      hasContentDrivingAncestor: boolean,
    ): ScopeNode => {
      const scopeOverride = overrides[path];
      // D-028 — one treadmill driver per ticker element, per scope (the same
      // child composition instanced twice gets two independent drivers).
      // Instantiated BEFORE the initial field application so a `list` field
      // default can already reconcile into its driver. The node→driver
      // registries are how the bindings applier routes `*-items` values.
      // D-107 — content whose `drivesHold !== false` (absent ⇒ participates) DRIVES the
      // content-driven hold; the full `scope*` driver arrays still START/STOP every
      // content element (this is about the HOLD, not starting/visibility).
      // D-112 — every hold-eligible OWN driver, UNFILTERED by `drivesHold`, so an instancing parent
      // can re-filter by its per-instance override (the `hold*` arrays stay the own-hold subset).
      const contentDrivers: ContentDriver[] = [];
      const holdTickers: TickerDriver[] = [];
      const scopeTickers = scope.tickers.map((t) => {
        // D-028 inner loop — the element's authored repeat/boundary. D-102 Phase 1 — the session
        // override is PER-ELEMENT (keyed by the ticker's element id), so two tickers in one scope
        // are tuned independently; each maps to its OWN driver here.
        const tickerOverride = scopeOverride?.tickers?.[t.element.id];
        const effRepeat = tickerOverride?.repeat ?? t.element.repeat;
        const effBoundary = tickerOverride?.cycleBoundary ?? t.element.cycleBoundary;
        // D-056 — the ticker has no box padding; the crawl viewport is full-bleed, so
        // the travel width is the full band width.
        const driver = new TickerDriver({
          band: t.band,
          track: t.track,
          viewportWidth: Math.max(0, t.element.transform.size.w),
          direction: t.element.direction,
          // D-045 — vertical placement of crawl items within the band (mirrors authoring).
          verticalAlign: t.element.verticalAlign,
          speed: t.element.speed,
          gap: t.element.gap,
          // D-039ext — pass a text separator through; for an image separator, attach the
          // host-resolved `url` from `assetUrls` so the driver can set `src` on the nodes it
          // FEEDS (the one-time applyAssetUrls walk can't reach driver-created nodes). The node
          // also carries data-cg-asset-id/-source for a host re-walk when no url is known yet.
          separator:
            t.element.separator === undefined || typeof t.element.separator === 'string'
              ? t.element.separator
              : ({
                  ...t.element.separator,
                  url: options.assetUrls?.[t.element.separator.assetId],
                } satisfies TickerSeparatorImage),
          items: t.element.items,
          repeat: effRepeat,
          cycleBoundary: effBoundary,
          clock: options.clock,
          measure: options.tickerMeasure,
        });
        registerTickerDriver(t.band, driver);
        // D-102 Phase 1 — stamp the EFFECTIVE (post-override) timing on the band so the operator
        // (and tests) can see which repeat/seam each ticker is actually running this session.
        t.band.dataset['cgTickerRepeat'] = String(effRepeat);
        t.band.dataset['cgTickerBoundary'] = effBoundary;
        // D-105 — mark the content root so the coordinated exit (out/stop) can fade/hide it.
        t.band.dataset['cgContent'] = 'ticker';
        tickers.push(driver);
        // D-107 — joins the hold wait unless explicitly excluded.
        if (t.element.drivesHold !== false) holdTickers.push(driver);
        // D-112 — exposed UNFILTERED so a parent instance override can re-filter it.
        contentDrivers.push({
          id: t.element.id,
          drivesHold: t.element.drivesHold !== false,
          whenComplete: () => driver.whenComplete(),
        });
        return driver;
      });
      // D-027 — clock drivers (no overrides and no bindings: no fields in v1).
      const holdCountdowns: ClockDriver[] = [];
      const scopeClocks = scope.clocks.map((c) => {
        const driver = new ClockDriver({
          node: c.node,
          mode: c.element.mode,
          format: c.element.format,
          digits: c.element.digits,
          target: c.element.target,
          timezone: c.element.timezone,
          blinkColon: c.element.blinkColon,
          blinkPeriodMs: c.element.blinkPeriodMs,
          clock: options.clock,
        });
        // D-105 — mark the content root for the coordinated exit (out/stop).
        c.node.dataset['cgContent'] = 'clock';
        clocks.push(driver);
        // D-107 — only a COUNTDOWN drives the hold (wall/countup never complete), and only
        // when not explicitly excluded. D-112 — a countdown is also exposed UNFILTERED.
        if (c.element.mode === 'countdown') {
          if (c.element.drivesHold !== false) holdCountdowns.push(driver);
          contentDrivers.push({
            id: c.element.id,
            drivesHold: c.element.drivesHold !== false,
            whenComplete: () => driver.whenComplete(),
          });
        }
        return driver;
      });
      // D-029 — sequence drivers; the host→driver registry routes
      // `sequence-items` bindings, and `runtime.next()` dispatches per scope.
      const holdSequences: SequenceDriver[] = [];
      const scopeSequences = scope.sequences.map((s) => {
        // D-083 — a COMPOSITION item renders the referenced composition's HELD content
        // with LIVE inner drivers (a clock ticks): build the comp subtree and wire it
        // through the SAME machinery as repeater rows (`wireScopeSubtree`), then drive
        // its time sources directly from the sequence item's lifecycle. The comp's own
        // intro/outro controllers are NOT run (held content); teardown is on advance.
        const renderComposition: SequenceCompositionRenderer = (item): RenderedSequenceItem => {
          const built = buildSequenceCompositionItem(
            scene,
            item.compositionId,
            { width: s.element.transform.size.w, height: s.element.transform.size.h },
            { depth: s.depth, visited: s.visited },
            doc,
          );
          if (built === null) {
            // Missing / over-deep / cyclic reference ⇒ an empty grid-cell box.
            const empty = doc.createElement('div');
            empty.style.gridArea = '1 / 1';
            const noop = (): void => undefined;
            return { node: empty, show: noop, pause: noop, resume: noop, hide: noop };
          }
          const itemSub = wireScopeSubtree(
            built.scope,
            `${path}#${s.element.id}:item:${item.id}`,
            false,
          );
          // D-083 — apply this item's namespaced field values (so the operator can edit
          // e.g. the label next to a clock INSIDE the composition item), applying the
          // comp's bindings (falling back to the comp's field defaults). The value KEY is
          // the stable id-based `sequenceItemInstanceId` (matching the field aggregation,
          // so two same-named sequences never collide); the item's values live under THIS
          // scope's namespace path (`path`), so a sequence nested in a composition instance
          // reads the correctly-scoped sub-object, not a root-level one.
          const childComp = scene.compositions?.find((c) => c.id === item.compositionId);
          const namespace = sequenceItemInstanceId(s.element.id, item.id);
          const applyFields = (values: Record<string, unknown>): void => {
            if (childComp === undefined) return;
            const sub = resolveScopeValues(values as NestedFieldValues, path)[namespace];
            const itemValues =
              sub !== null && typeof sub === 'object' ? (sub as NestedFieldValues) : {};
            applyScopedFieldValues(scene, childComp, itemValues, built.scope);
          };
          applyFields(currentValues); // initial render uses the current values (defaults pre-play)
          let torndown = false;
          return {
            node: built.cell,
            applyFields,
            show: (): void => {
              for (const c of itemSub.clocks) c.start();
              for (const t of itemSub.tickers) t.start();
              for (const sq of itemSub.sequences) sq.start();
            },
            pause: (): void => {
              for (const c of itemSub.clocks) c.pause();
              for (const t of itemSub.tickers) t.pause();
              for (const sq of itemSub.sequences) sq.pause();
            },
            resume: (): void => {
              for (const c of itemSub.clocks) c.resume();
              for (const t of itemSub.tickers) t.resume();
              for (const sq of itemSub.sequences) sq.resume();
            },
            hide: (): void => {
              if (torndown) return; // idempotent — stop() then reset() both hide
              torndown = true;
              itemSub.destroy();
            },
          };
        };
        const driver = new SequenceDriver({
          host: s.host,
          direction: s.element.direction,
          items: s.element.items,
          defaultDwellMs: s.element.defaultDwellMs,
          advance: s.element.advance,
          transitionIn: s.element.transitionIn,
          transitionOut: s.element.transitionOut,
          transitionTiming: s.element.transitionTiming,
          transitionMs: s.element.transitionMs,
          repeat: s.element.repeat,
          glyphGradientCss: s.glyphGradientCss,
          renderComposition,
          // D-083 follow-up — per-item TEXT override is EXPLICIT: an item is operator-editable
          // only when the designer bound it (a `sequence-item-text` binding → a `text` field).
          // Map each bound itemId to its field id from THIS doc's bindings; unbound items
          // return undefined and stay static (the driver falls back to `item.text`). Suppressed
          // entirely when the item-list is bound (the bound list owns the items). Read at the
          // sequence's OWN scope path (nesting-safe), keyed by the bound field id.
          textValueFor: ((): ((itemId: string) => string | undefined) | undefined => {
            if (listBoundSeqIds.has(s.element.id)) return undefined;
            const itemFieldIds = seqItemTextFields.get(s.element.id);
            if (itemFieldIds === undefined || itemFieldIds.size === 0) return undefined;
            return (itemId: string): string | undefined => {
              const fieldId = itemFieldIds.get(itemId);
              if (fieldId === undefined) return undefined;
              const v = resolveScopeValues(currentValues, path)[fieldId];
              return typeof v === 'string' ? v : undefined;
            };
          })(),
          clock: options.clock,
        });
        registerSequenceDriver(s.host, driver);
        // D-105 — mark the content root for the coordinated exit (out/stop).
        s.host.dataset['cgContent'] = 'sequence';
        sequences.push(driver);
        // D-107 — joins the hold wait unless explicitly excluded.
        if (s.element.drivesHold !== false) holdSequences.push(driver);
        // D-112 — exposed UNFILTERED so a parent instance override can re-filter it.
        contentDrivers.push({
          id: s.element.id,
          drivesHold: s.element.drivesHold !== false,
          whenComplete: () => driver.whenComplete(),
        });
        return driver;
      });

      // D-028/D-027/D-029 — this scope's OWN content completion from its CONTENT
      // SOURCES that DRIVE the hold. D-107 — only content with `drivesHold !== false`
      // (absent ⇒ participates) gates the hold, so a permanent/looping/decorative
      // element no longer keeps the graphic on-air forever; the `hold*` arrays were
      // collected above as each driver was built (countdowns also filtered by kind —
      // wall/countup never complete and are never content sources). An infinite
      // SELECTED ticker/sequence still never resolves (holds until stop()). No
      // HOLD-DRIVING sources ⇒ null — including the case where every content element
      // is EXCLUDED (a zero-length hold, consistent with the no-content case).
      // Reset + start THIS scope's own drivers (a fresh crawl / count / run from
      // item 1 per open/close cycle). D-104 — a coordinator also calls this for
      // its non-coordinator nested descendants, so nested content begins at the
      // PARENT's hold entry.
      const startOwnContent = (): void => {
        for (const t of scopeTickers) {
          t.reset();
          t.start();
        }
        for (const c of scopeClocks) {
          c.reset();
          c.start();
        }
        for (const s of scopeSequences) {
          s.reset();
          s.start();
        }
      };
      const ownContentWait = (): Promise<void> | null =>
        holdTickers.length > 0 || holdCountdowns.length > 0 || holdSequences.length > 0
          ? Promise.all([
              ...holdTickers.map((t) => t.whenComplete()),
              ...holdCountdowns.map((c) => c.whenComplete()),
              ...holdSequences.map((s) => s.whenComplete()),
            ]).then(() => undefined)
          : null;
      const stopScopeContent = (): void => {
        for (const t of scopeTickers) t.stop();
        for (const c of scopeClocks) c.stop();
        for (const s of scopeSequences) s.stop();
      };
      // B-031 — resolves when THIS scope settles (after its outro), so a content-driven
      // parent can hold until a nested content-driven (coordinator) child has played out.
      let resolveSettled: () => void = () => undefined;
      const settled = new Promise<void>((res) => {
        resolveSettled = res;
      });
      const effPlayout = effectivePlayoutFor(scope, path);
      const isGlobalRoot = isSubtreeRoot && isRootSubtree;
      // D-104 — a "coordinator" is a content-driven (non-manual) scope: its hold lasts
      // until its OWN content PLUS its nested descendants' content completes. B-031 — a
      // content-driven nested comp is ALSO coordinated (the parent waits on its
      // self-settle), so it drives the parent's hold; a non-coordinator nested comp's
      // content is started + awaited by this coordinator. An EXPLICIT boot `contentHold`
      // still wins for the ROOT.
      const isCoordinator =
        effPlayout.mode !== 'manual' && effPlayout.holdSource === 'content-driven';
      // D-104 follow-up — a scope DRIVES content (starts its OWN + its non-coordinator
      // nested descendants' content, at its hold entry) when it is a subtree root (no
      // content-driving ancestor) OR a coordinator. Every other scope is driven by an
      // ancestor and must NOT self-start — self-starting decoupled nested content from
      // the parent's intro (it began at the nested instance's own hold entry, or at play).
      const drivesContent = isCoordinator || !hasContentDrivingAncestor;
      // Build the nested composition-instance children FIRST (they don't depend on
      // this scope's controller), so the content closures below can close over them
      // without a forward reference. Each child's path appends its instance name to
      // the parent's dotted path (root = ''): '' → 'home' → 'home.inner' — the key
      // `effectivePlayoutFor`/`scopeOverrides` use to target one scope's timing.
      // D-104 follow-up — every child has a content-driving ancestor (this scope drives
      // it, or this scope is itself driven and `startContentTree` recurses through it),
      // so a nested non-coordinator never self-starts: its content begins at the nearest
      // driving ancestor's hold entry.
      const instanceChildren = scope.children.map((c) => {
        const child = wireScope(
          c.scope,
          path === '' ? c.name : `${path}.${c.name}`,
          false,
          drivesContent || hasContentDrivingAncestor,
        );
        // D-112 — attach this instance's per-instance overrides so the PARENT's aggregation
        // (`nestedContentWait`) re-filters THIS child's content without touching the shared child.
        child.holdOverrides = c.holdOverrides;
        return child;
      });
      const activeRange = activeRangeOf(scope.source);
      // D-104 follow-up — the frame where content starts: the designer's EXPLICIT
      // content-start marker (`lifecycle.contentStart`) when placed, else the
      // `entranceSettleFrame()` heuristic (entrance completion). The marker is the
      // deterministic source of truth; the heuristic is only its default. Clamp to
      // [active.in, outPoint] defensively (the schema already constrains it).
      const outPoint = scope.source.lifecycle?.outPoint ?? activeRange.out;
      const marker = scope.source.lifecycle?.contentStart;
      const holdEntry =
        marker !== undefined
          ? Math.max(activeRange.in, Math.min(outPoint, marker))
          : entranceSettleFrame(scope.animated, activeRange.in, outPoint);
      // D-104 follow-up (content-start VISIBILITY) — a content host must show its static
      // initial content (a clock's frozen time, a sequence's item 1, a ticker's band) only
      // FROM the content-start frame, matching the ticker's empty-until-crawl behaviour;
      // before then the clock/sequence HOST showed frozen content (only the driver's run was
      // gated). Collect this scope's content hosts so a per-FRAME gate can HIDE each until the
      // playhead reaches `holdEntry` (the marker or its heuristic), then reveal + (the driver)
      // start it. A per-frame gate (NOT a one-shot at `start()`) so it holds under seek / loop;
      // `natural` is the BUILT display (already `none` for a #197-hidden element), so the gate
      // composes with the visible flag AND with B-029 lifespan (revealed only while in range).
      const contentGates: {
        node: HTMLElement;
        lifespan: FrameRange | undefined;
        natural: string;
      }[] = [];
      const collectContentHost = (element: {
        id: string;
        lifespan?: FrameRange | undefined;
      }): void => {
        const node = built.elementMap.get(element.id);
        if (node !== undefined) {
          contentGates.push({ node, lifespan: element.lifespan, natural: node.style.display });
        }
      };
      for (const t of scope.tickers) collectContentHost(t.element);
      for (const c of scope.clocks) collectContentHost(c.element);
      for (const sq of scope.sequences) collectContentHost(sq.element);
      const applyContentGateAtFrame = (frame: number): void => {
        const started = frame >= holdEntry;
        for (const g of contentGates) {
          const inLifespan =
            g.lifespan === undefined || (frame >= g.lifespan.in && frame <= g.lifespan.out);
          g.node.style.display = started && inLifespan ? g.natural : 'none';
        }
      };
      const controller = new PlayoutController({
        frameRate: scene.frameRate,
        active: activeRange,
        lifecycle: scope.source.lifecycle,
        holdEntryFrame: holdEntry,
        playout: effPlayout,
        hasAnimation: scope.animated.length > 0,
        applyFrame: (frame: number): void => {
          for (const entry of scope.animated) applyAnimationAtFrame(entry, frame);
          // B-029 — honor per-element lifespan during PLAYBACK, not only the scrubber, so a
          // start-trimmed (lifespan.in > 0) element appears at its in-point + plays instead
          // of staying hidden / being dropped. Root-scene gates ride the root playhead.
          if (isGlobalRoot) applyLifespanGatesAtFrame(frame);
          // D-104 follow-up — hide this scope's content hosts (clock / sequence / ticker)
          // until its content-start frame, so a clock/sequence no longer shows frozen content
          // during the intro. After the lifespan gate so it is the final word for content.
          applyContentGateAtFrame(frame);
        },
        onExitStart: isGlobalRoot ? rootOnExitStart : noop,
        onSettle: isGlobalRoot
          ? (): void => {
              onRootSettled();
            }
          : (): void => {
              stopScopeContent();
              resolveSettled(); // B-031 — let a content-driven parent's wait resolve
            },
        // The content closures aggregate THIS scope's own content with its nested
        // descendants' via the module helpers: a non-coordinator child's content is
        // started + awaited here; a content-driven (coordinator) child self-settles and
        // the parent waits on that (B-031). `waitForContent` supplies a content-driven
        // hold's completion (at the hold entry); `onContentStart` starts the content at
        // the entrance-settle frame (the moment the intro completes).
        waitForContent: isCoordinator
          ? (): Promise<void> | null => {
              if (isGlobalRoot && options.contentHold !== undefined) return options.contentHold();
              return aggregateContentWait(ownContentWait(), instanceChildren);
            }
          : undefined,
        onContentStart: drivesContent
          ? (): void => {
              startOwnContent();
              for (const child of instanceChildren) {
                if (!child.isCoordinator) startContentTree(child);
              }
            }
          : undefined,
        clock: options.clock,
      });
      controllers.push(controller);
      // `children` (the cascade tree) starts as the instance children and also
      // receives stamped repeater rows below; `instanceChildren` stays rows-free
      // for D-104 content aggregation.
      const node: ScopeNode = {
        controller,
        children: [...instanceChildren],
        isCoordinator,
        startOwnContent,
        ownContentWait,
        contentDrivers,
        instanceChildren,
        whenSettled: () => settled,
      };

      // D-030 — repeater drivers (after the node exists: stamped rows attach
      // under it so the cascade reaches them like authored children). Each
      // stamp wires a fresh ROW subtree through wireScopeSubtree — real
      // per-scope semantics by reuse — and teardown is symmetric. Row scopes
      // are NOT in scope.children, so they never join the D-025 namespace
      // aggregation; the single bound list field is the data surface.
      for (const entry of scope.repeaters) {
        const comp = scene.compositions?.find((c) => c.id === entry.element.compositionId);
        const stampRows = (items: ListItem[]): RepeaterRowHandle[] => {
          const rows = buildRepeaterRows(
            scene,
            entry.element,
            entry.host,
            items.length,
            { depth: entry.depth, visited: entry.visited },
            doc,
          );
          return rows.map((row, i) => {
            const rowSub = wireScopeSubtree(
              row.scope,
              `${path}#${entry.element.id}[${String(i)}]`,
              false,
            );
            node.children.push(rowSub.node);
            const rowAnimated: AnimatedElement[] = [];
            collectScopeAnimated(row.scope, rowAnimated);
            const apply = (values: Record<string, unknown>): void => {
              if (comp !== undefined) {
                applyScopedFieldValues(scene, comp, values as NestedFieldValues, row.scope);
              }
            };
            const item = items[i];
            if (item !== undefined) apply(repeaterItemValues(item));
            return {
              cell: row.cell,
              apply,
              applyFrame: (frame: number): void => {
                for (const e of rowAnimated) applyAnimationAtFrame(e, frame);
              },
              destroy: (): void => {
                rowSub.destroy();
                const idx = node.children.indexOf(rowSub.node);
                if (idx >= 0) node.children.splice(idx, 1);
                row.cell.remove();
              },
            };
          });
        };
        const driver = new RepeaterDriver({ element: entry.element, host: entry.host, stampRows });
        registerRepeaterDriver(entry.host, driver);
        repeaters.push(driver);
      }
      return node;
    };

    // A subtree root has no content-driving ancestor, so it self-drives its content at
    // its OWN hold entry. This is the static scene root AND each repeater row / sequence
    // composition-item subtree: by design (D-030 / D-083) those keep an INDEPENDENT
    // per-instance lifecycle (own out-point + own outro), so they are NOT driven by the
    // host's hold entry — only directly-nested compositions are (via instanceChildren).
    const node = wireScope(subtreeScope, subtreePath, true, false);
    const sub: WiredSubtree = {
      node,
      tickers,
      clocks,
      sequences,
      repeaters,
      destroy(): void {
        // Symmetric teardown: rows first (each tears down its OWN subtree),
        // then controllers (stop timers/rAF before the drivers release their
        // DOM), then drivers — matching remove()'s original order.
        for (const r of repeaters) r.destroy();
        for (const c of controllers) c.destroy();
        for (const t of tickers) t.destroy();
        for (const c of clocks) c.destroy();
        for (const s of sequences) s.destroy();
        subtrees.delete(sub);
      },
    };
    subtrees.add(sub);
    return sub;
  };

  // The static scene is the first (and for non-repeater scenes, only) subtree.
  const rootSub = wireScopeSubtree(built.scopeTree, '', true);
  const rootNode = rootSub.node;

  applyScopedFieldValues(scene, scene, {}, built.scopeTree);

  // D-026 — every scope (the root scene + each nested instance) owns its animated
  // elements on `scope.animated`. `allAnimated` is the flat union across the whole
  // tree, used by tick() (the designer scrubber) to paint one shared frame; each
  // scope's own controller animates only its own list along its own timeline.
  const allAnimated: AnimatedElement[] = [];
  collectScopeAnimated(built.scopeTree, allAnimated);

  // Per-element lifespan gates — only elements with an explicit
  // `lifespan` are tracked here; the rest stay visible for every
  // frame (the default behaviour the Designer ships with). We
  // remember the prior display value so the toggle restores the
  // element's own visibility instead of forcing `display: block`.
  const lifespanGates = collectLifespanGates(scene, built.elementMap);
  // B-029 — now the gates exist, bind the frame evaluator the scrubber (`tick`) AND the
  // root controller's per-frame `applyFrame` (playback/export) both call.
  applyLifespanGatesAtFrame = (frame: number): void => {
    for (const gate of lifespanGates) {
      const inside = frame >= gate.lifespan.in && frame <= gate.lifespan.out;
      gate.node.style.display = inside ? gate.naturalDisplay : 'none';
    }
  };

  // Apply an operation to every controller in the tree (parent first), so
  // play/stop/pause/remove cascade to every nested instance.
  const cascade = (node: ScopeNode, op: (c: PlayoutController) => void): void => {
    op(node.controller);
    for (const child of node.children) cascade(child, op);
  };

  onRootSettled = (): void => {
    cascade(rootNode, (c) => c.stop()); // root itself is settled — a no-op
    for (const sub of subtrees) {
      for (const t of sub.tickers) t.stop();
      for (const c of sub.clocks) c.stop();
      for (const s of sub.sequences) s.stop();
      for (const r of sub.repeaters) r.stop();
    }
    rootOnSettle();
  };

  // D-029 — the per-scope next() dispatch, parent-first in wiring order (the
  // static tree first, then any stamped subtrees in stamp order). Today the
  // consumers are each scope's sequence drivers; this dispatch is DELIBERATELY
  // the seam the D-031 authored steps model will join (steps register as
  // another per-scope consumer here, defining their precedence vs. in-scope
  // sequences in that change). A template with no consumers is a safe no-op —
  // the optional `TemplateRuntime.next?` contract that the CasparCG `CG NEXT`
  // global (caspar-globals) already calls.
  const dispatchNext = (): void => {
    for (const sub of subtrees) {
      for (const s of sub.sequences) s.next();
    }
  };

  // D-083 — re-apply the operator's per-item field values to any on-screen sequence items
  // (a COMPOSITION item's inner fields AND a TEXT item's text). Their nodes are built
  // dynamically by the sequence driver (NOT in the static scope tree applyScopedFieldValues
  // walks), so a plain field update misses them; this routes the FULL value object to each
  // driver, which extracts each item's namespace.
  const reapplySequenceItemFields = (): void => {
    for (const sub of subtrees)
      for (const s of sub.sequences) s.applyFieldsToCurrent(currentValues);
  };

  // D-105 — coordinated split exit. Content roots (ticker / clock / sequence)
  // carry `data-cg-content`; the keyframed background does NOT. `out()` fades the
  // content off, awaits it, then plays the background outro (the existing stop
  // cascade) so the background never closes over fully-visible content; `stop()`
  // hides the content immediately, then plays the background outro. The pre-exit
  // inline opacity/visibility/transition is saved and restored on the next play
  // (so an authored opacity isn't clobbered and a replay shows the content again).
  // A generation token supersedes an in-flight `out()` fade when stop()/play() arrives.
  const OUT_FADE_MS = 400;
  let exitGen = 0;
  // D-105 — pause-aware exit: a pause arriving during an out() fade defers the
  // background outro until resume(), so the graphic does not close while paused.
  let paused = false;
  let pendingExitOutro = false;
  const exitSetTimeout =
    options.clock?.setTimeout ?? ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));
  const contentRoots = (): HTMLElement[] =>
    Array.from(built.container.querySelectorAll<HTMLElement>('[data-cg-content]'));
  const saveExitStyles = (n: HTMLElement): void => {
    if (n.dataset['cgExit'] !== undefined) return;
    n.dataset['cgExit'] = `${n.style.opacity}|${n.style.visibility}|${n.style.transition}`;
  };
  const fadeContentOut = (ms: number): Promise<void> => {
    for (const n of contentRoots()) {
      saveExitStyles(n);
      n.style.transition = `opacity ${String(ms)}ms linear`;
      n.style.opacity = '0';
    }
    return new Promise<void>((res) => {
      exitSetTimeout(res, ms);
    });
  };
  const hideContentNow = (): void => {
    for (const n of contentRoots()) {
      saveExitStyles(n);
      n.style.transition = '';
      n.style.opacity = '0';
      n.style.visibility = 'hidden';
    }
  };
  const restoreContent = (): void => {
    for (const n of contentRoots()) {
      const saved = n.dataset['cgExit'];
      if (saved === undefined) continue;
      const [op = '', vis = '', tr = ''] = saved.split('|');
      n.style.opacity = op;
      n.style.visibility = vis;
      n.style.transition = tr;
      delete n.dataset['cgExit'];
    }
  };
  // The existing exit: each scope's controller plays its OUT [outPoint → out] (the
  // keyframed background), settling cleared (D-085) via onRootSettled / onSettle.
  const playBackgroundOutroAndSettle = (): void => {
    cascade(rootNode, (c) => c.stop());
  };

  const runtime: TemplateRuntime = {
    ready,

    async play(data, _opts?: PlayOptions): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; play() unavailable');
      }
      await ready;
      // Merge (don't replace) so a `CG PLAY` with no data preserves whatever a
      // prior `CG ADD`/`UPDATE` already set — the CasparCG flow updates first,
      // then plays with no args. play(data) still applies its data. Order no
      // longer matters (D-018/D-019 acceptance).
      currentValues = mergeNestedValues(currentValues, data as NestedFieldValues);
      applyScopedFieldValues(scene, scene, currentValues, built.scopeTree);
      reapplySequenceItemFields();
      machine.transition('playing');
      bus.emit('play.start');
      doc.body.classList.remove('cg-pending');
      // D-105 — clear any out()/stop() exit styling so a fresh play shows the
      // content again, and supersede an in-flight out() fade.
      exitGen += 1;
      pendingExitOutro = false;
      paused = false;
      restoreContent();
      machine.transition('on-air');
      // D-030 — repeaters re-stamp FIRST: the row COUNT comes from the
      // CURRENT effective items (a retained pre-play update() included),
      // and the fresh row subtrees join `subtrees` before the per-kind
      // resets below and the controller cascade — Set iteration visits
      // entries added mid-walk, so nested repeaters inside rows stamp too.
      for (const sub of subtrees) {
        for (const r of sub.repeaters) {
          r.reset();
          r.start();
        }
      }
      // D-028 — a fresh run restarts every crawl from its entering edge (the
      // controllers' first hold then starts the treadmills).
      for (const sub of subtrees) for (const t of sub.tickers) t.reset();
      // D-027 / D-104 follow-up — clocks reset to their initial value but do NOT
      // tick yet: like the ticker crawl and the sequence rotation, EVERY clock
      // (absolute wall / datetime-countdown AND relative count) is HELD through the
      // entrance and starts at the scope's CONTENT-START frame (the hold entry — the
      // content-start marker or its heuristic), so the marker gates all three content
      // kinds uniformly. `startOwnContent` (onContentStart) resets + starts them there.
      for (const sub of subtrees) for (const c of sub.clocks) c.reset();
      // D-029 — sequences reset to item 1, displayed statically through the
      // intro; advancing begins at hold entry (which resets + starts them).
      for (const sub of subtrees) for (const s of sub.sequences) s.reset();
      // Play the IN once and hold (no full-range loop, no auto-outro by default);
      // the mode orchestration (auto-out / loop-cycle / content-driven) then runs.
      // Absent lifecycle: the whole timeline is the entrance and the hold is its
      // last frame. D-026 — cascades to every nested instance's own controller.
      cascade(rootNode, (c) => c.play());
      bus.emit('play.end');
    },

    async update(data, opts: UpdateOptions = {}): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; update() unavailable');
      }
      const mode = opts.mode ?? 'merge';
      if (mode === 'replace') {
        currentValues = { ...(data as NestedFieldValues) };
      } else {
        currentValues = mergeNestedValues(currentValues, data as NestedFieldValues);
      }
      applyScopedFieldValues(scene, scene, currentValues, built.scopeTree);
      reapplySequenceItemFields();
      bus.emit('update');
    },

    async stop(_opts?: StopOptions): Promise<void> {
      if (machine.state === 'removed') return;
      if (machine.state !== 'on-air' && machine.state !== 'playing') return;
      // D-105 — QUICK exit: remove the content IMMEDIATELY (before the background
      // moves), then play the background outro and settle cleared. Lifecycle scenes
      // play the OUT [outPoint → active.out]; absent lifecycle settles instantly.
      // The controller drives onExitStart/onSettle (stop.start / stop.end + hide);
      // D-026 — each nested instance plays its OWN outro in cascade.
      exitGen += 1;
      pendingExitOutro = false;
      hideContentNow();
      playBackgroundOutroAndSettle();
    },

    async out(_opts?: StopOptions): Promise<void> {
      if (machine.state === 'removed') return;
      if (machine.state !== 'on-air' && machine.state !== 'playing') return;
      // D-105 — COORDINATED animated exit: fade the content off FIRST, await it,
      // then (unless a stop()/play()/out() superseded this exit during the fade)
      // play the background outro and settle cleared — the background never closes
      // over fully-visible content.
      const gen = ++exitGen;
      await fadeContentOut(OUT_FADE_MS);
      if (gen !== exitGen) return;
      if (machine.state !== 'on-air' && machine.state !== 'playing') return;
      if (paused) {
        // Paused mid-fade — defer the background outro until resume() so the
        // graphic does not close while paused.
        pendingExitOutro = true;
        return;
      }
      playBackgroundOutroAndSettle();
    },

    pause(): void {
      if (machine.state === 'removed') return;
      paused = true;
      cascade(rootNode, (c) => c.pause());
      // D-028/D-027/D-029 — freeze the crawls, clocks, and sequences (dwell
      // AND in-flight transitions) in lockstep with the frozen hold timers.
      for (const sub of subtrees) for (const t of sub.tickers) t.pause();
      for (const sub of subtrees) for (const c of sub.clocks) c.pause();
      for (const sub of subtrees) for (const s of sub.sequences) s.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      paused = false;
      cascade(rootNode, (c) => c.resume());
      for (const sub of subtrees) for (const t of sub.tickers) t.resume();
      for (const sub of subtrees) for (const c of sub.clocks) c.resume();
      for (const sub of subtrees) for (const s of sub.sequences) s.resume();
      // D-105 — finish an out() exit that was deferred because pause arrived mid-fade.
      if (pendingExitOutro) {
        pendingExitOutro = false;
        playBackgroundOutroAndSettle();
      }
    },

    async next(): Promise<void> {
      if (machine.state === 'removed') return;
      // D-029 — implemented for real: dispatch to every wired scope's
      // sequence drivers, resolving immediately (a pre-run or mid-transition
      // next() is each driver's own no-op). See dispatchNext for the D-031
      // steps-model seam.
      dispatchNext();
    },

    remove(): void {
      if (machine.state === 'removed') return;
      // Symmetric subtree teardown (controllers, then drivers — see
      // WiredSubtree.destroy). Copy first: destroy() deregisters itself.
      for (const sub of [...subtrees]) sub.destroy();
      machine.forceTransition('removed');
      bus.clear();
      built.container.remove();
      doc.body.classList.remove('cg-pending');
      doc.body.classList.add('cg-removed');
    },

    tick(frame: number): void {
      for (const entry of allAnimated) applyAnimationAtFrame(entry, frame);
      // D-030 — scrub parity: stamped repeater rows paint the same frame as
      // authored nested instances (their scopes aren't in the static
      // allAnimated list, so walk the live rows).
      for (const sub of subtrees) {
        for (const r of sub.repeaters) {
          for (const row of r.stampedRows) row.applyFrame(frame);
        }
      }
      applyLifespanGatesAtFrame(frame);
    },

    on(event, listener) {
      return bus.on(event, listener);
    },
  };

  return runtime;
}

interface LifespanGate {
  node: HTMLElement;
  lifespan: FrameRange;
  /** display value the scene-builder set, restored when entering range. */
  naturalDisplay: string;
}

function collectLifespanGates(scene: Scene, elementMap: Map<string, HTMLElement>): LifespanGate[] {
  const out: LifespanGate[] = [];
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      if (el.lifespan !== undefined) {
        const node = elementMap.get(el.id);
        if (node !== undefined) {
          out.push({ node, lifespan: el.lifespan, naturalDisplay: node.style.display });
        }
      }
      if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of scene.layers) walk(layer.children);
  return out;
}

function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.then(() => undefined);
}

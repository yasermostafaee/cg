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
import { applyAnimationAtFrame, type AnimatedElement } from './animation-applier.js';
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
  /** D-104 — composition-INSTANCE children only (NOT repeater rows), for content aggregation up the tree. */
  instanceChildren: ScopeNode[];
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
 * D-104 — `node`'s recursive content completion: its own content sources plus
 * every non-coordinator nested-composition descendant's (skipping nested
 * coordinators, which self-settle). null when nothing finite is coordinated (a
 * zero-length hold).
 */
function contentTreeWait(node: ScopeNode): Promise<void> | null {
  const waits: Promise<void>[] = [];
  const own = node.ownContentWait();
  if (own !== null) waits.push(own);
  for (const child of node.instanceChildren) {
    if (!child.isCoordinator) {
      const childWait = contentTreeWait(child);
      if (childWait !== null) waits.push(childWait);
    }
  }
  return waits.length > 0 ? Promise.all(waits).then(() => undefined) : null;
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
  const effectivePlayoutFor = (
    source: { playout?: Playout | undefined },
    path: string,
  ): Playout => {
    const b = playoutOf(source);
    const o = overrides[path];
    return {
      mode: o?.mode ?? b.mode,
      holdSource: o?.holdSource ?? b.holdSource,
      holdMs: o?.holdMs ?? b.holdMs,
      repeat: o?.repeat ?? b.repeat,
    };
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
      hasCoordinatorAncestor: boolean,
    ): ScopeNode => {
      const scopeOverride = overrides[path];
      // D-028 — one treadmill driver per ticker element, per scope (the same
      // child composition instanced twice gets two independent drivers).
      // Instantiated BEFORE the initial field application so a `list` field
      // default can already reconcile into its driver. The node→driver
      // registries are how the bindings applier routes `*-items` values.
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
        return driver;
      });
      // D-027 — clock drivers (no overrides and no bindings: no fields in v1).
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
        return driver;
      });
      // D-029 — sequence drivers; the host→driver registry routes
      // `sequence-items` bindings, and `runtime.next()` dispatches per scope.
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
        return driver;
      });

      // D-028/D-027/D-029 — this scope's OWN content completion from its CONTENT
      // SOURCES: every ticker, every countdown clock, and every sequence in the
      // scope. ALL tickers and sequences join the wait — an infinite one's
      // whenComplete() never resolves, which IS how it holds until stop(); only
      // the clock filter is by kind (wall/countup are excluded — not content
      // sources). No own content sources ⇒ null.
      const scopeCountdowns = scopeClocks.filter((c) => c.mode === 'countdown');
      const hasOwnContent =
        scopeTickers.length > 0 || scopeClocks.length > 0 || scopeSequences.length > 0;
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
        scopeTickers.length > 0 || scopeCountdowns.length > 0 || scopeSequences.length > 0
          ? Promise.all([
              ...scopeTickers.map((t) => t.whenComplete()),
              ...scopeCountdowns.map((c) => c.whenComplete()),
              ...scopeSequences.map((s) => s.whenComplete()),
            ]).then(() => undefined)
          : null;
      const stopScopeContent = (): void => {
        for (const t of scopeTickers) t.stop();
        for (const c of scopeClocks) c.stop();
        for (const s of scopeSequences) s.stop();
      };
      const effPlayout = effectivePlayoutFor(scope.source, path);
      const isGlobalRoot = isSubtreeRoot && isRootSubtree;
      // D-104 — a "coordinator" is a content-driven (non-manual) scope: at its
      // hold entry it starts + awaits its OWN content PLUS its non-coordinator
      // nested descendants' content (a content-driven nested comp self-settles and
      // is skipped, preserving its own per-scope hold). A non-coordinator under a
      // coordinator ancestor does NOT self-start its content (the ancestor drives
      // it at the parent's hold entry); with no coordinator ancestor it keeps the
      // old per-scope start behavior. An EXPLICIT boot `contentHold` still wins for
      // the ROOT scope (external override / test seam).
      const isCoordinator =
        effPlayout.mode !== 'manual' && effPlayout.holdSource === 'content-driven';
      // Build the nested composition-instance children FIRST (they don't depend on
      // this scope's controller), so the content closures below can close over them
      // without a forward reference. Each child's path appends its instance name to
      // the parent's dotted path (root = ''): '' → 'home' → 'home.inner' — the key
      // `effectivePlayoutFor`/`scopeOverrides` use to target one scope's timing.
      // D-104 — propagate coordinator coverage down the tree.
      const instanceChildren = scope.children.map((c) =>
        wireScope(
          c.scope,
          path === '' ? c.name : `${path}.${c.name}`,
          false,
          hasCoordinatorAncestor || isCoordinator,
        ),
      );
      const controller = new PlayoutController({
        frameRate: scene.frameRate,
        active: activeRangeOf(scope.source),
        lifecycle: scope.source.lifecycle,
        playout: effPlayout,
        hasAnimation: scope.animated.length > 0,
        applyFrame: (frame: number): void => {
          for (const entry of scope.animated) applyAnimationAtFrame(entry, frame);
          // B-029 — honor per-element lifespan during PLAYBACK, not only the scrubber, so a
          // start-trimmed (lifespan.in > 0) element appears at its in-point + plays instead
          // of staying hidden / being dropped. Root-scene gates ride the root playhead.
          if (isGlobalRoot) applyLifespanGatesAtFrame(frame);
        },
        onExitStart: isGlobalRoot ? rootOnExitStart : noop,
        onSettle: isGlobalRoot
          ? (): void => {
              onRootSettled();
            }
          : stopScopeContent,
        // The content closures run at hold entry (post-play); they aggregate THIS
        // scope's own content with its non-coordinator nested descendants' (a nested
        // coordinator self-settles, so it is skipped) via the module helpers.
        waitForContent: isCoordinator
          ? (): Promise<void> | null => {
              if (isGlobalRoot && options.contentHold !== undefined) return options.contentHold();
              const waits: Promise<void>[] = [];
              const own = ownContentWait();
              if (own !== null) waits.push(own);
              for (const child of instanceChildren) {
                if (!child.isCoordinator) {
                  const childWait = contentTreeWait(child);
                  if (childWait !== null) waits.push(childWait);
                }
              }
              return waits.length > 0 ? Promise.all(waits).then(() => undefined) : null;
            }
          : undefined,
        onHoldStart: isCoordinator
          ? (): void => {
              startOwnContent();
              for (const child of instanceChildren) {
                if (!child.isCoordinator) startContentTree(child);
              }
            }
          : hasOwnContent && !hasCoordinatorAncestor
            ? startOwnContent
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
        instanceChildren,
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
      // D-027 — clocks reset to their initial value; ABSOLUTE clocks (wall,
      // datetime countdown) start now so they tick during the intro, while
      // relative counts display their initial value until their hold-entry
      // run begins (the hold entry resets + starts every scope clock).
      for (const sub of subtrees) {
        for (const c of sub.clocks) {
          c.reset();
          if (c.isAbsolute) c.start();
        }
      }
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
      playBackgroundOutroAndSettle();
    },

    pause(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.pause());
      // D-028/D-027/D-029 — freeze the crawls, clocks, and sequences (dwell
      // AND in-flight transitions) in lockstep with the frozen hold timers.
      for (const sub of subtrees) for (const t of sub.tickers) t.pause();
      for (const sub of subtrees) for (const c of sub.clocks) c.pause();
      for (const sub of subtrees) for (const s of sub.sequences) s.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.resume());
      for (const sub of subtrees) for (const t of sub.tickers) t.resume();
      for (const sub of subtrees) for (const c of sub.clocks) c.resume();
      for (const sub of subtrees) for (const s of sub.sequences) s.resume();
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

import {
  activeRangeOf,
  followsComposition,
  followWindowMs,
  videoFollowClipFacts,
  listBoundSequenceIds,
  migrateScenePaths,
  playoutOf,
  sequenceItemInstanceId,
  sequenceItemTextFieldIds,
  type ClockTarget,
  type FollowAnchors,
  type FrameRange,
  type ListItem,
  type NestedFieldValues,
  type Playout,
  type Scene,
  sceneMaskHoles,
  type ArrangementView,
} from '@cg/shared-schema';
import {
  applyAnimationAtFrame,
  entranceSettleFrame,
  type AnimatedElement,
} from './animation-applier.js';
import { applyScopedFieldValues, isNamespace, type FieldDocLite } from './bindings.js';
import { applyArrangementToNodes, liveArrangementView } from './arrangement-view.js';
import { repunchLiveSourceHoles } from './live-source-punch.js';

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
import { ensureZoneCss } from './zone-css.js';
import { EventBus } from './event-bus.js';
import { LifecycleStateMachine } from './lifecycle.js';
import { PlayoutController } from './playout-controller.js';
import {
  buildRepeaterRows,
  buildScene,
  buildSequenceCompositionItem,
  repeaterItemValues,
} from './scene-builder.js';
import {
  createLottiePlayer,
  lottieClipMeta,
  lottieClipMidpoint,
  lottieFollowWindow,
  lottieTiming,
} from '@cg/lottie-bridge';
import { registerLottiePlayer } from './lottie-registry.js';
import { ClockDriver, parseTimeOfDay } from './clock-driver.js';
import { LottieDriver } from './lottie-driver.js';
import { VideoDriver, type VideoHandle, type ElementOutroDriver } from './video-driver.js';
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
  ElementTimingOverrides,
  FieldScope,
  LifespanGateEntry,
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
   * D-125 §D7 — this scope's OWN element-outro drivers: the `LottieDriver`s that own a real
   * outro segment and are VISIBLE. `out()`/`stop()` await these before the background outro
   * (see `collectElementOutros`).
   *
   * B-034 — the `visible: false` HARD GATE is applied HERE, where the list is BUILT, so a
   * hidden Lottie can never be resurrected by a parent override; hidden ANCESTORS are handled
   * by the `visible` skip in the collection walk.
   */
  // D-128 — holds BOTH Lottie and Video outro drivers (the shared element-outro
  // seam); typed to the common `ElementOutroDriver` so ONE ledger serves both.
  outroLotties: readonly ElementOutroDriver[];
  /**
   * B-031 — resolves when THIS scope's controller SETTLES (after its own outro). A
   * content-driven parent waits on a nested CONTENT-DRIVEN (coordinator) child's settle,
   * so a content-driven nested composition DRIVES the parent's hold while still
   * self-settling (its own outro) — the staggered content-first / background-last exit.
   */
  whenSettled: () => Promise<void>;
  /** B-033 — re-arm this scope's self-settle deferred for a fresh run, so a REPLAY's content-driven hold waits again. */
  resetSettled: () => void;
  /**
   * B-034 — the instance's own `visible` (root = true). A HIDDEN instance's whole subtree is inert:
   * the parent's `aggregateContentWait` + content-start skip it, so a visible content driver INSIDE a
   * hidden instance can't keep the parent open. Set by the parent from its `FieldScopeChild`.
   */
  visible: boolean;
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
    // B-034 — a HIDDEN instance's subtree is inert: don't start its content (it never drives the hold
    // and is display:none), mirroring render. The whole subtree is skipped at the hidden boundary.
    if (child.visible && !child.isCoordinator) startContentTree(child);
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
    // B-034 — a HIDDEN instance's whole subtree is inert: it contributes NOTHING to the parent's hold
    // (mirrors render's display:none), so a visible infinite driver inside a hidden instance can't keep
    // the parent open. Skip BEFORE descending — neither its settle nor its content gates the hold.
    if (!child.visible) continue;
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
  // B-034 — a HIDDEN content element (`visible: false`) is never an effective driver, regardless of
  // `drivesHold` / `holdOverrides` (a comp whose only content is hidden has no drivers ⇒ B-032 timed).
  const drives = (el: {
    id: string;
    drivesHold?: boolean | undefined;
    visible?: boolean;
  }): boolean => el.visible !== false && (overrides?.[el.id] ?? el.drivesHold !== false);
  for (const t of scope.tickers) if (drives(t.element)) return true;
  for (const c of scope.clocks)
    if (c.element.mode === 'countdown' && drives(c.element)) return true;
  for (const sq of scope.sequences) if (drives(sq.element)) return true;
  // D-125 §D2.1 — a Lottie is a driver ONLY when it OPTED IN (`=== true`, the INVERSE
  // default), so it can't be folded into `drives()` above. Without this a composition
  // whose only hold driver is an opted-in Lottie would fall back to `timed` (B-032) and
  // never wait for its intro. B-034 — a hidden Lottie is never a driver.
  for (const l of scope.lotties)
    if (l.element.visible !== false && (overrides?.[l.element.id] ?? l.element.drivesHold === true))
      return true;
  // D-128 — a video is an effective hold driver only when it OPTED IN (`=== true`),
  // same inverse default as the Lottie; a hidden video is never a driver (B-034).
  for (const v of scope.videos)
    if (v.element.visible !== false && (overrides?.[v.element.id] ?? v.element.drivesHold === true))
      return true;
  for (const child of scope.children)
    // B-034 — a HIDDEN instance's whole subtree is inert: don't descend (so a content-driven comp
    // whose only drivers live inside hidden instances resolves to timed, matching the runtime hold).
    if (child.visible !== false && scopeHasEffectiveHoldDrivers(child.scope, child.holdOverrides))
      return true;
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
  /**
   * B-089 — the scope this subtree wires. The wiring tree is the ONLY membership that
   * includes stamped scopes (`scope.children` excludes them by design), so it is what the
   * designer scrubber walks to gate every trimmed element — static or stamped.
   */
  scope: FieldScope;
  tickers: TickerDriver[];
  clocks: ClockDriver[];
  sequences: SequenceDriver[];
  repeaters: RepeaterDriver[];
  /** D-125 — Lottie drivers of this subtree (driven-frame players). */
  lotties: LottieDriver[];
  /** D-128 — Video drivers of this subtree (self-clocked media players). */
  videos: VideoDriver[];
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
 *
 * D-128 Phase 5 — widened to `<video data-cg-asset-id>`: the exported page
 * (`.vcg` index.html with a packaged relative path, single-file HTML with a
 * base64 `data:video/webm` URI) wires the video source through the SAME map,
 * so a video element plays on air with zero external requests. The Designer
 * preview still wires video src itself (preview.ts owns the poster ladder).
 */
function applyAssetUrls(
  container: HTMLElement,
  assetUrls?: Readonly<Record<string, string>>,
): void {
  if (assetUrls === undefined) return;
  const nodes = container.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
    'img[data-cg-asset-id], video[data-cg-asset-id]',
  );
  nodes.forEach((node) => {
    const id = node.dataset['cgAssetId'];
    if (id === undefined) return;
    const url = assetUrls[id];
    if (url !== undefined && url !== '') node.src = url;
  });
}

/**
 * B-088 + D-125 Phase 3a — compose the two independent reasons an intro/outro leg must be
 * SWEPT frame-by-frame instead of collapsing to a single end-frame paint:
 *
 *  - a `lifespan` GATE boundary crossing the leg (B-088; B-089 extended it from the root
 *    scope to EVERY scope, once each scope gained its own gates);
 *  - a LOTTIE-derived entrance settle (D-125 Phase 3a, ANY scope): the leg that ends at the
 *    settle must consume its real duration so content starts when the furniture has settled,
 *    not at play. The later legs (static settle, outro) end AFTER the settle and still
 *    collapse.
 *
 * Returns `undefined` when neither applies, preserving the exact prior behaviour (and the
 * `?? false` default) for every scene without lifespan gates or a phase-marked Lottie.
 */
function buildNeedsFrameSweep(
  lifespanGateChangesInRange: ((inF: number, outF: number) => boolean) | undefined,
  lottieSettle: number | null,
): ((inF: number, outF: number) => boolean) | undefined {
  if (lifespanGateChangesInRange === undefined && lottieSettle === null) return undefined;
  return (inF: number, outF: number): boolean =>
    (lifespanGateChangesInRange?.(inF, outF) ?? false) ||
    (lottieSettle !== null && outF > inF && outF <= lottieSettle);
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

  // B-059/B-062 — legacy paths (pre size==visualBBox convention) are migrated
  // IN MEMORY at ingestion, so old `.vcg` packages render pixel-identically under
  // the new viewBox mapping without touching the signed package. Identity for
  // conforming scenes (the Designer migrates at load, so its streams are no-ops).
  scene = migrateScenePaths(scene);

  // D-141 — compile this scene's colour zones into `<style id="cg-zones">`, beside
  // the baseline block. Emitted from the SCENE by the runtime, which is what makes
  // preview/export parity structural: the single-file export embeds the scene and
  // boots this same code, so both carry byte-identical rules and neither exporter
  // needs a zone code path. A scene with no zone overrides injects nothing.
  // Runs AFTER the path migration so the compiler and the builder see one object.
  // D-137 §9 — the render mode, named once and threaded to BOTH consumers (the
  // zone compiler and the builder). Absent ⇒ `'output'`: a forgotten boot site
  // paints nothing, which is the safe direction on air. See `RenderMode`.
  const mode = options.mode ?? 'output';
  // B-134 — the editor backdrop paints on the editing CANVAS only. A second axis
  // rather than a third `RenderMode`, because the Preview modal wants `'author'` for
  // Live Sources and `false` here at the same time. Absent ⇒ true, which is a no-op
  // in `'output'` (the backdrop is never painted there anyway).
  const paintEditorBackdrop = options.paintEditorBackdrop ?? true;

  const zoneCss = ensureZoneCss(scene, doc, mode);
  for (const warning of zoneCss.warnings) {
    // A build-time drop (an unescapable key, a clash) degrades the styling, never
    // the render — reported, never thrown.
    console.warn(`[cg] zone stylesheet: ${warning}`);
  }

  const built = buildScene(scene, doc, mode, paintEditorBackdrop);
  root.appendChild(built.container);

  /**
   * ⭐ **`multibox-layout-switch` `tasks.md` 4.3 — UNIT B′'s re-punch pass.**
   *
   * The mask used to be computed ONCE, at build, and nothing recomputed it — which is the
   * whole of UNIT B′: every mutator in `design.md` §6b's table moves or removes a plate, and
   * the hole stayed where the plate used to be. A hole with no plate behind it is not a
   * cosmetic defect; it is the backdrop punched through to nothing, i.e. BLACK on air, in
   * the shape of a box that has gone.
   *
   * It reassigns the mask properties on the nodes that are already there (§6: the mask is
   * inline CSS on a live node), so nothing the page is holding — a playing animation, a
   * `<video>`'s decode position, a sequence's dwell, the operator's field values — is lost
   * to keeping the mask honest.
   */
  /**
   * 🔴 **NO DEFAULT PARAMETER — and that is a fix, not a style choice.**
   *
   * This read `(view = arrangementView)`, which meant `repunch(undefined)` — exactly what
   * `setArrangementView(undefined)` does for the Designer's "As authored" — fell into the
   * default and RE-APPLIED the previous arrangement instead of clearing it. Switching back to
   * "As authored" left every box parked at the last arrangement's cells. `undefined` is a
   * MEANINGFUL value here ("no arrangement"), so it must never be a stand-in for "not passed".
   */
  const repunch = (view: ArrangementView | undefined): void => {
    // 🔴 MOVE THE BOXES FIRST, then re-punch. Both halves are needed and the order is
    // load-bearing: `liveArrangementView` reads the page's CURRENT layout back, so the mask
    // is computed against where the nodes now ARE rather than where the view said to put
    // them — one source of truth for the geometry, which is the same rule that keeps the
    // hole the page punches and the hole the bridge fills a single computation.
    applyArrangementToNodes(scene, built.elementMap, view, arrangementView);
    arrangementView = view;
    const live = liveArrangementView(scene, built.elementMap, view);
    repunchLiveSourceHoles(built.punchTargets, sceneMaskHoles(scene, live));
  };
  let arrangementView: ArrangementView | undefined;

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

  // B-029 — per-element lifespan visibility, evaluated at a given frame, for EVERY scope
  // at once. Used by the designer scrubber's `tick`, which paints one shared frame across
  // the whole tree (like `allAnimated`). Playback does NOT go through this: each scope's
  // controller applies its OWN gates along its own timeline (B-089) — see
  // `applyScopeLifespanGatesAtFrame`. Late-bound because the gates' natural display is
  // snapshotted after the scene builds, while the controllers are wired before that.
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
   *
   * D-102 Phase 2 — `inheritedTiming` carries the HOST scope's per-element timing maps into a
   * STAMPED subtree (a repeater row / a sequence composition item). Those subtrees are wired under
   * a synthetic path (`…#<elementId>[i]`) that no `scopeOverrides` key addresses, and every stamped
   * row is built from the SAME authored element (the same element id) — so the authored element's
   * override reaches each stamp's own driver only by inheriting the map. ONLY the element maps are
   * inherited: the per-scope LIFECYCLE axes are not, so a row keeps its own independent lifecycle.
   */
  /**
   * D-141 — per-SCOPE `elementId → ClockDriver`, so a `clock-target` binding
   * re-aims the right instance's clock when one child composition is instanced
   * twice (the D-025 namespace rule, applied to a driver instead of a DOM node).
   * A WeakMap keyed by the scope object, so a re-stamped subtree's entries go with
   * it rather than accumulating.
   */
  const clockDriversByScope = new WeakMap<FieldScope, Map<string, ClockDriver>>();

  const wireScopeSubtree = (
    subtreeScope: FieldScope,
    subtreePath: string,
    isRootSubtree: boolean,
    inheritedTiming?: ElementTimingOverrides,
  ): WiredSubtree => {
    const tickers: TickerDriver[] = [];
    const clocks: ClockDriver[] = [];
    const sequences: SequenceDriver[] = [];
    const repeaters: RepeaterDriver[] = [];
    const lotties: LottieDriver[] = [];
    const videos: VideoDriver[] = [];
    const controllers: PlayoutController[] = [];

    const wireScope = (
      scope: FieldScope,
      path: string,
      isSubtreeRoot: boolean,
      hasContentDrivingAncestor: boolean,
    ): ScopeNode => {
      const scopeOverride = overrides[path];
      // D-102 — this scope's PER-ELEMENT timing maps: its own scope override, layered over any
      // inherited (stamped-subtree) map. An element id is unique within the scene, so the merge is
      // unambiguous; the scope's own entry wins where both address the same element.
      const elementTiming: ElementTimingOverrides = {
        tickers: { ...inheritedTiming?.tickers, ...scopeOverride?.tickers },
        sequences: { ...inheritedTiming?.sequences, ...scopeOverride?.sequences },
        countdowns: { ...inheritedTiming?.countdowns, ...scopeOverride?.countdowns },
      };
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
        // are tuned independently; each maps to its OWN driver here. D-102 Phase 2 — for a
        // repeater-stamped row the map is INHERITED from the host scope, so the authored (template)
        // ticker's override reaches every stamp's own driver.
        const tickerOverride = elementTiming.tickers?.[t.element.id];
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
        // B-034 — a HIDDEN content element (`visible: false`) is fully inert: it NEVER drives the
        // hold (its own or a parent's, regardless of `drivesHold` / `holdOverrides`), so it is
        // excluded from BOTH the own-hold array AND `contentDrivers` (no override can force it in).
        if (t.element.visible !== false) {
          // D-107 — joins the hold wait unless explicitly excluded.
          if (t.element.drivesHold !== false) holdTickers.push(driver);
          // D-112 — exposed UNFILTERED so a parent instance override can re-filter it.
          contentDrivers.push({
            id: t.element.id,
            drivesHold: t.element.drivesHold !== false,
            whenComplete: () => driver.whenComplete(),
          });
        }
        return driver;
      });
      // D-027 — clock drivers (no bindings: no fields in v1). D-102 Phase 2 — a COUNTDOWN takes a
      // session-only per-element duration override: it REPLACES the authored target (a duration OR
      // an absolute datetime deadline) with a duration target for this run, which is the only way to
      // rehearse a countdown to a wall-clock time. `wall`/`countup` never complete — no timing to
      // tune, so they are never overridden (and never listed in the preview panel).
      const holdCountdowns: ClockDriver[] = [];
      // D-141 — this scope's clock drivers by element id (the `clock-target` route).
      const scopeClockDrivers = new Map<string, ClockDriver>();
      clockDriversByScope.set(scope, scopeClockDrivers);
      const scopeClocks = scope.clocks.map((c) => {
        const durationOverride =
          c.element.mode === 'countdown'
            ? elementTiming.countdowns?.[c.element.id]?.durationMs
            : undefined;
        const effTarget: ClockTarget | undefined =
          durationOverride !== undefined
            ? { kind: 'duration', ms: durationOverride }
            : c.element.target;
        const driver = new ClockDriver({
          node: c.node,
          mode: c.element.mode,
          format: c.element.format,
          digits: c.element.digits,
          target: effTarget,
          timezone: c.element.timezone,
          blinkColon: c.element.blinkColon,
          blinkPeriodMs: c.element.blinkPeriodMs,
          // D-141 — the countdown's colour zones, published on THIS scope's own
          // container. `FieldScope.container` is the root stage for the scene and
          // the `.cg-comp-inner` div for a nested instance, which is exactly the
          // scope-root granularity nearest-wins resolves at: a nested instance with
          // its own zoned countdown governs its own subtree, one without stays
          // transparent to its host's zone. The driver ignores zones for
          // `wall`/`countup` (the schema refuses to author them there at all).
          zones: c.element.zones,
          zoneRoot: scope.container,
          clock: options.clock,
        });
        scopeClockDrivers.set(c.element.id, driver);
        // D-105 — mark the content root for the coordinated exit (out/stop).
        c.node.dataset['cgContent'] = 'clock';
        // D-102 Phase 2 — stamp the EFFECTIVE (post-override) countdown duration so the operator
        // (and the tests) can see what each countdown is actually counting down this session. Only
        // a duration target has an ms value; a datetime deadline carries none.
        if (c.element.mode === 'countdown' && effTarget?.kind === 'duration') {
          c.node.dataset['cgCountdownMs'] = String(effTarget.ms);
        }
        clocks.push(driver);
        // D-107 — only a COUNTDOWN drives the hold (wall/countup never complete), and only
        // when not explicitly excluded. D-112 — a countdown is also exposed UNFILTERED.
        // B-034 — a HIDDEN countdown is fully inert (never drives the hold).
        if (c.element.mode === 'countdown' && c.element.visible !== false) {
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
        // D-102 Phase 2 — the session override is PER-ELEMENT (keyed by the sequence's element id),
        // so two sequences in one scope are tuned independently; each maps to its OWN driver. The
        // dwell override wins over every authored dwell (see `dwellOverrideMs`).
        const seqOverride = elementTiming.sequences?.[s.element.id];
        const effSeqRepeat = seqOverride?.repeat ?? s.element.repeat;
        const effDwellMs = seqOverride?.dwellMs;
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
            mode,
            paintEditorBackdrop,
          );
          if (built === null) {
            // Missing / over-deep / cyclic reference ⇒ an empty grid-cell box.
            const empty = doc.createElement('div');
            empty.style.gridArea = '1 / 1';
            const noop = (): void => undefined;
            return { node: empty, show: noop, pause: noop, resume: noop, hide: noop };
          }
          // D-102 Phase 2 — a sequence composition item is a STAMPED subtree (a synthetic path no
          // scope override addresses): it inherits this scope's per-element timing maps, so an
          // authored element's preview override reaches the drivers built inside the item.
          const itemSub = wireScopeSubtree(
            built.scope,
            `${path}#${s.element.id}:item:${item.id}`,
            false,
            elementTiming,
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
          dwellOverrideMs: effDwellMs,
          advance: s.element.advance,
          transitionIn: s.element.transitionIn,
          transitionOut: s.element.transitionOut,
          transitionTiming: s.element.transitionTiming,
          transitionMs: s.element.transitionMs,
          repeat: effSeqRepeat,
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
        // D-102 Phase 2 — stamp the EFFECTIVE (post-override) timing on the host so the operator
        // (and the tests) can see which passes/dwell each sequence is actually running this session.
        s.host.dataset['cgSequenceRepeat'] = String(effSeqRepeat);
        s.host.dataset['cgSequenceDwell'] = String(effDwellMs ?? s.element.defaultDwellMs);
        sequences.push(driver);
        // B-034 — a HIDDEN sequence is fully inert (never drives the hold, own or via an override).
        if (s.element.visible !== false) {
          // D-107 — joins the hold wait unless explicitly excluded.
          if (s.element.drivesHold !== false) holdSequences.push(driver);
          // D-112 — exposed UNFILTERED so a parent instance override can re-filter it.
          contentDrivers.push({
            id: s.element.id,
            drivesHold: s.element.drivesHold !== false,
            whenComplete: () => driver.whenComplete(),
          });
        }
        return driver;
      });

      // D-125 — Lottie drivers. The scene-builder registered the mount container; here
      // we resolve the parsed `animationData` from `options.lottieAssets`, mount the
      // `lottie_light` player (`autoplay: false` — the driver owns the playhead), and
      // drive it frame-by-frame off the injected clock. An UNRESOLVED asset ⇒ no driver
      // (the container renders empty, like an image whose bytes did not resolve).
      // D-125 PHASE 2 — the full IN/HOLD/OUT lifecycle: the driver contributes
      // `whenComplete()` to the content-driven hold when it OPTS IN (`drivesHold === true`)
      // and registers in `scopeOutroLotties` for the element-outro seam (§D6.2).
      const scopeLotties: LottieDriver[] = [];
      // D-128 — the shared element-outro array for THIS scope: Lottie AND Video
      // outro drivers both register here (§D6.2), keyed identically in the one ledger.
      const scopeOutroLotties: ElementOutroDriver[] = [];
      /** §D6.3 — only the Lotties that OPTED IN (`drivesHold === true`) gate this hold. */
      const holdLotties: LottieDriver[] = [];
      // D-128 — this scope's Video drivers (all, for the cascades) + the opted-in
      // subset that gates the hold (mirrors scopeLotties / holdLotties).
      const scopeVideos: VideoDriver[] = [];
      const holdVideos: VideoDriver[] = [];
      /**
       * D-125 Phase 3a — each VISIBLE, phase-marked Lottie's intro completion, in COMPOSITION
       * frames OFFSET from `active.in` (the frame the Lottie's intro starts — `play()` resets +
       * starts every Lottie, see the play path). Fed to `entranceSettleFrame` below so the
       * furniture's intro derives the scope's entrance settle exactly like keyframe tracks do.
       *
       * media-phases-follow-composition — computed as a PRE-PASS (it used to live inside the
       * driver loop) because a FOLLOW-source element's window needs the EFFECTIVE content
       * start at driver construction, and that value aggregates every settle first. A
       * follower is fed the marker-less shape (`phases: undefined`) ON PURPOSE — it derives
       * FROM the effective content start, so it must not vote on it. That is EXACTLY the
       * existing marker-less null rule ("the ABSENCE of information, not an authored claim"),
       * reused rather than re-derived: no new branch in the aggregation.
       */
      const lottieSettleOffsets: number[] = [];
      for (const l of scope.lotties) {
        const data = options.lottieAssets?.[l.element.assetId];
        // Mirrors the driver loop's gates below: an unresolved asset builds no driver, and a
        // HIDDEN Lottie is fully inert (B-034) — neither contributes a settle.
        if (data === undefined || l.element.visible === false) continue;
        const timing = lottieTiming({
          data,
          speed: l.element.speed,
          phases: followsComposition(l.element.phases) ? undefined : l.element.phases,
          compositionFps: scene.frameRate,
        });
        if (timing.settleOffset !== null) lottieSettleOffsets.push(timing.settleOffset);
      }
      // D-104 follow-up — the frame where content starts: the designer's EXPLICIT
      // content-start marker (`lifecycle.contentStart`) when placed, else the
      // `entranceSettleFrame()` heuristic (entrance completion). The marker is the
      // deterministic source of truth; the heuristic is only its default. Clamp to
      // [active.in, outPoint] defensively (the schema already constrains it).
      // (Hoisted above the media driver loops for media-phases-follow-composition: a
      // follower's window is derived FROM these anchors at driver construction. ONE
      // computation — the hold-entry wiring below reads these same consts.)
      const activeRange = activeRangeOf(scope.source);
      const outPoint = scope.source.lifecycle?.outPoint ?? activeRange.out;
      const marker = scope.source.lifecycle?.contentStart;
      // D-125 Phase 3a — the Lottie-derived settles in ABSOLUTE composition frames (the
      // offsets above ride `active.in`, where their intros start).
      const lottieSettles = lottieSettleOffsets.map((o) => activeRange.in + o);
      const holdEntry =
        marker !== undefined
          ? Math.max(activeRange.in, Math.min(outPoint, marker))
          : entranceSettleFrame(scope.animated, activeRange.in, outPoint, lottieSettles);
      // media-phases-follow-composition — the comp-side anchors a FOLLOW-source element
      // derives its window from. `null` when the composition has no lifecycle: there is
      // nothing to follow, and the follower behaves as marker-less (the Inspector says why).
      const followAnchors: FollowAnchors | null =
        scope.source.lifecycle !== undefined
          ? {
              activeIn: activeRange.in,
              contentStart: holdEntry,
              outPoint,
              activeOut: activeRange.out,
              fps: scene.frameRate,
            }
          : null;
      for (const l of scope.lotties) {
        const data = options.lottieAssets?.[l.element.assetId];
        if (data === undefined) continue;
        const meta = lottieClipMeta(data);
        const handle = createLottiePlayer(l.container, data, {
          autoplay: false,
          speed: l.element.speed,
        });
        // D-125 Phase 3c — expose the mounted player to the binding path, so a
        // `lottie-override` field routes to this animation (mirrors tickerDriverFor).
        registerLottiePlayer(l.container, handle);
        // media-phases-follow-composition — resolve the phase WINDOW. Three shapes:
        //  - markers/manual: the shipped mapping (the window is the clip's own [ip, op]);
        //  - follow + lifecycle: the DERIVED window (`lottieFollowWindow` — the one
        //    derivation, anchored at the hold time H);
        //  - follow + NO lifecycle: nothing to follow — marker-less behaviour exactly
        //    (a follower's stored numbers are ignored either way; the Inspector says why).
        const follows = followsComposition(l.element.phases);
        // Session Y — the adapter now takes the WHOLE phases block: authored
        // `introEnd`/`outroStart` (real markers, or manual values) WIN, the attach seed
        // signature derives as if absent, and the outro is the clip's own ending.
        const fw =
          follows && followAnchors !== null
            ? lottieFollowWindow(meta, l.element.speed, followAnchors, l.element.phases)
            : null;
        const phasesEff = follows ? undefined : l.element.phases;
        // Resolve the phase frames onto the animation's frame space: absent `phases`
        // ⇒ the whole clip is the intro, held (frozen) at `op`. The idle segment
        // defaults to the hold window `[introEnd, outroStart]` (§D2.2) — except under
        // follow, where an AUTHORED idle range composes with H and an ABSENT one means
        // FREEZE (a zero span, the driver's own fallback): the derived hold is H's look,
        // and the stored [introEnd, outroStart] must not smuggle a loop range back in.
        const introStart = fw?.introStartFrame;
        const introEnd = fw !== null ? fw.holdFrame : (phasesEff?.introEnd ?? meta.op);
        const idleIn =
          fw !== null
            ? (l.element.phases?.idle?.[0] ?? fw.holdFrame)
            : (phasesEff?.idle?.[0] ?? introEnd);
        const idleOut =
          fw !== null
            ? (l.element.phases?.idle?.[1] ?? fw.holdFrame)
            : (phasesEff?.idle?.[1] ?? phasesEff?.outroStart ?? meta.op);
        // §D1 — the OUT phase maps to `[outroStart → outroEnd]` in ANIMATION frames, BY
        // PHASE (never rescaled onto the composition's `outPoint`): the element owns its
        // own outro timing at the authored speed. Absent `phases` ⇒ `outroStart = op` ⇒ a
        // DEGENERATE outro, which `playOutro()` resolves immediately (§D6.4.1). Under
        // follow (session Y) the outro is THE CLIP'S OWN ENDING — authored
        // `[outroStart → op]`, or end-anchored `[op − outSpan → op]` — never the
        // hold-anchored static middle the superseded rule played.
        const outroStart = fw !== null ? fw.outroStartFrame : (phasesEff?.outroStart ?? meta.op);
        const outroEnd = fw?.outroEndFrame;
        const hasOutro = fw !== null ? fw.window.hasOutro : outroStart < meta.op;
        // D-125 — the STATIC canvas poster frame. When phase markers define the hold
        // start (`introEnd`, fully ON) park there. ABSENT markers `introEnd` fell back to
        // `op` (the LAST frame): for a real AE furniture clip that animates OFF in its
        // outro, `op` is the outro-END (invisible), so parking there leaves the editor
        // canvas EMPTY (the bug). The clip MIDPOINT sits in the held/visible region, so it
        // is the representative "settled" look; never `op`. Only the poster frame — the
        // always-revealed canvas — changes; play() still resets()→the window start.
        // D-135 — the midpoint comes from `@cg/lottie-bridge`, which is also where the
        // Designer's manual-phase SEED reads it. One definition: if the two drifted,
        // converting a marker-less clip to manual phases would move its picture.
        // Under follow the poster IS the derived H — the held look, by definition.
        const posterFrame =
          fw !== null ? fw.holdFrame : (phasesEff?.introEnd ?? lottieClipMidpoint(meta));
        const driver = new LottieDriver({
          handle,
          fr: meta.fr,
          ip: meta.ip,
          op: meta.op,
          speed: l.element.speed,
          introStart,
          introDelayMs: fw?.introDelayMs,
          introEnd,
          outroStart,
          outroEnd,
          // D-135 — the SAME `hasOutro` the `cgOutro` guard and the scope's outro ledger
          // read, computed once above. The driver needs it to know that a degenerate
          // outro takes the INTRO mapping past the composition's out-point.
          hasOutro,
          idleIn,
          idleOut,
          holdBehavior: l.element.holdBehavior,
          posterFrame,
          clock: options.clock,
        });
        // D-125 — paint a REPRESENTATIVE, VISIBLE static frame (`posterFrame`), NOT an END
        // frame: the editor canvas is a static design surface that never plays, and a
        // furniture clip is blank at BOTH `ip` (intro-start) and `op` (outro-end). On
        // play() the lotties reset()→`ip` and play the intro from the start, and the
        // exported/on-air stage stays blank (cg-pending) until then, so this only affects
        // the always-revealed editor canvas.
        driver.poster();
        scopeLotties.push(driver);
        lotties.push(driver);
        // D-105 — mark the content root so the coordinated exit can select it.
        l.container.dataset['cgContent'] = 'lottie';
        // §D6.2 — a Lottie that OWNS an outro animates ITSELF off; guard it from the
        // blanket `fadeContentOut` / `hideContentNow` so an opacity transition doesn't
        // fight the driver's `goToAndStop`. A DEGENERATE-outro Lottie has no self-exit,
        // so it keeps the normal content fade/hide (nothing to fight).
        if (hasOutro) l.container.dataset['cgOutro'] = '1';
        // B-034 — a HIDDEN Lottie is FULLY INERT. The hard gate is applied HERE, where the
        // collections are BUILT, so no parent `holdOverrides` can resurrect it: it never
        // gates a hold, and `out()`/`stop()` never await its outro (a hidden element must
        // not stall the exit by its outro duration for something nobody can see).
        if (l.element.visible !== false) {
          // D-125 §D2.1 — `drivesHold` is read as `=== true` (OPT-IN), and NEVER as
          // `!== false`. This is the INVERSE of the ticker / clock / sequence default
          // (absent ⇒ participates): an absent flag here means the Lottie does NOT gate the
          // hold — a ticker on top drives it and the furniture holds beneath. Load-bearing
          // one-liner; do not "normalize" it to match the other content kinds.
          const drivesHold = l.element.drivesHold === true;
          if (drivesHold) holdLotties.push(driver);
          // D-125 Phase 3a — this Lottie's settle contribution now happens in the PRE-PASS
          // above (media-phases-follow-composition hoisted it: a follower's window needs the
          // aggregated result at construction time). Same gates, same `lottieTiming`.
          // D-112 — exposed UNFILTERED so a parent instance override can re-filter it.
          contentDrivers.push({
            id: l.element.id,
            drivesHold,
            whenComplete: () => driver.whenComplete(),
          });
          if (hasOutro) scopeOutroLotties.push(driver);
        }
      }

      // D-128 Phase 4 — the video lifecycle, mirroring the Lottie block above but
      // INVERTING who owns the playhead (§D3 / decision (e)): the <video> advances
      // itself and the driver keeps it in lockstep with the injected clock.
      for (const v of scope.videos) {
        const el = v.element;
        const durationMs = el.durationMs;
        // media-phases-follow-composition — resolve the phase WINDOW, mirroring the Lottie
        // block above. Video is the ms-native kind, so it consumes the comp-side core
        // (`followWindowMs`) directly — no unit adapter. Follow without a lifecycle behaves
        // as absent phases (nothing to follow).
        const followsV = followsComposition(el.phases);
        // Session Y — the corrected rule: a follower's outro is the CLIP'S OWN ENDING.
        // AUTHORED introEnd/outroStart win (the seed-signature shim `videoFollowClipFacts`
        // keeps attach-written seeds from masquerading as intent); absent, the outro is
        // END-anchored `[clipEnd − outSpan → clipEnd]` and the intro is unchanged.
        const vw =
          followsV && followAnchors !== null
            ? followWindowMs(followAnchors, {
                durationMs,
                holdAtMs: el.phases?.holdAt,
                ...videoFollowClipFacts(el.phases, durationMs),
              })
            : null;
        const phasesEffV = followsV ? undefined : el.phases;
        const hasPhases = phasesEffV !== undefined;
        // Absent phases (decision (b)): the whole clip is the intro, the hold loops
        // the whole clip, and there is NO outro (outroStart = duration ⇒ degenerate).
        const introStartMs = vw?.introStartMs;
        const introDelayMs = vw?.introDelayMs;
        const introEndMs = vw !== null ? vw.holdMs : (phasesEffV?.introEnd ?? durationMs);
        const outroStartMs = vw !== null ? vw.outroStartMs : (phasesEffV?.outroStart ?? durationMs);
        const outroEndMs = vw?.outroEndMs;
        // Under follow, an AUTHORED idle range composes with H; ABSENT idle means the hold
        // FREEZES at H even for `holdBehavior: 'loop'` — looping the whole clip would
        // abandon the held look, which is the one thing follow promises to keep (design
        // §2). The STORED holdBehavior is untouched; only the resolved hold reads this
        // way, and the Playout checklist's `infinite` mirror says the same.
        const idle = vw !== null ? el.phases?.idle : phasesEffV?.idle;
        const loopStartMs =
          vw !== null
            ? idle
              ? idle.start
              : vw.holdMs
            : idle
              ? idle.start
              : hasPhases
                ? introEndMs
                : 0;
        const loopEndMs =
          vw !== null
            ? idle
              ? idle.end
              : vw.holdMs
            : idle
              ? idle.end
              : hasPhases
                ? outroStartMs
                : durationMs;
        const holdBehaviorEff = vw !== null && idle === undefined ? 'freeze' : el.holdBehavior;
        const hasOutro = vw !== null ? vw.hasOutro : outroStartMs < durationMs;
        // MUTABLE: `recover()` rebuilds the element in place (a terminal decode
        // error kills the NODE, not the driver) and re-points every handle member,
        // and B-137's `live()` below re-points it when a HOST reparents the node.
        let media = v.container;
        /**
         * B-137 — THE NODE THE DRIVER COMMANDS MUST BE THE NODE THE VIEWER SEES.
         *
         * A host may legitimately REPARENT a `<video>` across a rebuild rather than
         * let it reload: the Designer preview pools the live element and transplants
         * it back over the freshly built one (`preview.ts` `reconcileVideos`), so
         * that a transform-only edit never re-fetches the media. Nothing told the
         * NEW driver about that swap, so it went on commanding the node it captured
         * at build time — by then detached, and never given a `src` (the host's src
         * walk uses `document.querySelectorAll`, which cannot see a detached node).
         * Meanwhile the node actually on screen was the one the OUTGOING driver
         * paused during teardown, and no code path ever played it again. That is
         * the whole of B-137: a frozen picture with a healthy driver behind it,
         * commanding an orphan.
         *
         * Re-resolving by `data-cg-element-id` fixes it at the binding rather than
         * at the host, so it is HOST-AGNOSTIC — any future harness that reparents
         * nodes is covered without knowing this driver exists.
         *
         * `isConnected === false` is the trigger, and it is precise: it is true
         * ONLY when this node has left the document, which is exactly the swap.
         * A node that is merely moved WITHIN the document stays connected and is
         * never re-resolved, so the normal path costs one boolean read. The scan
         * (rather than a selector) avoids escaping an arbitrary author-supplied id
         * — and a scene's video count is small, on a path taken only after a swap.
         *
         * This is the same re-pointing `recover()` already performs on a different
         * trigger (a terminal decode error), deliberately reusing that precedent
         * instead of inventing a second mechanism.
         */
        const live = (): HTMLVideoElement => {
          if (media.isConnected) return media;
          const nodes = media.ownerDocument.querySelectorAll<HTMLVideoElement>(
            'video[data-cg-element-id]',
          );
          for (const node of nodes) {
            if (node.dataset['cgElementId'] === el.id) {
              media = node;
              return media;
            }
          }
          // No replacement in the document — keep the last known node. The driver
          // then commands a detached element harmlessly, exactly as before.
          return media;
        };
        /**
         * B-137 — `play()` REJECTIONS ARE REPORTED, ONCE PER ELEMENT.
         *
         * Every rejection here was swallowed blind, which is why a video commanding
         * an orphan looked like nothing at all for weeks: no console line, no
         * evidence, a frozen picture and a driver reporting success. The silence was
         * load-bearing to the bug's invisibility, so the logging is part of the fix.
         *
         * ONCE per element, latched — this sits on a path that can be re-entered every
         * tick, and a per-frame log would be its own defect. Rejections remain
         * NON-FATAL (a src-less node during export wiring, an autoplay refusal, jsdom
         * with no media stack): the driver carries on exactly as it did.
         */
        let playFailureReported = false;
        const reportPlayFailure = (reason: unknown): void => {
          if (playFailureReported) return;
          playFailureReported = true;
          console.warn(`[cg] video "${el.id}": play() was rejected`, reason);
        };
        const handle: VideoHandle = {
          play: () => {
            const node = live();
            try {
              const p = node.play();
              if (p !== undefined && typeof p.catch === 'function') {
                void p.catch((reason: unknown) => {
                  reportPlayFailure(reason);
                });
              }
            } catch (reason) {
              reportPlayFailure(reason);
            }
          },
          pause: () => live().pause(),
          seek: (sec) => {
            live().currentTime = sec;
          },
          currentTime: () => live().currentTime,
          // D-128 sync fix — a corrective seek must never stack on one still settling
          // (`media.seeking`): that seek-storm wedged the decoder and painted half-decoded
          // frames. jsdom has no real seek, so `seeking` is simply false there.
          seeking: () => live().seeking,
          // D-128 seek-fragility recovery — `media.error` is TERMINAL: no seek or
          // play on the dead node ever paints again (the pause/resume freeze the
          // owner hit on a pre-alignment asset). jsdom has no MediaError: null ⇒ alive.
          dead: () => {
            const node = live();
            return node.error !== null && node.error !== undefined;
          },
          // Rebuild the element IN PLACE: fresh node, same attributes (src, class,
          // style, playsinline, preload, every data-* — so the Designer preview's
          // video pool re-adopts it by `data-cg-element-id`), positioned where the
          // dead one stood. EXPLICITLY DISTINGUISHED from the Phase-3
          // no-remount-on-drag guard: a transform change never sets `media.error`,
          // so recovery can only fire on a genuinely dead decoder — never on a drag.
          recover: () => {
            // Rebuild the node that is ON SCREEN — recovering an orphan would
            // replace a node nobody can see and leave the frozen one in place.
            const old = live();
            const wasPlaying = !old.paused && !old.ended;
            const at = Number.isFinite(old.currentTime) ? old.currentTime : 0;
            const fresh = old.ownerDocument.createElement('video');
            for (const name of old.getAttributeNames()) {
              const val = old.getAttribute(name);
              if (val !== null) fresh.setAttribute(name, val);
            }
            // `muted` is a PROPERTY in the builder (no attribute) — carry it, plus
            // the inline transform/geometry the attribute walk already copied via
            // `style`. An unmuted rebuilt element would be blocked from autoplay.
            fresh.muted = true;
            old.replaceWith(fresh);
            media = fresh;
            try {
              fresh.currentTime = at;
            } catch {
              /* not loaded yet — the pending seek applies once metadata lands */
            }
            if (wasPlaying) handle.play();
          },
        };
        const driver = new VideoDriver({
          handle,
          durationMs,
          introStartMs,
          introDelayMs,
          introEndMs,
          outroStartMs,
          outroEndMs,
          loopStartMs,
          loopEndMs,
          holdBehavior: holdBehaviorEff,
          clock: options.clock,
        });
        scopeVideos.push(driver);
        videos.push(driver);
        // media-phases-follow-composition — the at-rest poster shows the derived H (the held
        // look). The scene-builder wrote `holdAt ?? midpoint` (it has no comp anchors); the
        // runtime REFINES it here, before the host's poster seek reads the dataset.
        if (vw !== null) media.dataset['cgPosterMs'] = String(Math.round(vw.holdMs));
        // D-105 — content root so the coordinated exit can select it (data-cg-content='video').
        media.dataset['cgContent'] = 'video';
        // §D6.2 — a video that OWNS an outro animates itself off; guard it from the
        // blanket fade/hide (design.md decision (d)). A no-outro video keeps the
        // normal content fade — nothing to fight.
        if (hasOutro) media.dataset['cgOutro'] = '1';
        // B-034 — a HIDDEN video is FULLY INERT (never gates a hold, never awaited on exit).
        if (el.visible !== false) {
          // D-128 (c) — `drivesHold` is OPT-IN (`=== true`), the INVERSE of ticker/clock/
          // sequence: absent ⇒ the video does NOT drive the hold; a ticker on top drives it
          // and the video holds beneath. Do not normalize to the opt-out kinds.
          const drivesHold = el.drivesHold === true;
          if (drivesHold) holdVideos.push(driver);
          contentDrivers.push({
            id: el.id,
            drivesHold,
            whenComplete: () => driver.whenComplete(),
          });
          if (hasOutro) scopeOutroLotties.push(driver);
        }
      }

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
        holdTickers.length > 0 ||
        holdCountdowns.length > 0 ||
        holdSequences.length > 0 ||
        holdLotties.length > 0 ||
        holdVideos.length > 0
          ? Promise.all([
              ...holdTickers.map((t) => t.whenComplete()),
              ...holdCountdowns.map((c) => c.whenComplete()),
              ...holdSequences.map((s) => s.whenComplete()),
              // D-125 §D6.3 — only OPTED-IN (`drivesHold === true`) Lotties are in this
              // array: a freeze Lottie completes at `introEnd`, an idle-loop one never does.
              ...holdLotties.map((l) => l.whenComplete()),
              // D-128 — an opted-in `freeze` video completes at the hold point; a `loop`
              // video never does (an infinite hold-driver, like an idle-loop Lottie).
              ...holdVideos.map((v) => v.whenComplete()),
            ]).then(() => undefined)
          : null;
      const stopScopeContent = (): void => {
        for (const t of scopeTickers) t.stop();
        for (const c of scopeClocks) c.stop();
        for (const s of scopeSequences) s.stop();
        // D-125 §D6.4.5 — halt the Lottie rAF on settle, so no driver is left ticking after
        // the background settles CLEARED. The element outro already ran — EVERY exit path
        // awaits it before its background leg (out()/stop() via the registry, auto-exit via
        // §D6.2b's beforeOutro gate) — so this only stops an idle-loop / a driver whose
        // outro was superseded.
        for (const l of scopeLotties) l.stop();
        // D-128 — halt the video rAF on settle (mirror the Lottie halt): a loop hold or
        // a superseded outro must not keep ticking after the background settles CLEARED.
        for (const v of scopeVideos) v.stop();
      };
      // B-031 — resolves when THIS scope settles (after its outro), so a content-driven
      // parent can hold until a nested content-driven (coordinator) child has played out.
      // B-033 — re-mintable per run: a REPLAY must re-arm this (via `resetSettled`, before the
      // controller cascade) so the parent — which captures `whenSettled()` FRESH at each hold
      // entry — waits on a PENDING settle again instead of the one already resolved last play.
      let resolveSettled: () => void = () => undefined;
      let settled = new Promise<void>((res) => {
        resolveSettled = res;
      });
      const resetSettled = (): void => {
        settled = new Promise<void>((res) => {
          resolveSettled = res;
        });
      };
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
        // B-034 — a HIDDEN instance's whole subtree is inert for the parent's hold (mirrors render's
        // display:none): the aggregation/start below skip it, so a visible driver inside it can't hold.
        child.visible = c.visible !== false;
        return child;
      });
      // D-104 follow-up — `activeRange` / `outPoint` / `holdEntry` are computed ONCE, above
      // the media driver loops (media-phases-follow-composition hoisted them: a follower's
      // window derives from these anchors at driver construction). The wiring below reads
      // those same consts — a second computation here is exactly the two-reads trap
      // golden rule 7 exists to prevent.
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
      // B-089 — this scope's OWN trims, applied along ITS OWN timeline. The gate list is
      // populated at BUILD time, but each entry's `naturalDisplay` is snapshotted only after
      // the whole scene builds — hence the lazy read here, at call time.
      const applyScopeLifespanGatesAtFrame = (frame: number): void => {
        for (const gate of scope.lifespanGates) {
          const inside = frame >= gate.lifespan.in && frame <= gate.lifespan.out;
          gate.node.style.display = inside ? gate.naturalDisplay : 'none';
        }
      };
      const controller = new PlayoutController({
        frameRate: scene.frameRate,
        active: activeRange,
        lifecycle: scope.source.lifecycle,
        holdEntryFrame: holdEntry,
        playout: effPlayout,
        hasAnimation: scope.animated.length > 0,
        // B-088 + B-089 — a `lifespan` gate boundary crossing this leg means the leg cannot
        // collapse to a single end-frame paint. B-088 wired this for the ROOT scope only,
        // because gates were collected against the root `elementMap` and a nested scope had
        // none to cross. B-089 gives every scope its own gates, so the reason applies to
        // EVERY scope — verified empirically, not assumed: with per-scope gates but a
        // root-only predicate, a nested element trimmed to [33,60] in a keyframe-less comp
        // never appeared (the one collapsed paint at the out-point sits outside the trim),
        // and one trimmed to [33,90] was visible from frame zero (that paint sits inside it)
        // — B-088's two failure modes exactly, one scope down. Each scope asks only about
        // its OWN trims, so a scope with no trims still collapses.
        //
        // D-125 Phase 3a — a LOTTIE-derived settle is the second reason a leg cannot
        // collapse, and it applies to EVERY scope (a nested comp has its own `lotties`), not
        // just the root. With no keyframes `hasAnimation` is false, so the entrance leg
        // `[active.in → settle]` collapsed to a single `applyFrame(settle)` and fired
        // `onContentStart` at PLAY — content appeared instantly while the furniture was still
        // animating on, making the derived settle inert. Sweeping the leg makes it consume its
        // real duration (`(settle − active.in) / frameRate` seconds — by construction the
        // Lottie's intro duration), so content starts exactly when the furniture settles.
        // Only the leg ENDING at (or before) the settle needs it: the static settle leg
        // `[settle → outPoint]` and the outro still collapse as before.
        //
        // A scope with NO trims passes `undefined`, so `buildNeedsFrameSweep` can still
        // return `undefined` outright and the collapse path stays exactly as it was for
        // every scene without trims (the static-case optimisation).
        needsFrameSweep: buildNeedsFrameSweep(
          scope.lifespanGates.length > 0
            ? (inF: number, outF: number): boolean =>
                lifespanGateChangesInRange(scope.lifespanGates, inF, outF)
            : undefined,
          lottieSettles.length > 0 ? Math.min(Math.max(...lottieSettles), outPoint) : null,
        ),
        applyFrame: (frame: number): void => {
          for (const entry of scope.animated) applyAnimationAtFrame(entry, frame);
          // B-029 + B-089 — honor per-element lifespan during PLAYBACK, not only the
          // scrubber, so a start-trimmed (lifespan.in > 0) element appears at its in-point +
          // plays instead of staying hidden / being dropped. Each scope gates its OWN
          // elements at its OWN frame: a nested comp's trims are authored in that comp's
          // frame space, and its controller is the one running that timeline.
          applyScopeLifespanGatesAtFrame(frame);
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
                // B-034 — skip a HIDDEN instance's subtree (inert; never starts, never gates the hold).
                if (child.visible && !child.isCoordinator) startContentTree(child);
              }
            }
          : undefined,
        // D-125 §D6.2b — the AUTO-exit seam (closes tasks 7.6): every path into
        // `startOutro()` plays this scope SUBTREE's element outros through the one-shot
        // ledger before its background leg. `node` is declared a few lines below —
        // safe: this closure runs only when an exit begins, long after wiring, and the
        // late BINDING is deliberate (the Phase-3a lifespan lesson — never capture a
        // to-be-initialised value eagerly), so the walk sees stamped repeater rows and
        // each instance's CURRENT visibility at exit time (B-034: hidden subtrees are
        // skipped by the walk; hidden leaves never entered `outroLotties`).
        beforeOutro: (finalExit: boolean): Promise<void> | null => {
          // B-034 — a scope under a HIDDEN ancestor is fully inert: its cascaded exit
          // must not play (or await) outros for a subtree nobody can see. Checked at
          // exit time from the root, because this node cannot see its own ancestors.
          if (!isEffectivelyVisible(node)) return null;
          // A FINAL exit takes the whole visible subtree off air, so it plays the
          // subtree's outros; a NON-final loop-cycle boundary exits only THIS scope's
          // furniture — a descendant scope's controller holds independently across the
          // parent's cycles, so its Lottie must persist (own-scope reach, symmetric
          // with onCycleRestart's own-scope re-arm below).
          return playElementOutrosOnce(finalExit ? collectSubtreeOutros(node) : scopeOutroLotties);
        },
        onCycleRestart: (): void => {
          // D-125 §D6.2b — loop-cycle boundary: the ledger forgets THIS scope's OWN
          // drivers (the next cycle's exit owns a fresh outro — exactly once per
          // cycle) and this scope's OWN Lotties re-arm: reset() re-paints `ip` and
          // RE-MINTS `whenComplete` (B-033 — a stale resolved completion would close
          // the next content-driven hold instantly), start() replays the intro
          // alongside the background IN. Deliberately OWN-SCOPE, matching the
          // non-final gate's reach above: descendants were not exited at the
          // boundary, so there is nothing of theirs to re-arm.
          for (const d of scopeOutroLotties) outroLedger.delete(d);
          for (const l of scopeLotties) {
            l.reset();
            l.start();
          }
          // D-128 — this scope's OWN videos re-arm at the loop-cycle boundary too
          // (reset re-mints whenComplete + parks at intro start; start replays it).
          for (const v of scopeVideos) {
            v.reset();
            v.start();
          }
        },
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
        // D-125 §D7 — already B-034-gated at build (hidden Lotties never enter this list).
        outroLotties: scopeOutroLotties,
        whenSettled: () => settled,
        resetSettled,
        // B-034 — default visible; the parent overrides each child from its FieldScopeChild (below),
        // like `holdOverrides`. The root scope has no instancing parent, so it stays visible.
        visible: true,
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
            mode,
            paintEditorBackdrop,
          );
          return rows.map((row, i) => {
            // D-102 Phase 2 — a repeater row is a STAMPED subtree: every row is built from the SAME
            // child-composition layers, so its ticker/sequence/countdown carries the SAME authored
            // element id, and its synthetic path is addressed by no scope override. Inheriting this
            // scope's per-element timing maps is what makes the AUTHORED (template) element's
            // preview override govern EVERY stamped row's own driver.
            const rowSub = wireScopeSubtree(
              row.scope,
              `${path}#${entry.element.id}[${String(i)}]`,
              false,
              elementTiming,
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
      scope: subtreeScope,
      tickers,
      clocks,
      sequences,
      repeaters,
      lotties,
      videos,
      destroy(): void {
        // Symmetric teardown: rows first (each tears down its OWN subtree),
        // then controllers (stop timers/rAF before the drivers release their
        // DOM), then drivers — matching remove()'s original order.
        for (const r of repeaters) r.destroy();
        for (const c of controllers) c.destroy();
        for (const t of tickers) t.destroy();
        for (const c of clocks) c.destroy();
        for (const s of sequences) s.destroy();
        // D-125 — destroy the lottie-web instances (idempotent).
        for (const l of lotties) l.destroy();
        // D-128 — tear down the video drivers (stops ticking + pauses; DOM removed above).
        for (const v of videos) v.destroy();
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

  // D-135 — the COMPOSITION→CLIP anchor the scrubber positions frame-mapped media by.
  //
  // A Lottie's intro starts at `play()`, which on the timeline is the composition's
  // ACTIVE IN (`activeRangeOf`), and its OUT phase starts at the lifecycle's out-point
  // (IN = `[active.in, outPoint]`, HOLD = the held `outPoint`, OUT =
  // `[outPoint, active.out]`). Both are converted to elapsed TIME here, because the clip
  // plays at its own authored `fr × speed` and is never rescaled onto the composition's
  // markers (§D1.1) — the driver owns the frame mapping, this owns only the anchor.
  //
  // The ROOT scene's range and lifecycle anchor EVERY scope, including nested instances:
  // `tick()` paints ONE shared frame across the whole tree (see `allAnimated` above and
  // the lifespan-gate note below), and a Lottie inside a nested instance is started by
  // the same `play()` as the root's own. Anchoring it anywhere else would make the
  // canvas disagree with what goes on air.
  const scrubActiveIn = activeRangeOf(scene).in;
  const scrubOutPoint = scene.lifecycle?.outPoint;
  const scrubMsPerFrame = scene.frameRate > 0 ? 1000 / scene.frameRate : 0;

  // Per-element lifespan gates — only elements with an explicit
  // `lifespan` are tracked here; the rest stay visible for every
  // frame (the default behaviour the Designer ships with). We
  // remember the prior display value so the toggle restores the
  // element's own visibility instead of forcing `display: block`.
  // B-089 — every scope registered its own trimmed elements (with their built display) at
  // build time; now that `applyScopedFieldValues` above has run, re-read the display for the
  // scopes the namespace tree reaches, so a boot-time visibility binding still wins.
  refreshLifespanGateDisplays(built.scopeTree);
  // B-029 — the designer scrubber paints ONE shared frame across the whole tree, so its
  // evaluator spans every scope's gates. Playback does not use this: each scope's controller
  // applies its own gates at its own frame (see `applyScopeLifespanGatesAtFrame`).
  //
  // It iterates the LIVE wiring tree (`subtrees`) rather than a union captured at boot,
  // because that is the only membership stamped scopes join — a repeater re-stamps fresh row
  // scopes at each play and on `setItems`, long after any boot-time walk. Using a frozen union
  // left scrub ungating exactly the rows that playback gates, so the canvas and the on-air
  // render disagreed about a trimmed row element.
  //
  // Both dimensions are needed: `subtrees` supplies every STAMPED scope (each row / item is
  // its own subtree), and the `scope.children` recursion supplies the nested composition
  // instances INSIDE each of those, which are wired by `wireScope` and never become
  // subtrees of their own. Together they cover exactly the scopes playback gates.
  const applyGatesInScopeTree = (scope: FieldScope, frame: number): void => {
    for (const gate of scope.lifespanGates) {
      const inside = frame >= gate.lifespan.in && frame <= gate.lifespan.out;
      gate.node.style.display = inside ? gate.naturalDisplay : 'none';
    }
    for (const child of scope.children) applyGatesInScopeTree(child.scope, frame);
  };
  applyLifespanGatesAtFrame = (frame: number): void => {
    for (const sub of subtrees) applyGatesInScopeTree(sub.scope, frame);
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
      // D-125 §D6.4.5 — halt every Lottie on the root settle: the CLEARED terminal state
      // has no driver still ticking. The outro already played — every exit path (operator
      // AND §D6.2b auto-exit) awaits it before its background leg reaches this settle.
      for (const l of sub.lotties) l.stop();
      // D-128 — halt every video on the root settle (the CLEARED terminal state has no
      // driver still ticking; the outro already played on every exit path).
      for (const v of sub.videos) v.stop();
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

  /**
   * D-141 — route every `clock-target` binding to its clock DRIVER, on play() and
   * on every update(), so a `CG UPDATE` re-aims a LIVE countdown without replaying
   * it. The sibling of {@link reapplySequenceItemFields}: both exist because their
   * value has no DOM node for `applyOne`'s walk to write.
   *
   * Walks the D-025 NAMESPACE tree, so the same child composition instanced twice
   * re-targets each instance's own clock from its own namespace.
   *
   * A value that does not parse applies NOTHING — the current, possibly on-air
   * target is KEPT and the failure is reported once per (element, value). That is
   * the house rule for operator input reaching air: never a countdown blanked or
   * zeroed by a typo.
   */
  const reportedClockTargets = new Set<string>();
  const reapplyClockTargets = (): void => {
    const walk = (doc_: FieldDocLite, values: NestedFieldValues, scope: FieldScope): void => {
      const drivers = clockDriversByScope.get(scope);
      if (drivers !== undefined && drivers.size > 0) {
        const defaults = new Map<string, unknown>();
        for (const field of doc_.fields ?? []) {
          defaults.set(field.id, 'default' in field ? field.default : undefined);
        }
        for (const binding of doc_.bindings ?? []) {
          if (binding.target.kind !== 'clock-target') continue;
          const driver = drivers.get(binding.target.elementId);
          if (driver === undefined) continue;
          const raw =
            binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
          if (raw === undefined) continue;
          const time = parseTimeOfDay(raw);
          if (time === undefined) {
            const key = `${binding.target.elementId}:${String(raw)}`;
            if (!reportedClockTargets.has(key)) {
              reportedClockTargets.add(key);
              bus.emit('error', {
                code: 'clock-target-unparseable',
                message: `clock target value ${JSON.stringify(raw)} is not HH:mm or HH:mm:ss; keeping the current target`,
                elementId: binding.target.elementId,
              });
            }
            continue;
          }
          driver.retarget({ kind: 'timeofday', time });
        }
      }
      for (const child of scope.children) {
        const childDoc = scene.compositions?.find((c) => c.id === child.compositionId);
        if (childDoc === undefined) continue;
        const sub = values[child.name];
        walk(childDoc, isNamespace(sub) ? sub : {}, child.scope);
      }
    };
    walk(scene, currentValues, built.scopeTree);
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
  const exitClearTimeout =
    options.clock?.clearTimeout ??
    ((h: unknown): void => {
      clearTimeout(h as never);
    });
  const contentRoots = (): HTMLElement[] =>
    Array.from(built.container.querySelectorAll<HTMLElement>('[data-cg-content]'));
  /**
   * D-125 §D6.2 — content roots the blanket fade/hide may touch: every `data-cg-content`
   * EXCEPT the ones that animate themselves off (`data-cg-outro`, a Lottie owning an outro
   * segment). Fading a Lottie's opacity while its driver drives `goToAndStop` would fight
   * the authored outro; the driver owns that element's exit.
   */
  const fadeableContentRoots = (): HTMLElement[] =>
    contentRoots().filter((n) => n.dataset['cgOutro'] === undefined);
  /**
   * D-125 §D6.2 — THE ELEMENT-OUTRO REGISTRY. Every `LottieDriver` that owns an outro and
   * is reachable through VISIBLE scopes, walked over the wiring tree (root scope + nested
   * composition instances + stamped repeater rows).
   *
   * B-034 — the walk SKIPS a hidden instance's whole subtree, so a Lottie inside a hidden
   * ancestor is fully inert: its outro is never awaited (it would otherwise stall the exit
   * by its outro duration for a subtree nobody can see). The per-element `visible` gate was
   * already applied where `outroLotties` was BUILT, so both the leaf and the ancestor case
   * are covered.
   *
   * BOUNDARY — a sequence composition ITEM's subtree is deliberately NOT walked: those items
   * are shown/hidden by the sequence driver and own their D-116 item transitions, so a
   * transient (possibly off-screen) item must not gate the composition's exit.
   */
  const collectSubtreeOutros = (from: ScopeNode): ElementOutroDriver[] => {
    const out: ElementOutroDriver[] = [];
    const walk = (n: ScopeNode): void => {
      out.push(...n.outroLotties);
      for (const child of n.children) {
        if (!child.visible) continue;
        walk(child);
      }
    };
    walk(from);
    return out;
  };
  /**
   * B-034 (§D6.2b) — is `target` reachable from the root through VISIBLE instances only?
   * The subtree walk above gates DESCENDANTS, but a scope's own controller does not know
   * its ancestors: a visible-at-the-leaf Lottie inside a HIDDEN instance would otherwise
   * have its outro played by its OWN scope's exit (the cascade still stops hidden
   * children), stalling the exit for furniture nobody can see. The root registry walk
   * never descends into a hidden instance; this is the same rule, asked from below.
   */
  const isEffectivelyVisible = (target: ScopeNode): boolean => {
    const walk = (n: ScopeNode): boolean => {
      if (n === target) return true;
      for (const child of n.children) {
        if (!child.visible) continue;
        if (walk(child)) return true;
      }
      return false;
    };
    return walk(rootNode);
  };
  // The full registry (root walk) for the runtime-level exits; each controller's
  // §D6.2b `beforeOutro` walks from ITS OWN node instead, so a nested scope that
  // auto-exits awaits its own subtree's outros — not the root's, not its siblings'.
  const collectElementOutros = (): ElementOutroDriver[] => collectSubtreeOutros(rootNode);
  /**
   * D-125 §D6.2b — THE ONE-SHOT OUTRO LEDGER. An exit episode can be triggered more
   * than once for the same drivers: an auto-exit (`startOutro()` from a hold expiry /
   * content completion) followed by an operator `stop()`, or the runtime's
   * `out()`/`stop()` awaiting the registry and THEN cascading `stop()` into every
   * controller — whose `startOutro()` asks again. The ledger makes the outro
   * exactly-once STRUCTURALLY: the first caller drives each driver's outro; a later
   * caller gets the in-flight promise (awaits, never re-drives); when everything it
   * asked about is already done it gets `null`, so that caller's background leg stays
   * fully SYNCHRONOUS (the pre-Lottie ordering, and the no-Lottie scene, byte for byte).
   *
   * Re-armed by `play()` (clear all — the new run owns fresh outros) and per
   * loop-cycle boundary by `onCycleRestart` (that scope's drivers only), so every
   * cycle's exit plays the outro again — once. B-030 safety: `playOutro()` ALWAYS
   * resolves (§D6.4.1 — degenerate/destroyed/superseded all settle), so a ledger
   * entry can never strand an awaiting exit.
   */
  const outroLedger = new Map<ElementOutroDriver, { promise: Promise<void>; done: boolean }>();
  const playElementOutrosOnce = (drivers: readonly ElementOutroDriver[]): Promise<void> | null => {
    const waits: Promise<void>[] = [];
    for (const d of drivers) {
      let entry = outroLedger.get(d);
      if (entry === undefined) {
        const rec: { promise: Promise<void>; done: boolean } = {
          promise: Promise.resolve(),
          done: false,
        };
        rec.promise = boundedOutro(d.playOutro()).then(() => {
          rec.done = true;
        });
        outroLedger.set(d, rec);
        entry = rec;
      }
      if (!entry.done) waits.push(entry.promise);
    }
    if (waits.length === 0) return null;
    return Promise.all(waits).then(() => undefined);
  };
  /**
   * Session Z — THE LEDGER'S OWN BACKSTOP, and the reason it is LOUD. Every driver bounds
   * its own outro (§D6.4.1), so this must never fire. If it does, some driver's
   * never-strand invariant is broken, and the consequence is severe AND silent: the
   * background outro is never reached, so the graphic cannot come off air and the
   * operator's stop/out appear to do nothing with nothing logged anywhere. Continuing the
   * exit without the stranded element is strictly better than a graphic stuck on air;
   * SAYING SO is what makes the next occurrence diagnosable instead of another "sometimes
   * the button is dead". The bound is deliberately far longer than any real outro.
   *
   * Armed ONCE, around the LEDGER ENTRY — not around each caller's await. Both awaiting
   * sites (this runtime's `stop()`/`out()`, and every controller's `beforeOutro` gate)
   * subscribe to that one promise, so one bound covers both and a strand cannot be paid
   * for twice; per-caller watchdogs would each wait the full window in turn.
   */
  const EXIT_OUTRO_WATCHDOG_MS = 30_000;
  const boundedOutro = async (outro: Promise<void>): Promise<void> => {
    let timer: unknown = null;
    const expiry = new Promise<'timeout'>((res) => {
      timer = exitSetTimeout(() => res('timeout'), EXIT_OUTRO_WATCHDOG_MS);
    });
    const outcome = await Promise.race([outro.then(() => 'settled' as const), expiry]);
    if (timer !== null) exitClearTimeout(timer);
    if (outcome === 'timeout') {
      bus.emit('error', {
        code: 'exit.outro-timeout',
        message: `an element outro did not settle within ${String(EXIT_OUTRO_WATCHDOG_MS)} ms; the exit continued without it`,
      });
    }
  };
  const saveExitStyles = (n: HTMLElement): void => {
    if (n.dataset['cgExit'] !== undefined) return;
    n.dataset['cgExit'] = `${n.style.opacity}|${n.style.visibility}|${n.style.transition}`;
  };
  const fadeContentOut = (ms: number): Promise<void> => {
    for (const n of fadeableContentRoots()) {
      saveExitStyles(n);
      n.style.transition = `opacity ${String(ms)}ms linear`;
      n.style.opacity = '0';
    }
    return new Promise<void>((res) => {
      exitSetTimeout(res, ms);
    });
  };
  const hideContentNow = (): void => {
    for (const n of fadeableContentRoots()) {
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
      reapplyClockTargets();
      machine.transition('playing');
      bus.emit('play.start');
      doc.body.classList.remove('cg-pending');
      // D-105 — clear any out()/stop() exit styling so a fresh play shows the
      // content again, and supersede an in-flight out() fade.
      exitGen += 1;
      pendingExitOutro = false;
      paused = false;
      // D-125 §D6.2b — the new run owns fresh element outros: forget every one-shot
      // mark, so this run's exit (auto or operator) plays them again — exactly once.
      outroLedger.clear();
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
      // D-125 §D1 — the Lottie intro starts at PLAY (not at hold entry like the
      // time-driven content): the furniture plays its intro-once and then holds
      // (freeze / idle-loop) while the background entrance runs concurrently.
      for (const sub of subtrees)
        for (const l of sub.lotties) {
          l.reset();
          l.start();
        }
      // D-128 §D1 — like the Lottie, a video's intro starts at PLAY (not at hold
      // entry): it plays [0 → introEnd] once, then holds (loop / freeze) beneath the
      // background entrance.
      for (const sub of subtrees)
        for (const v of sub.videos) {
          v.reset();
          v.start();
        }
      // Play the IN once and hold (no full-range loop, no auto-outro by default);
      // the mode orchestration (auto-out / loop-cycle / content-driven) then runs.
      // Absent lifecycle: the whole timeline is the entrance and the hold is its
      // last frame. D-026 — cascades to every nested instance's own controller.
      // B-033 — re-arm every scope's self-settle signal for THIS run BEFORE the controller cascade,
      // so a replay's content-driven hold waits on a FRESH (pending) nested-coordinator settle
      // instead of the one already resolved last play (which made the 2nd+ play close instantly).
      const rearmSettled = (n: ScopeNode): void => {
        n.resetSettled();
        for (const child of n.children) rearmSettled(child);
      };
      rearmSettled(rootNode);
      cascade(rootNode, (c) => c.play());
      // Session Z — THE TRIPWIRE. Everything above put a graphic ON AIR. If the machine
      // did not follow, the two have diverged, and the consequence is SILENT and total:
      // `stop()`/`out()` return at their `on-air`/`playing` guard for the life of this
      // runtime, so both operator buttons go dead with nothing logged anywhere (that is
      // exactly how the dead-Preview-buttons bug reached the owner). Every legal entry —
      // including superseding an in-flight exit — is in the transition table, so reaching
      // here in any other state is an invariant break, not an expected refusal. Say so.
      if (machine.state !== 'on-air') {
        bus.emit('error', {
          code: 'lifecycle.play-not-on-air',
          message: `play() left the lifecycle machine in '${machine.state}'; stop()/out() will silently no-op until this runtime is rebuilt`,
        });
      }
      bus.emit('play.end');
    },

    setArrangementView(view: ArrangementView | undefined): void {
      if (machine.state === 'removed') return;
      repunch(view);
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
      reapplyClockTargets();
      repunch(arrangementView);
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
      const gen = ++exitGen;
      pendingExitOutro = false;
      // D-125 §D6.2 — an ELEMENT that owns its outro still plays it on stop(): the
      // acceptance is that BOTH stop() and out() play the Lottie outro. Everything else
      // still hard-hides immediately (the quick exit is unchanged for non-owning content).
      hideContentNow();
      // §D6.2b — finalize every cycle SYNCHRONOUSLY before awaiting: a loop-cycle
      // boundary whose element outro is in flight would otherwise resolve first
      // (its gate subscribed to the same ledger promise earlier), re-arm, and let the
      // cascade below re-drive the whole outro. Finalized, that boundary settles as
      // the final exit instead — no restart, no re-arm, no double-play.
      cascade(rootNode, (c) => c.markFinalCycle());
      // §D6.2b — through the ONE-SHOT ledger: fresh outros start now; one already in
      // flight from an AUTO-exit is awaited, never re-driven (no double-play); a null
      // gate (no owners, or all done) keeps stop()'s SYNCHRONOUS hide → background
      // ordering exactly as before.
      const outroGate = playElementOutrosOnce(collectElementOutros());
      if (outroGate !== null) {
        await outroGate;
        // Superseded mid-outro by a play()/stop()/out() — that command owns the scene now.
        if (gen !== exitGen) return;
        if (machine.state !== 'on-air' && machine.state !== 'playing') return;
        if (paused) {
          // D-105 — paused mid-outro: hold the half-played frame and defer the background
          // outro to resume(), so the graphic does not close while paused.
          pendingExitOutro = true;
          return;
        }
      }
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
      // D-125 §D6.2 — THE ELEMENT-OUTRO SEAM. The 400 ms content fade and every element
      // outro run CONCURRENTLY, and the background waits for BOTH: a Lottie plays its own
      // authored `[outroStart → op]` (it is excluded from the fade so the two don't fight),
      // while ticker/clock/sequence roots fade as before. Background LAST — D-105's
      // content-first ordering, now honoring element-owned exits.
      // §D6.2b — finalize every cycle synchronously first (see stop() — the same
      // loop-cycle boundary race exists during this await), then route through the
      // one-shot ledger, so an out() landing during an AUTO-exit outro awaits the
      // in-flight one instead of re-driving it from `outroStart`.
      cascade(rootNode, (c) => c.markFinalCycle());
      const outroGate = playElementOutrosOnce(collectElementOutros());
      await Promise.all([fadeContentOut(OUT_FADE_MS), outroGate ?? Promise.resolve()]);
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
      // D-125 §D3 — freeze the Lottie playhead in lockstep (no wall-clock drift).
      for (const sub of subtrees) for (const l of sub.lotties) l.pause();
      // D-128 §D3 — pause the <video> AND capture its clock elapsed, so resume re-seeks.
      for (const sub of subtrees) for (const v of sub.videos) v.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      paused = false;
      cascade(rootNode, (c) => c.resume());
      for (const sub of subtrees) for (const t of sub.tickers) t.resume();
      for (const sub of subtrees) for (const c of sub.clocks) c.resume();
      for (const sub of subtrees) for (const s of sub.sequences) s.resume();
      // D-125 §D3 — continue the Lottie playhead from the frozen frame (a settled
      // freeze-hold stays frozen; a still-running intro / idle-loop continues).
      for (const sub of subtrees) for (const l of sub.lotties) l.resume();
      // D-128 §D3 — resume each video by RE-SEEKING to the clock-derived clip-time then
      // playing (the anti-drift re-anchor); a settled freeze-hold stays frozen.
      for (const sub of subtrees) for (const v of sub.videos) v.resume();
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
      // D-125 §D6.4.4 — remove() is the PANIC path and stays a SYNCHRONOUS hard kill: it
      // awaits NO element outro. `destroy()` tears the Lottie players down immediately
      // (settling any in-flight `playOutro()` so a concurrent out()/stop() can't strand).
      // stop()/out() are the graceful paths that play the outro.
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
      // D-135 — position every LOTTIE at the playhead's frame. Until this landed the
      // canvas painted keyframed properties, stamped rows and lifespan gates only, so a
      // Lottie sat on its poster frame while the composition moved underneath it — the
      // canvas silently misrepresenting the composition during the one operation the
      // operator uses to judge it.
      //
      // EVERY Lottie, regardless of `drivesHold` (design §9.4 (a)). The two flags are
      // ORTHOGONAL: `drivesHold` answers "does this element gate the HOLD"; whether the
      // canvas shows its frame under the playhead is a different question. Furniture that
      // deliberately does not gate the hold is exactly what would sit frozen otherwise.
      //
      // `subtrees` (not the boot-time `lotties` union) because a repeater re-stamps fresh
      // row scopes at every play and on `setItems` — the same reason the lifespan gates
      // below iterate the live tree.
      //
      // The CARVE-OUT holds here by construction: ticker / sequence / clock drivers are
      // NOT in this loop and must never join it. They are functions of REAL time, not of
      // composition frame — there is no frame N of a crawl to show, and an invented
      // mapping would disagree with what goes on air.
      const introElapsedMs = (frame - scrubActiveIn) * scrubMsPerFrame;
      const outroElapsedMs =
        scrubOutPoint !== undefined && frame >= scrubOutPoint
          ? (frame - scrubOutPoint) * scrubMsPerFrame
          : null;
      for (const sub of subtrees) {
        for (const l of sub.lotties) l.positionAt(introElapsedMs, outroElapsedMs);
        // D-135 §5 (§9.5 answered (a), 2026-08-13) — and every VIDEO, through the same
        // elapsed pair and the same rule set: §9.4 (a) (regardless of `drivesHold`), no
        // direction special case (§9.3 (a)), the driver's own `expectedClipMs` as the one
        // mapping, `live()` inside the handle for every node access (B-137). The driver's
        // positionAt seeks a PAUSED element and skips while a seek is in flight — the
        // nearest-decodable-frame contract of §5.2–§5.3.
        for (const v of sub.videos) v.positionAt(introElapsedMs, outroElapsedMs);
      }
      applyLifespanGatesAtFrame(frame);
    },
    on(event, listener) {
      return bus.on(event, listener);
    },
  };

  return runtime;
}

/**
 * B-089 — REFRESH each reachable gate's `naturalDisplay` after the build and the initial
 * `applyScopedFieldValues`. Every gate already carries the display its builder settled on
 * (captured in `buildLayer`); this re-reads it for the scopes the D-025 NAMESPACE tree can
 * reach, because a `visibility` binding writes `style.display` directly (`bindings.ts`) and
 * the pre-B-089 gate restored that post-binding value.
 *
 * It deliberately does NOT define which gates exist: STAMPED scopes (repeater rows,
 * sequence composition items) never join `scope.children`, so this walk cannot see them —
 * which is exactly why the build-time capture is the source of truth and this is only a
 * refresh. A walk-derived gate LIST would silently omit every stamped scope.
 */
function refreshLifespanGateDisplays(root: FieldScope): void {
  for (const gate of root.lifespanGates) gate.naturalDisplay = gate.node.style.display;
  for (const child of root.children) refreshLifespanGateDisplays(child.scope);
}

/**
 * B-088 — a gate is a step function of the frame: it turns ON at `lifespan.in` and OFF
 * again at `lifespan.out + 1`. A leg `[inF, outF]` only needs a real frame-by-frame sweep
 * when one of those transitions lands INSIDE it — i.e. in `(inF, outF]`, since the
 * collapsed path already paints `outF` correctly. A trim entirely outside the leg (or
 * spanning it end to end) paints the same at every frame, so that leg still collapses.
 *
 * B-089 — takes the gate list as a parameter so each scope asks about ITS OWN trims,
 * against its own timeline's leg bounds.
 */
function lifespanGateChangesInRange(
  gates: readonly LifespanGateEntry[],
  inF: number,
  outF: number,
): boolean {
  return gates.some((gate) => {
    const turnsOnAt = gate.lifespan.in;
    const turnsOffAt = gate.lifespan.out + 1;
    return (turnsOnAt > inF && turnsOnAt <= outF) || (turnsOffAt > inF && turnsOffAt <= outF);
  });
}

function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.then(() => undefined);
}

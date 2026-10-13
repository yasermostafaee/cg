import type { Element, LottieElement, VideoElement } from '@cg/shared-schema';
import { activeRangeOf, followsComposition } from '@cg/shared-schema';
import type { LottieClipMeta } from '@cg/lottie-bridge';
import { designerStore } from '../../state/store.js';
import { activeDocOf } from '../../state/scene-doc.js';
import { lottieFollowAttachPhases, videoFollowAttachPhases } from '../../state/follow-attach.js';

/**
 * add-time-duration-guard (D-151) — THE chokepoint for adding content to a composition. At the
 * moment content is ADDED (never at asset import), content whose intrinsic duration exceeds the
 * host's raises ONE dialog: Extend / Add as backdrop (media only — the owner's settled sharpened
 * Candidate A) / Cancel. A fitting add commits immediately and is byte-identical to today.
 *
 * ONE decision function (`requestGuardedAdd`) holds the pending state and the fits/overflows
 * decision; the exported kind adapters derive the intrinsic facts at the unit edge and hand a
 * commit closure — the same one-derivation-plus-thin-adapters shape as
 * `media-phases-follow-composition`'s `followWindowMs`. Every FRESH-ADD door calls an adapter
 * instead of `designerStore.addElement` / `addCompositionInstance` directly (the door map is the
 * change's design.md §1); the clone paths (paste/duplicate/undo/load) copy content ALREADY
 * accepted and deliberately do not pass through here.
 *
 * The pending state lives at MODULE level, never in the store: dialog state must not enter undo
 * history or the persisted scene, and Cancel must leave the scene OBJECT IDENTICAL (pinned by
 * test). `DurationGuardDialog` subscribes via `useSyncExternalStore` and mounts once in App.
 */
export interface DurationGuardPending {
  kind: 'video' | 'lottie' | 'composition';
  /** What the dialog calls the content ("This clip" / the composition's quoted name). */
  contentLabel: string;
  /** The content's intrinsic duration, ms. */
  contentMs: number;
  /** The host's active-range length, ms. */
  hostMs: number;
  /** ceil-to-frame active length that EXACTLY fits the content. */
  neededFrames: number;
  /** Media can follow the composition; an instance has no `phases` and cannot. */
  canFollow: boolean;
  /** Insert exactly as the door would have (used by Extend, after growing the host). */
  commit: () => void;
  /** Insert with `phases.source: 'composition'` (media only). */
  commitBackdrop: (() => void) | null;
}

let pending: DurationGuardPending | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

export function subscribeDurationGuard(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function pendingDurationGuard(): DurationGuardPending | null {
  return pending;
}

/** Test hook — clear any pending request (mirrors the store's `_reset`). */
export function _resetDurationGuard(): void {
  pending = null;
  emit();
}

/**
 * The host's playable length: `activeRangeOf(activeDocOf(scene))` — the verified single
 * authority for the play/export window, reused, never re-derived.
 */
function hostState(): { hostMs: number; fps: number } | null {
  const scene = designerStore.get().scene;
  if (scene === null) return null;
  const fps = scene.frameRate;
  if (!(fps > 0)) return null;
  const r = activeRangeOf(activeDocOf(scene));
  return { hostMs: ((r.out - r.in) * 1000) / fps, fps };
}

/** The ONE decision: fits ⇒ commit now (silent, exactly as today); overflows ⇒ pend the dialog. */
function requestGuardedAdd(p: Omit<DurationGuardPending, 'hostMs' | 'neededFrames'>): void {
  const host = hostState();
  if (host === null) return; // no scene — nothing to add into
  if (!(p.contentMs > host.hostMs)) {
    // Strictly greater-than: an exact fit is silent.
    p.commit();
    return;
  }
  pending = {
    ...p,
    hostMs: host.hostMs,
    neededFrames: Math.ceil((p.contentMs * host.fps) / 1000),
  };
  emit();
}

/** Door adapter — video: the intrinsic duration is the schema's `durationMs` (captured at conversion). */
export function guardedAddVideo(element: VideoElement): void {
  requestGuardedAdd({
    kind: 'video',
    contentLabel: 'This clip',
    contentMs: element.durationMs,
    canFollow: true,
    commit: () => designerStore.addElement(element as Element),
    commitBackdrop: () =>
      designerStore.addElement({
        ...element,
        // Session Y — a fresh video door never carries phases; the attach writes the SOURCE
        // alone (one rule with the Inspector's attach button): absent fields mean 'derive the
        // window; the outro is the clip's ending'. Authored phases keep their values — they
        // now genuinely govern the window.
        phases:
          element.phases !== undefined && !followsComposition(element.phases)
            ? { ...element.phases, source: 'composition' as const }
            : (element.phases ?? videoFollowAttachPhases()),
      } as Element),
  });
}

/**
 * Door adapter — Lottie: `(op − ip) / fr` at speed 1× — the CREATION default; the element does
 * not exist yet, so an authored speed cannot apply. The door hands the `LottieClipMeta` it
 * already parsed at drop time (`lottieAssetCache` is primed only POST-insert, so it is not a
 * reliable source at this moment).
 */
export function guardedAddLottie(element: LottieElement, meta: LottieClipMeta): void {
  const contentMs = meta.fr > 0 ? (Math.max(0, meta.op - meta.ip) / meta.fr) * 1000 : 0;
  requestGuardedAdd({
    kind: 'lottie',
    contentLabel: 'This clip',
    contentMs,
    canFollow: true,
    commit: () => designerStore.addElement(element as Element),
    commitBackdrop: () =>
      designerStore.addElement({
        ...element,
        // A clip that arrived WITH bodymovin markers keeps its marker values and takes the
        // follow source — under session Y's corrected rule those authored values now GOVERN
        // (the clip's own intro/outro, scheduled by the composition). A marker-less clip gets
        // the source alone: absent fields mean 'derive; the outro is the clip's ending'.
        phases:
          element.phases !== undefined
            ? { ...element.phases, source: 'composition' as const }
            : lottieFollowAttachPhases(),
      } as Element),
  });
}

/**
 * Door adapter — composition insert: the child's `activeRangeOf` length at the project frame
 * rate. Commit delegates to the store's `addCompositionInstance`, so the D-086 CYCLE guard keeps
 * running INSIDE the store action, unchanged — this guard wraps it, never replaces it. An
 * instance has no `phases` and cannot follow: the dialog takes the firm two-choice form.
 */
export function guardedAddCompositionInstance(
  childId: string,
  at?: { x: number; y: number },
): void {
  const scene = designerStore.get().scene;
  if (scene === null) return;
  const child = scene.compositions?.find((c) => c.id === childId);
  if (child === undefined) return;
  // Refuse what the cycle guard would refuse BEFORE raising a dialog about it — a dialog whose
  // Extend then silently no-ops would be worse than no dialog.
  if (!designerStore.canNestCompositionInActive(childId)) return;
  const host = hostState();
  if (host === null) return;
  const r = activeRangeOf(child);
  const contentMs = ((r.out - r.in) * 1000) / host.fps;
  requestGuardedAdd({
    kind: 'composition',
    contentLabel: `“${child.name}”`,
    contentMs,
    canFollow: false,
    commit: () => void designerStore.addCompositionInstance(childId, at),
    commitBackdrop: null,
  });
}

/**
 * Extend — through the timeline's OWN actions, as ONE undo step. The host length the guard
 * compared is the ACTIVE range; a composition may carry an `activeRange` narrower than its
 * total, so Extend grows the total only as far as needed to contain the new active out, then
 * grows the active out itself (when explicit). `runAsSingleHistoryEntry` collapses the writes
 * plus the add into one history entry, so one undo restores the duration and removes the
 * element together.
 */
export function resolveDurationGuardExtend(): void {
  const p = pending;
  if (p === null) return;
  pending = null;
  emit();
  const scene = designerStore.get().scene;
  if (scene === null) return;
  const doc = activeDocOf(scene);
  const active = activeRangeOf(doc);
  const newActiveOut = active.in + p.neededFrames;
  const newTotalFrames = Math.max(doc.frameRange.out, newActiveOut) - doc.frameRange.in;
  designerStore.runAsSingleHistoryEntry(() => {
    designerStore.setSceneDurationFrames(newTotalFrames);
    if (doc.activeRange !== undefined) designerStore.setSceneActiveOut(newActiveOut);
    p.commit();
  });
}

/** Add as backdrop — follow the composition (media only; `holdAt` is the Inspector's to tune). */
export function resolveDurationGuardBackdrop(): void {
  const p = pending;
  if (p === null || p.commitBackdrop === null) return;
  pending = null;
  emit();
  p.commitBackdrop();
}

/** Cancel — the element is NOT added; the scene is left EXACTLY as it was. */
export function resolveDurationGuardCancel(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

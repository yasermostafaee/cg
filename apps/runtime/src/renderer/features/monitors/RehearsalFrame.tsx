import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, Ref } from 'react';
import type { CgPage, FieldValues, FitRect, Position } from '@cg/shared-schema';
import {
  controlLiveLayoutFocusTarget,
  controlLiveLayoutSoloTarget,
  pageMediaPath,
  positionQuery,
  CG_LIVE_FRAME_TRANSITION_PAGE_MARKER,
  CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER,
  CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER,
  withCgControl,
  type ControlLiveLayout,
  type FrameTransitionPhase,
  type LiveFramePlacement,
  type LiveMaskPlacement,
} from '@cg/shared-schema';
import {
  activeLookOf,
  framePlacementRects,
  lookOperatorFrames,
  pageTarget,
  type ChannelRaster,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import {
  applyOperatorPosition,
  canApplyOperatorPosition,
  providePagePicture,
  silencePage,
  type PageRuntimeWindow,
} from './frameEnvironment.js';
import type { TimingToSend } from '../inspector/timingToSend.js';
import { frameBox } from './rehearsalFrames.js';
import { measureRehearsalBounds } from './rehearsalBounds.js';
import type { PlatePlacement } from './livePlateGeometry.js';
import {
  paintPvwPlatePictures,
  paintPvwSourceTransition,
  type PvwInputEffect,
} from './pvwPlatePictures.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';
import type { RehearsalBook } from '../layers/bookOf.js';
import { MISSING_PICTURE_URL, pageExtOf, pictureDataUrl } from '../book/pagePictures.js';
import { recordPreviewBookPage } from '../book/previewBookPage.js';
import { frameTransitionPreference } from '../inspector/frameTransitionPreference.js';
import { inputTransitionPreference } from '../inspector/inputTransitionPreference.js';
import {
  rehearsalPlacementPhases,
  rehearsalPresetPlan,
  retainPresetArtwork,
  runRehearsalEffect,
} from './rehearsalPresetEffects.js';
import { previewFocusSwitch } from './previewFocusSwitch.js';

/**
 * R-022 — ONE rehearsing row's frame: the retained self-contained page, in a
 * same-origin iframe sized to the channel raster.
 *
 * Extracted from `RehearsalStage` when PVW became a COMPOSITE. The stage owns
 * the fit box, the checker and the transport; this owns one page's boot, its
 * value pushes, its placement and its environment. One instance per rehearsing
 * row, all absolutely positioned in the same box.
 */

const styles = {
  frame: {
    border: 0,
    display: 'block',
    // R-049 — the box and the FIT transform are NOT written here any more. They
    // come from the shared `frameBox`, because the live-plate overlay must land
    // on exactly these pixels and a second copy of the expression is how an
    // overlay drifts off the page beneath it. What stays here is what belongs to
    // an iframe and to nothing else.
    // TRANSPARENT, not black — an opaque frame would hide both the checker and
    // every frame below it in the composite, which is the entire point of
    // compositing. The page inside paints its own background where it has one.
    background: 'transparent',
    /**
     * ── THE OPAQUE CANVAS, AND WHY ONE WORD FIXES TWO SYMPTOMS ──────────────
     *
     * CSS Color Adjust: when the used `color-scheme` of an embedded document
     * differs from its embedder's, the UA renders the embedded document's
     * canvas OPAQUE. The console's root declares `color-scheme: dark`
     * (`@cg/ui`'s `theme.css`); the served template page declares none, so it
     * resolves `normal` → light. Every frame was a mismatch, and every frame
     * therefore carried a white canvas.
     *
     * That single fact produced both reported defects:
     *
     *   1. the flat white 16:9 area, which hid the transparency checker the
     *      operator judges alpha against;
     *   2. the composite looking broken while being CORRECT — the frames were
     *      all present and stacked in layer order, but the topmost one's opaque
     *      canvas occluded every frame beneath it, so only the highest graphic
     *      was ever visible.
     *
     * THE CANVAS IS NOT AN ELEMENT, which is why this took so long to see and
     * why the tests for it sample pixels: with the bug fully present, `html`,
     * `body` and `.cg-stage` all measure `rgba(0, 0, 0, 0)` while the box
     * renders white. No computed style reports a canvas.
     *
     * `light` MATCHES THE FRAME TO THE PAGE, never the page to the frame. It is
     * a property of the embedding ENVIRONMENT, set on an element this panel
     * owns, because the opacity is imposed by the embedder relationship and not
     * by the document — the alternative (writing `colorScheme` onto the served
     * document's root) reaches into the page and edges toward a preview-only
     * variant of it, which is exactly what PVW's fidelity claim forbids. Only
     * one of the two directions is implemented, deliberately: two mechanisms
     * for one effect is how the next person inherits a page that is transparent
     * for a reason nobody can name.
     *
     * It is also the more faithful choice on its own terms. `light` is what a
     * browser gives a document that declares no scheme — what this page gets
     * standalone, and what CEF's transparent composite corresponds to. The
     * `dark` it inherited was the OPERATOR CONSOLE's theme leaking into the
     * graphic's rendering environment, which a broadcast preview must not do.
     *
     * ON THE STYLE OBJECT, not a post-load pass. Rows enter and leave rehearse
     * at will and the composite builds one frame per rehearsing row, so a fix
     * that swept the frames existing at some moment would be the same bug with
     * a longer fuse. This is spread into every `<iframe>` this component
     * renders, so it cannot miss one.
     */
    colorScheme: 'light',
  },
} as const satisfies Record<string, CSSProperties>;

/**
 * The CasparCG globals `installCasparGlobals` puts on the rendered page's
 * window. Same-origin (`srcdoc`), so the rehearsal drives the SAME entry points
 * `CG PLAY` and `CG UPDATE` reach on air — the motion being judged is the real
 * animation, not an approximation of it.
 */
interface TemplateWindow extends PageRuntimeWindow {
  play?: (data?: string) => void;
  update?: (data?: string) => void;
  /** `CG NEXT`'s entry point — a multi-step template's advance. */
  next?: () => void;
  stop?: () => void;
}

/** The transport a parent can drive on this frame. */
export interface RehearsalFrameHandle {
  play: () => void;
  next: () => void;
  stop: () => void;
  replayEffect: () => void;
}

/** Both rectangles are in the frame's channel raster, before PVW fit. */
export interface RehearsalFrameBounds {
  content: FitRect;
  stage: FitRect;
  canPosition: boolean;
}

interface Props {
  itemId: string;
  /** The retained self-contained HTML — byte-identical to what the bridge serves. */
  html: string;
  /** The channel's real raster (R-030). The iframe is sized to it. */
  raster: ChannelRaster;
  /** Preview-only fit scale, applied to the iframe ELEMENT. */
  fit: number;
  /** Stacking order within the composite — higher CasparCG layer draws on top. */
  zIndex: number;
  /** The operator's current (possibly unapplied) field values for the item. */
  fields: FieldValues;
  /** The operator's applied placement override (R-011), when the item has one. */
  position: Position | undefined;
  /** Row label, for the accessible name. */
  rowName: string;
  /**
   * 🔴 `B-151` — WHICH LOOK THIS PAGE SHOULD SHOW, and the third consumer of a mechanism
   * whose other two were each wired by hand.
   *
   * A look switch is two mutations on two machines, and the page's half arrives through the
   * reserved `__cg` key on the payload (`tasks.md` 6.7). The plant gets it on `CG ADD` and
   * `CG UPDATE`; the Designer's canvas gets it by `postMessage` → `setActiveLook`. PVW got
   * NOTHING — so the page in the frame sat on the authored default from the first frame and
   * stayed there through every switch, while air moved.
   *
   * It rides the SAME payload key rather than a preview-only call, so there is no third
   * spelling of "tell the page which look": what PVW sends is byte-shaped like what CasparCG
   * delivers, which is the whole fidelity claim rehearse is built on.
   */
  activeLookId: string | undefined;
  animatePresetChanges?: boolean | undefined;
  presetFramePeriodMs?: number | undefined;
  /** `PASSES-CYCLE-ONLY-26` Part B — the operator's effective pass timing, or undefined. */
  timing: TimingToSend | undefined;
  /** The effective book and the row's initial page. */
  book?: RehearsalBook | undefined;
  livePlates: readonly PlatePlacement[];
  liveSources?: TemplateLiveSources | undefined;
  controlLiveLayout?: ControlLiveLayout | undefined;
  playing?: boolean;
  canReplayEffect?: boolean;
  replayBaseline?: LiveFramePlacement[] | undefined;
  onTransitionChange?: (itemId: string, active: boolean) => void;
  framePlacements?: LiveFramePlacement[] | undefined;
  maskPlacements?: LiveMaskPlacement[] | undefined;
  sourceFrames: ReadonlyMap<string, PvwSourceFrame>;
  visible?: boolean;
  handleRef?: Ref<RehearsalFrameHandle>;
  /** Told whenever this frame's readiness flips, so the stage can gate its transport. */
  onReadyChange?: (itemId: string, ready: boolean) => void;
  onBoundsChange?: (itemId: string, bounds: RehearsalFrameBounds | null) => void;
}

function rehearsalPageKey(book: RehearsalBook, index: number): string {
  const picture = book.pages[index];
  return JSON.stringify([book.fieldId, index, picture?.media, picture?.id, picture?.assetId]);
}

interface RehearsalPresetCue {
  doc: Document;
  lookId: string | undefined;
  payload: string;
  commit: (phase?: FrameTransitionPhase) => void;
}

export function RehearsalFrame({
  itemId,
  html,
  raster,
  fit,
  zIndex,
  fields,
  position,
  rowName,
  activeLookId,
  animatePresetChanges = true,
  presetFramePeriodMs,
  timing,
  book,
  livePlates,
  liveSources,
  controlLiveLayout,
  playing = false,
  canReplayEffect = false,
  replayBaseline,
  onTransitionChange,
  framePlacements,
  maskPlacements,
  sourceFrames,
  visible = true,
  handleRef,
  onReadyChange,
  onBoundsChange,
}: Props): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const loadedHtml = useRef<string | null>(null);
  const authoredPlacement = useRef<{
    stage: HTMLElement;
    transform: string;
    origin: string;
    overridden: boolean;
  } | null>(null);
  const lastContent = useRef<{ doc: Document; relative: FitRect } | null>(null);
  const composed = useRef<{
    doc: Document;
    lookId: string | undefined;
    payload: string;
    livePlates: readonly PlatePlacement[];
    framePlacements: LiveFramePlacement[] | undefined;
  }>();
  const runningEffect = useRef<{
    cancel: (commit?: boolean) => void;
    preset?: RehearsalPresetCue;
  }>();
  const inputEffect = useRef<PvwInputEffect>();
  const replayEffectRef = useRef<() => void>();

  /*
    🔴 `RUN-NEXT-VERSION-03` 1.1 — **THE PAGE'S PICTURE, AS THE AIR NAMES IT.**

    On air the bridge tells the page which page it is on and where its picture is (`__cg.page`, an
    address on the template server). PVW told it neither, so a picture the operator loaded had no
    address in this frame: the page drew its `<img>` with none, and the browser painted the file name
    instead (the owner's `3.png`). The frame cannot reach the template server, so the address it
    hands over is the picture itself — the bytes this console sent, or the bridge's own copy read
    back (`pagePictures`), as a `data:` URL (the page's CSP admits `data:` and never `blob:`). A
    picture neither holds is drawn as a placeholder, and the Inspector says which page.
  */
  const [localPage, setLocalPage] = useState<{ book: string; html: string; index: number }>();
  const bookIdentity = book?.identity;
  const localIndex =
    localPage !== undefined && localPage.book === bookIdentity && localPage.html === html
      ? localPage.index
      : undefined;
  useEffect(() => {
    setLocalPage((current) =>
      current !== undefined && current.book === bookIdentity && current.html === html
        ? current
        : undefined,
    );
  }, [bookIdentity, html]);

  const pageIndex = localIndex ?? book?.index;
  const pageSha = pageIndex === undefined ? undefined : book?.pages[pageIndex]?.media;
  const pageId = pageIndex === undefined ? undefined : book?.pages[pageIndex]?.id;
  const bookField = book?.fieldId;
  const bookKey =
    book === undefined || pageIndex === undefined ? null : rehearsalPageKey(book, pageIndex);
  const pageRewound = localIndex === undefined && book?.rewound === true;
  const rewindPage = useRef<{ doc: Document; field: string; key: string; changed: boolean }>();
  const pendingBookPlay = useRef<{ key: string; doc: Document }>();
  const [picture, setPicture] = useState<{ sha: string; url: string } | null>(null);
  useEffect(() => {
    if (pageSha === undefined) return;
    let cancelled = false;
    void pictureDataUrl(pageSha)
      .catch(() => null)
      .then((url) => {
        if (!cancelled) setPicture({ sha: pageSha, url: url ?? MISSING_PICTURE_URL });
      });
    return () => {
      cancelled = true;
    };
  }, [pageSha]);
  /**
   * The `__cg.page` member a take of this row would carry, in the bridge's OWN form — the picture
   * named by its page-route address (`/page/<sha>.<ext>`), the one form the page accepts from the
   * wire. `undefined` while the picture is read.
   */
  const page = useMemo((): Extract<CgPage, { index: number }> | undefined => {
    if (bookField === undefined || pageIndex === undefined) return undefined;
    if (pageSha === undefined) return { field: bookField, index: pageIndex };
    if (picture?.sha !== pageSha) return undefined;
    return {
      field: bookField,
      index: pageIndex,
      media: { [pageSha]: pageMediaPath(pageSha, pageExtOf(picture.url)) },
    };
  }, [bookField, pageIndex, pageSha, picture]);
  const pageKey = page === undefined ? null : bookKey;
  useEffect(() => () => recordPreviewBookPage(itemId), [itemId, html, bookField]);

  const templateWindow = useCallback((): TemplateWindow | null => {
    return (frameRef.current?.contentWindow as TemplateWindow | null | undefined) ?? null;
  }, []);

  /**
   * Hand the page the picture its next turn names (`providePagePicture`): this frame's origin has no
   * page route, so the address alone would draw nothing. Before every PLAY and every page push.
   */
  const offerPicture = useCallback((): void => {
    if (picture === null || picture.sha !== pageSha) return;
    providePagePicture(templateWindow(), picture.sha, picture.url);
  }, [picture, pageSha, templateWindow]);

  /*
    🔴 `B-151` — ONE PAYLOAD BUILDER for both entry points, carrying the look on the reserved
    `__cg` key exactly as the bridge does.

    `withCgControl` only when there IS a look: a pre-LOOKS template must receive the payload
    it always received, byte for byte. An empty control block would be a difference between
    what PVW sends and what CasparCG sends, on the one surface whose entire claim is that
    there is no difference — and `CG_CONTROL_KEY`'s strip rule means the page would silently
    tolerate it, so nothing would ever have told us.
  */
  const placementControl = useMemo(
    () => ({
      ...(activeLookId !== undefined && { look: activeLookId }),
      ...(framePlacements !== undefined && { framePlacements }),
      ...(maskPlacements !== undefined && { maskPlacements }),
    }),
    [activeLookId, framePlacements, maskPlacements],
  );
  // Compare the payload by value so a bounds publish cannot resend unchanged fields.
  const payload = useMemo(
    () => JSON.stringify(withCgControl(fields, placementControl)),
    [fields, placementControl],
  );

  /*
    🔴 `PASSES-CYCLE-ONLY-26` Part B — **THE TIMING RIDES `play()`, AND RIDES `update()` ONLY
    WHEN IT CHANGES. The two are different rules and collapsing them re-arms a live count.**

    `play()` SEATS the count as a TOTAL (`DELTA B0`): the controller snapshots it, so a PLAY
    must always carry it or PVW starts on the authored default.

    `update()` is the trap. The effect that pushes field edits re-fires on EVERY draft change —
    that responsiveness is most of what rehearse is for — and on a RUNNING page
    `__cg.timing.passes` means "passes REMAINING FROM NOW". Folding the timing into `payload()`
    would therefore re-arm the count on every keystroke in an unrelated text field: type four
    characters during a two-pass run and the graphic has been told "two more" four times.

    So the timing is NOT in `payload()`. It has its own effect below, keyed on the timing VALUE,
    which fires on the first boot (before any play, where it is stored as a pending total) and
    again only when the number itself changes.
  */
  const playPayload = useCallback(
    (): string =>
      JSON.stringify(
        withCgControl(fields, {
          ...(activeLookId !== undefined && { look: activeLookId }),
          ...(framePlacements !== undefined && { framePlacements }),
          ...(maskPlacements !== undefined && { maskPlacements }),
          ...(timing !== undefined && { timing }),
          // `RUN-NEXT-VERSION-03` 1.1 — a take carries its page (`#pageControl`); so does PVW's.
          ...(page !== undefined && { page }),
        }),
      ),
    [fields, activeLookId, framePlacements, maskPlacements, timing, page],
  );

  /** The timing's VALUE as a stable key — an object identity would re-fire on every render. */
  const timingKey = timing === undefined ? null : JSON.stringify(timing);

  const playNow = useCallback(() => {
    const win = templateWindow();
    if (win?.play === undefined) return;
    offerPicture();
    win.play(playPayload());
    if (page !== undefined) {
      recordPreviewBookPage(itemId, { fieldId: page.field, index: page.index, id: pageId });
    }
  }, [offerPicture, playPayload, templateWindow, page, pageId, itemId]);

  useImperativeHandle(
    handleRef,
    () => ({
      play: () => {
        runningEffect.current?.cancel(true);
        inputEffect.current?.cancel();
        const doc = frameRef.current?.contentDocument;
        setLocalPage(undefined);
        if (
          localIndex !== undefined &&
          book !== undefined &&
          localIndex !== book.index &&
          doc != null
        ) {
          // Play restarts Preview from the row's current page after the local turn.
          pendingBookPlay.current = { key: rehearsalPageKey(book, book.index), doc };
          return;
        }
        if (pageKey === null && bookKey !== null && doc != null) {
          // Wait for the picture before restarting a book at its selected page.
          pendingBookPlay.current = { key: bookKey, doc };
          return;
        }
        pendingBookPlay.current = undefined;
        playNow();
      },
      next: () => {
        if (book !== undefined && book.step) {
          pendingBookPlay.current = undefined;
          setLocalPage((previous) => {
            const index =
              previous !== undefined && previous.book === book.identity && previous.html === html
                ? previous.index
                : book.index;
            return {
              book: book.identity,
              html,
              index: pageTarget(index, book.pages.length, book.wrap, 'next'),
            };
          });
          return;
        }
        templateWindow()?.next?.();
      },
      replayEffect: () => replayEffectRef.current?.(),
      stop: () => {
        runningEffect.current?.cancel(true);
        inputEffect.current?.cancel();
        pendingBookPlay.current = undefined;
        templateWindow()?.stop?.();
      },
    }),
    [templateWindow, playNow, pageKey, bookKey, book, html, localIndex],
  );

  // Re-arm on a template change: a fresh document has not booted yet.
  useEffect(() => {
    setReady(false);
  }, [html]);

  // THE CLEANUP IS NOT TIDINESS. Without it an unmounting frame leaves its id in
  // the stage's ready set, so a row that leaves rehearse and comes back is
  // counted as booted the instant it remounts — and the transport is armed
  // against a document that has not run yet. `window.play` is not defined on a
  // blank page, so the optional call would no-op and the operator would see PLAY
  // run the composite with one graphic sitting still. Silent, and exactly the
  // "some rows and not others" shape.
  useEffect(() => {
    onReadyChange?.(itemId, ready);
    return () => {
      onReadyChange?.(itemId, false);
    };
  }, [onReadyChange, itemId, ready]);

  // Keep the old page and its pictures mounted until the transition reaches the new preset.
  // Commits remain local calls into the same authored page used by programme output.
  const sourceFramesRef = useRef(sourceFrames);
  sourceFramesRef.current = sourceFrames;
  const livePlatesRef = useRef(livePlates);
  livePlatesRef.current = livePlates;
  useLayoutEffect(() => {
    if (!ready || loadedHtml.current !== html) return;
    const doc = frameRef.current?.contentDocument;
    const update = templateWindow()?.update;
    if (doc == null || update === undefined) return;
    const look = liveSources === undefined ? undefined : activeLookOf(liveSources, activeLookId);
    const lookId = look?.id ?? activeLookId;
    const current = composed.current?.doc === doc ? composed.current : undefined;
    const previousLook = liveSources?.looks?.find(({ id }) => id === current?.lookId);
    const push = (phase?: FrameTransitionPhase): void => {
      update(
        phase === undefined
          ? payload
          : JSON.stringify(withCgControl(fields, { ...placementControl, frameTransition: phase })),
      );
      composed.current = {
        doc,
        lookId,
        payload,
        livePlates: livePlatesRef.current,
        framePlacements,
      };
      paintPvwPlatePictures(doc, livePlatesRef.current, sourceFramesRef.current);
    };
    const running = runningEffect.current;
    const pending = running?.preset;
    if (
      pending?.doc === doc &&
      pending.lookId === lookId &&
      visible &&
      playing &&
      animatePresetChanges
    ) {
      // A new field edit or Bridge snapshot updates this cue's destination without replaying it.
      if (pending.payload !== payload) {
        pending.payload = payload;
        pending.commit = push;
      }
      return;
    }
    if (pending !== undefined || current?.payload !== payload || !visible || !playing) {
      running?.cancel();
    }
    if (current?.payload === payload && current.lookId === lookId) return;
    const effect = controlLiveLayout?.effects.focus ?? frameTransitionPreference();
    const canAnimatePreset =
      visible &&
      playing &&
      animatePresetChanges &&
      presetFramePeriodMs !== undefined &&
      html.includes(CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER) &&
      current !== undefined &&
      liveSources !== undefined &&
      look !== undefined &&
      previousLook !== undefined &&
      previousLook.id !== look.id;
    if (canAnimatePreset && controlLiveLayout !== undefined) {
      const from = controlLiveLayoutSoloTarget(controlLiveLayout, previousLook.id);
      const to = controlLiveLayoutFocusTarget(controlLiveLayout, look.id);
      if (
        from !== undefined &&
        to !== undefined &&
        from.presetId === to.presetId &&
        from.frameId !== to.frameId
      ) {
        inputEffect.current?.cancel();
        const anchors = framePlacementRects(liveSources, from.presetId, current.framePlacements);
        const cue: RehearsalPresetCue = { doc, lookId, payload, commit: push };
        let appliedPayload: string | undefined;
        const commit = (): void => {
          cue.commit();
          appliedPayload = cue.payload;
        };
        onTransitionChange?.(itemId, true);
        const cancel = previewFocusSwitch({
          doc,
          before: { look: previousLook, frameId: from.frameId, anchor: anchors[from.frameId] },
          after: { look, frameId: to.frameId, anchor: anchors[to.frameId] },
          layout: controlLiveLayout,
          period: presetFramePeriodMs,
          pictureReady: () => {
            const sourceId = livePlatesRef.current.find(
              ({ plateId }) => plateId === to.frameId,
            )?.sourceId;
            if (sourceId == null) return true;
            const picture = sourceFramesRef.current.get(sourceId);
            return picture?.jpegBase64 !== undefined && !!picture.width && !!picture.height;
          },
          commit,
          settled: (commitTarget) => {
            if (commitTarget) {
              if (appliedPayload !== cue.payload) commit();
              else paintPvwPlatePictures(doc, livePlatesRef.current, sourceFramesRef.current);
            }
            runningEffect.current = undefined;
            onTransitionChange?.(itemId, false);
          },
        });
        runningEffect.current = { cancel, preset: cue };
        return;
      }
    }
    const plan =
      canAnimatePreset && (effect.motion !== 'cut' || effect.fade)
        ? rehearsalPresetPlan(
            {
              look: previousLook,
              rects: framePlacementRects(liveSources, previousLook.id, current.framePlacements),
              plates: current.livePlates,
            },
            {
              look,
              rects: framePlacementRects(liveSources, look.id, framePlacements),
              plates: livePlatesRef.current,
            },
            effect,
            presetFramePeriodMs,
            controlLiveLayout === undefined && html.includes(CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER),
          )
        : undefined;
    if (plan === undefined) {
      update(payload);
      composed.current = {
        doc,
        lookId,
        payload,
        livePlates: livePlatesRef.current,
        framePlacements,
      };
      return;
    }
    inputEffect.current?.cancel();
    const restore = retainPresetArtwork(doc, plan);
    const cue: RehearsalPresetCue = { doc, lookId, payload, commit: push };
    let appliedPayload: string | undefined;
    const commit = (phase?: FrameTransitionPhase): void => {
      cue.commit(phase);
      appliedPayload = cue.payload;
    };
    const phaseStep = (phase: FrameTransitionPhase) => () => sendFramePhase(update, phase);
    const entries = plan.exit.map(phaseStep);
    entries.push(() => {
      restore();
      // Enter the new preset and hold its titles in the same page update.
      commit(plan.enter);
      return plan.enter?.durationMs ?? 0;
    });
    onTransitionChange?.(itemId, true);
    const cancel = runRehearsalEffect(entries, (commitTarget) => {
      restore();
      if (commitTarget && appliedPayload !== cue.payload) commit();
      runningEffect.current = undefined;
      update(JSON.stringify(withCgControl({}, { frameTransition: null })));
      onTransitionChange?.(itemId, false);
    });
    runningEffect.current = { cancel, preset: cue };
    // Placement values are already part of the serialized payload; object identity here
    // would interrupt the transition on an unrelated stack update.
  }, [
    ready,
    payload,
    templateWindow,
    html,
    visible,
    playing,
    activeLookId,
    liveSources,
    controlLiveLayout,
    animatePresetChanges,
    presetFramePeriodMs,
    itemId,
    onTransitionChange,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !visible ||
      !playing ||
      !canReplayEffect ||
      liveSources === undefined ||
      !html.includes(CG_LIVE_FRAME_TRANSITION_PAGE_MARKER)
    )
      return;
    replayEffectRef.current = () => {
      const update = templateWindow()?.update;
      if (update === undefined || runningEffect.current !== undefined) return;
      const lookId = activeLookOf(liveSources, activeLookId)?.id;
      const phases = rehearsalPlacementPhases(
        lookId,
        lookOperatorFrames(liveSources, lookId),
        framePlacementRects(liveSources, lookId, replayBaseline),
        framePlacementRects(liveSources, lookId, framePlacements),
        frameTransitionPreference(),
      );
      if (phases.length === 0) return;
      inputEffect.current?.cancel();
      onTransitionChange?.(itemId, true);
      runningEffect.current = {
        cancel: runRehearsalEffect(
          phases.map((phase) => () => sendFramePhase(update, phase)),
          () => {
            runningEffect.current = undefined;
            update(JSON.stringify(withCgControl({}, { frameTransition: null })));
            onTransitionChange?.(itemId, false);
          },
        ),
      };
    };
    return () => {
      replayEffectRef.current = undefined;
    };
  }, [
    ready,
    visible,
    playing,
    canReplayEffect,
    html,
    liveSources,
    templateWindow,
    activeLookId,
    replayBaseline,
    framePlacements,
    onTransitionChange,
    itemId,
  ]);

  /*
    🔴 `PASSES-CYCLE-ONLY-26` Part B — **THE TIMING'S OWN PUSH, keyed on its VALUE.**

    Deliberately separate from the field/look effect above, and keyed on `timingKey` rather than
    on `timing`: the value arrives as a fresh object out of every panel render, so depending on
    the object would re-fire on every unrelated push — which is precisely the relative-count
    re-arm this separation exists to prevent. (The placement effect below carries the same rule
    for the same reason; see its note.)

    It fires on the FIRST boot — before any play, where `setRemainingPasses` stores the number as
    a pending TOTAL for `play()` to seat — and thereafter only when the operator's number itself
    changes, which IS an instruction to re-arm.

    ⚠ It sends the timing ALONE, carrying no fields. An absent field payload merges nothing, and
    an absent `look` member means "this payload says nothing about looks" — neither disturbs what
    the page already has.
  */
  useEffect(() => {
    if (!ready || timingKey === null) return;
    templateWindow()?.update?.(
      JSON.stringify(withCgControl({} as FieldValues, { timing: JSON.parse(timingKey) as never })),
    );
  }, [ready, timingKey, templateWindow]);

  /*
    🔴 `RUN-NEXT-VERSION-03` 1.1 — **THE PAGE'S OWN PUSH, keyed on WHICH page and WHICH picture.**
    A turn on the bridge (the row's Next, Go, another console's), a book loaded or replaced, a picture
    read back: each re-tells the page, as the bridge tells an on-air page in one `CG UPDATE`. Keyed on
    the field, the index and the hash rather than on the object, so a keystroke elsewhere re-tells
    nothing. It carries the page ALONE — no fields, so it disturbs nothing else the page holds — and
    runs after the field push above, so a new book's pages are in place before the turn names one.
  */
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const offerRef = useRef(offerPicture);
  useEffect(() => {
    offerRef.current = offerPicture;
  }, [offerPicture]);
  useEffect(() => {
    if (!ready || loadedHtml.current !== html) return;
    const doc = frameRef.current?.contentDocument;
    if (!pageRewound || bookKey === null || bookField === undefined || doc == null) {
      rewindPage.current = undefined;
    } else {
      if (rewindPage.current?.doc !== doc || rewindPage.current.field !== bookField) {
        rewindPage.current = { doc, field: bookField, key: bookKey, changed: false };
      }
      // The first marked destination is the Stop's counter reset, even if an edit was
      // already staged or the picture is still loading. A later page edit (and Discard
      // after that edit was shown) can update this Preview normally.
      if (!rewindPage.current.changed && rewindPage.current.key === bookKey) return;
    }
    if (pageKey === null || pageRef.current === undefined) return;
    const win = templateWindow();
    if (win?.update === undefined) return;
    offerRef.current();
    win.update(JSON.stringify(withCgControl({} as FieldValues, { page: pageRef.current })));
    recordPreviewBookPage(itemId, {
      fieldId: pageRef.current.field,
      index: pageRef.current.index,
      id: pageId,
    });
    if (rewindPage.current !== undefined) rewindPage.current.changed = true;
  }, [ready, html, bookField, bookKey, pageKey, pageRewound, templateWindow, itemId, pageId]);

  useEffect(() => {
    const pending = pendingBookPlay.current;
    if (pending === undefined) return;
    if (
      pending.key !== bookKey ||
      pending.doc !== frameRef.current?.contentDocument ||
      loadedHtml.current !== html
    ) {
      pendingBookPlay.current = undefined;
      return;
    }
    if (!ready || pageKey === null) return;
    pendingBookPlay.current = undefined;
    playNow();
  }, [ready, html, bookKey, pageKey, playNow]);

  // THE POSITION EDIT REACHING THE PREVIEW. `ready` and the placement are BOTH
  // dependencies, and that pairing is what makes an Apply visible: `ready`
  // covers the first placement after a boot, the placement covers every later
  // Apply on an already-booted page. Neither alone is enough — with only
  // `ready`, an Apply changed nothing until something happened to remount the
  // frame, which is why typing into an unrelated Inspector field looked like it
  // "fixed" the preview.
  //
  // KEYED ON THE PLACEMENT'S VALUE, NOT THE OBJECT'S IDENTITY. `position` is a
  // fresh object out of every bridge stack push, so depending on it directly
  // re-placed every frame in the composite on every unrelated push — including
  // frames whose row nobody had touched. `applyOutputPosition` is idempotent so
  // nothing moved, but "only the edited row's frame is written to" would have
  // been true of the intent and false of the code, and the next person to make
  // that function non-idempotent would have found out the hard way.
  //
  // ONLY THE FRAME WHOSE PLACEMENT CHANGED RE-RUNS. This effect is per frame, so
  // applying a position to the selected row leaves every other frame's document
  // untouched — the composite does not re-place graphics nobody edited.
  const placementKey = position === undefined ? null : positionQuery(position);
  useEffect(() => {
    if (!ready || loadedHtml.current !== html) return;
    const frame = frameRef.current;
    if (frame === null) return;
    const authored = authoredPlacement.current;
    if (placementKey === null) {
      if (authored?.overridden === true) {
        authored.stage.style.transform = authored.transform;
        authored.stage.style.transformOrigin = authored.origin;
        authored.overridden = false;
      }
      return;
    }
    const applied = applyOperatorPosition(
      frame.contentWindow as TemplateWindow | null,
      frame.contentDocument,
      // Re-derived from the key rather than closed over, so the value the effect
      // applies is the one its dependency describes — they cannot drift.
      position,
    );
    if (applied && authored !== null) authored.overridden = true;
    // `position` is deliberately absent from the deps: `placementKey` is its
    // value, and adding the object back would restore the identity churn above.
  }, [ready, html, placementKey]);

  useEffect(() => {
    return () => onBoundsChange?.(itemId, null);
  }, [itemId, html, onBoundsChange]);

  useEffect(() => {
    if (!visible || !ready || loadedHtml.current !== html || onBoundsChange === undefined) return;
    const doc = frameRef.current?.contentDocument;
    if (doc == null) return;
    const measured = measureRehearsalBounds(doc);
    if (measured === null) {
      const footprint = { x: 0, y: 0, width: raster.width, height: raster.height };
      onBoundsChange(itemId, { stage: footprint, content: footprint, canPosition: false });
      return;
    }
    const { stage, content } = measured;
    if (content !== null) {
      lastContent.current = {
        doc,
        relative: {
          x: (content.x - stage.x) / stage.width,
          y: (content.y - stage.y) / stage.height,
          width: content.width / stage.width,
          height: content.height / stage.height,
        },
      };
    }
    // When Stop hides the visuals, keep their last drag area relative to this page's stage.
    const prior = lastContent.current?.doc === doc ? lastContent.current.relative : undefined;
    onBoundsChange(itemId, {
      stage,
      content:
        content ??
        (prior === undefined
          ? stage
          : {
              x: stage.x + prior.x * stage.width,
              y: stage.y + prior.y * stage.height,
              width: prior.width * stage.width,
              height: prior.height * stage.height,
            }),
      canPosition: canApplyOperatorPosition(templateWindow(), doc),
    });
  }, [
    visible,
    ready,
    html,
    itemId,
    placementKey,
    payload,
    raster.width,
    raster.height,
    onBoundsChange,
    templateWindow,
  ]);

  // The template's own update and position are in place before the parent matches its plate DOM.
  useEffect(() => {
    if (!visible || !ready) return;
    const doc = frameRef.current?.contentDocument;
    if (doc == null || runningEffect.current !== undefined) return;
    if (composed.current?.doc === doc) composed.current.livePlates = livePlates;
    const input = inputTransitionPreference();
    if (playing && input.mode !== 'cut') {
      const durationMs =
        input.mode === 'fade' || presetFramePeriodMs === undefined
          ? input.durationMs
          : Math.max(1, Math.round(input.durationMs / presetFramePeriodMs)) * presetFramePeriodMs;
      paintPvwSourceTransition(
        doc,
        livePlates,
        sourceFrames,
        { ...input, durationMs },
        inputEffect,
      );
    } else {
      inputEffect.current?.cancel();
      paintPvwPlatePictures(doc, livePlates, sourceFrames);
    }
  }, [visible, ready, playing, livePlates, sourceFrames, presetFramePeriodMs]);

  useEffect(
    () => () => {
      runningEffect.current?.cancel();
      inputEffect.current?.cancel();
    },
    [html],
  );

  return (
    /*
      NAMED BY `aria-label`, NOT BY `title`, and the difference is the whole
      reason for the disable below: `title` on an iframe doubles as a NATIVE
      TOOLTIP, and these frames cover most of the panel — so hovering anywhere
      over the rehearsal popped up "Layer 1 rehearsal preview" on top of the
      graphic being judged. `aria-label` gives the frame the same accessible
      name with nothing on hover.

      `jsx-a11y/iframe-has-title` matches on the `title` prop specifically. What
      it is asking for is an accessible name, which this has; the rule simply
      does not know the other spelling.
    */
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    <iframe
      ref={frameRef}
      aria-label={`${rowName} rehearsal preview`}
      data-rehearsal-frame={itemId}
      data-cg-pvw="1"
      srcDoc={html}
      onLoad={() => {
        // `D-165` — PVW is silent: mute the page's own sound BEFORE the frame reports ready,
        // so no PLAY reaches a page that could still make a sound.
        silencePage(frameRef.current?.contentWindow as TemplateWindow | null);
        const stage = frameRef.current?.contentDocument?.querySelector<HTMLElement>('.cg-stage');
        authoredPlacement.current =
          stage == null
            ? null
            : {
                stage,
                transform: stage.style.transform,
                origin: stage.style.transformOrigin,
                overridden: false,
              };
        loadedHtml.current = html;
        setReady(true);
      }}
      style={{
        // Sized to the CHANNEL RASTER and fitted by the shared transform — the
        // size is what makes the page inside place itself exactly as it will on
        // air (R-030 geometry step 2 reads `window.innerWidth`/`innerHeight`,
        // which inside a frame is this box), and the fit is preview-only. A CSS
        // transform on the ELEMENT cannot change what the document inside
        // measures, which is why the two scales stay apart.
        ...frameBox(raster, fit),
        ...styles.frame,
        zIndex,
      }}
    />
  );
}

function sendFramePhase(
  update: NonNullable<TemplateWindow['update']>,
  phase: FrameTransitionPhase,
): number {
  update(JSON.stringify(withCgControl({}, { frameTransition: phase })));
  return phase.durationMs + (phase.delayMs ?? 0);
}

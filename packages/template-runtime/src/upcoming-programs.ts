import {
  cubicBezierEase,
  EASING_PRESETS,
  upcomingProgramsCardStyleOf,
  upcomingProgramsNextPageEffectOf,
  upcomingProgramsRepeatOf,
  upcomingProgramsSceneEffectsOf,
  upcomingProgramsTransitionOf,
  upcomingProgramsUsesPagination,
  type BezierEasing,
  type UpcomingProgramsElement,
  type UpcomingProgramsRect,
  type UpcomingProgramsResolvedTextStyle,
  type UpcomingProgramsSampleItem,
} from '@cg/shared-schema';
import { detectDirection, writeFieldDigits } from '@cg/text-shaping';
import {
  SequenceDriver,
  type RenderedSequenceItem,
  type SequenceBoundaryKind,
  type SequenceBoundaryMotion,
  type SequenceInPlaceTransition,
} from './sequence-driver.js';
import type { RuntimeClock } from './types.js';
import { upcomingProgramVisualUrl } from './upcoming-program-media.js';
import {
  createUpcomingCardBoundary,
  createUpcomingPageBoundary,
  upcomingCardMotion,
  upcomingPageMotion,
  UPCOMING_BOUNDARY_HIDDEN,
  type UpcomingCardMotion,
} from './upcoming-card-motion.js';

type CardStyle = ReturnType<typeof upcomingProgramsCardStyleOf>;
const MEDIA_GUIDE_OUTLINE = 'inset 0 0 0 1px #8294A0';
const FOCUSED_CARD = '[data-cg-upcoming-focus]';
const FOCUSED_MEDIA_CARD = `${FOCUSED_CARD}:not(${UPCOMING_BOUNDARY_HIDDEN})`;
const PROGRAM_VIDEO = 'video[data-cg-upcoming-media-source]';
const FOCUS_EASE: BezierEasing = EASING_PRESETS['ease-in-out'] ?? [0.42, 0, 0.58, 1];

function px(value: number): string {
  return `${String(value)}px`;
}

function placeRegion(node: HTMLElement, rect: UpcomingProgramsRect): void {
  Object.assign(node.style, {
    position: 'absolute',
    left: `${String(rect.x * 100)}%`,
    top: `${String(rect.y * 100)}%`,
    width: `${String(rect.width * 100)}%`,
    height: `${String(rect.height * 100)}%`,
    overflow: 'hidden',
  });
}

function createTextRegion(
  doc: Document,
  kind: 'cgUpcomingTitle' | 'cgUpcomingAirtime',
  text: string,
  automaticSize: number,
  layoutDirection: 'rtl' | 'ltr',
): { node: HTMLElement; applyStyle(style: UpcomingProgramsResolvedTextStyle): void } {
  const region = doc.createElement('div');
  region.dataset[kind] = '';
  // The layout fixes the origin of Start/End; the value's script controls only its own bidi.
  region.dir = layoutDirection;
  Object.assign(region.style, {
    display: 'flex',
    alignItems: 'center',
    fontVariantNumeric: kind === 'cgUpcomingAirtime' ? 'tabular-nums' : '',
    lineHeight: '1.25',
  });
  const line = doc.createElement('span');
  const value = doc.createElement('bdi');
  line.appendChild(value);
  Object.assign(line.style, {
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  region.appendChild(line);
  return {
    node: region,
    applyStyle: (style) => {
      placeRegion(region, style.rect);
      Object.assign(region.style, {
        color: style.color,
        fontFamily: `${style.fontFamily}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", system-ui, sans-serif`,
        fontSize: px(style.fontSize ?? automaticSize),
        fontWeight: String(style.fontWeight),
        textAlign: style.align,
      });
      value.dir = style.direction;
      value.textContent = writeFieldDigits(text, style.digits);
    },
  };
}

function carouselPageItems(
  items: readonly UpcomingProgramsSampleItem[],
  index: number,
  visibleCount: number,
  focusSlot: number,
): UpcomingProgramsSampleItem[] {
  if (visibleCount === 0) return [];
  const start = (index - focusSlot + items.length) % items.length;
  const leading = items.slice(start, start + visibleCount);
  return leading.concat(items.slice(0, visibleCount - leading.length));
}

function createMediaFrame(
  doc: Document,
  media: CardStyle['media'],
  showGuide: boolean,
): HTMLElement {
  const aperture = doc.createElement('div');
  aperture.dataset['cgUpcomingMedia'] = '';
  aperture.dataset['cgUpcomingMediaFit'] = media.fit;
  aperture.setAttribute('aria-hidden', 'true');
  placeRegion(aperture, media.rect);
  Object.assign(aperture.style, {
    boxSizing: 'border-box',
    backgroundColor: media.backgroundColor,
    borderRadius: px(media.cornerRadius),
  });
  if (!showGuide) return aperture;

  // The fixed-aspect guide makes the authored crop or letterbox visible before any media exists.
  const guide = doc.createElement('div');
  guide.dataset['cgUpcomingMediaGuide'] = '';
  Object.assign(guide.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    boxSizing: 'border-box',
    border: '1px dashed #A8BBC6',
    background:
      'repeating-linear-gradient(-45deg, #324752, #324752 8px, #3B535E 8px, #3B535E 16px)',
  });
  aperture.appendChild(guide);
  return aperture;
}

function sizeMediaFrame(
  aperture: HTMLElement,
  media: CardStyle['media'],
  cardSize: { width: number; height: number },
): void {
  const apertureWidth = media.rect.width * cardSize.width;
  const apertureHeight = media.rect.height * cardSize.height;
  const borderWidth = Math.min(
    media.borderWidth,
    Math.floor(Math.min(apertureWidth, apertureHeight) / 2),
  );
  aperture.style.border = `${px(borderWidth)} solid ${media.borderColor}`;
  const guide = aperture.querySelector<HTMLElement>('[data-cg-upcoming-media-guide]');
  if (guide === null) return;
  aperture.style.boxShadow = !guide.hidden && borderWidth === 0 ? MEDIA_GUIDE_OUTLINE : '';

  const innerWidth = apertureWidth - 2 * borderWidth;
  const innerHeight = apertureHeight - 2 * borderWidth;
  const aspect = 16 / 9;
  const fitWidth = media.fit === 'contain' ? Math.min : Math.max;
  const guideWidth = fitWidth(innerWidth, innerHeight * aspect);
  guide.style.width = px(guideWidth);
  guide.style.height = px(guideWidth / aspect);
}

function prepareFrameMedia(
  doc: Document,
  kind: 'image' | 'video',
  assetId: string,
  fit: CardStyle['media']['fit'],
): HTMLImageElement | HTMLVideoElement {
  const source = kind === 'image' ? doc.createElement('img') : doc.createElement('video');
  source.dataset['cgAssetId'] = assetId;
  source.dataset['cgUpcomingMediaSource'] = '';
  Object.assign(source.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    objectFit: fit,
    visibility: 'hidden',
  });
  if (source.tagName === 'VIDEO') {
    const video = source as HTMLVideoElement;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = true;
  } else {
    (source as HTMLImageElement).alt = '';
  }
  return source;
}

function bindFrameMedia(
  media: HTMLImageElement | HTMLVideoElement,
  ready: (value: boolean) => void,
  url: string | undefined,
): void {
  media.addEventListener(media.tagName === 'VIDEO' ? 'loadeddata' : 'load', () => ready(true));
  media.addEventListener('error', () => ready(false));
  media.addEventListener('emptied', () => ready(false));
  if (url) media.src = url;
}

function mountProgramMedia(
  aperture: HTMLElement,
  item: UpcomingProgramsSampleItem,
  fit: CardStyle['media']['fit'],
  assetUrls?: Readonly<Record<string, string>>,
): ((focused: boolean) => void) | undefined {
  const { mediaAssetId, mediaKind, posterAssetId } = item;
  if (mediaAssetId === undefined || mediaKind === undefined) return undefined;
  const doc = aperture.ownerDocument;
  const poster =
    mediaKind === 'video' && posterAssetId !== undefined
      ? prepareFrameMedia(doc, 'image', posterAssetId, fit)
      : undefined;
  let source: HTMLImageElement | HTMLVideoElement | undefined;
  let sourceReady = false;
  let posterReady = false;
  const guide = aperture.querySelector<HTMLElement>('[data-cg-upcoming-media-guide]');
  const paintReadyMedia = (): void => {
    const ready = sourceReady || posterReady;
    if (source !== undefined) source.style.visibility = sourceReady ? '' : 'hidden';
    if (poster !== undefined) poster.style.visibility = posterReady && !sourceReady ? '' : 'hidden';
    if (guide !== null) {
      guide.hidden = ready;
      aperture.style.boxShadow =
        !ready && aperture.style.borderWidth === '0px' ? MEDIA_GUIDE_OUTLINE : '';
    }
  };
  if (poster !== undefined) {
    poster.dataset['cgUpcomingVideoPoster'] = '';
    bindFrameMedia(
      poster,
      (ready) => {
        posterReady = ready;
        paintReadyMedia();
      },
      posterAssetId === undefined
        ? undefined
        : upcomingProgramVisualUrl(doc, posterAssetId, 'image', assetUrls),
    );
    aperture.appendChild(poster);
  }
  return (focused) => {
    if (!focused && source?.tagName === 'VIDEO') (source as HTMLVideoElement).pause();
    if (!focused && poster !== undefined) {
      source?.remove();
      source = undefined;
      sourceReady = false;
      paintReadyMedia();
      return;
    }
    if (source !== undefined) return;
    const nextSource = prepareFrameMedia(doc, mediaKind, mediaAssetId, fit);
    source = nextSource;
    bindFrameMedia(
      nextSource,
      (ready) => {
        if (source !== nextSource) return;
        sourceReady = ready;
        paintReadyMedia();
      },
      upcomingProgramVisualUrl(doc, mediaAssetId, mediaKind, assetUrls),
    );
    aperture.appendChild(nextSource);
  };
}

function maxCardGap(axisLength: number, tracks: number, automatic: boolean): number {
  if (tracks < 2) return Number.POSITIVE_INFINITY;
  // Auto preserves space for content in small cards. A fixed gap is exact while
  // there is space for the cards, bounded by one pixel per slot where possible.
  const occupied = automatic ? axisLength / 2 : Math.min(axisLength, tracks);
  return (axisLength - occupied) / (tracks - 1);
}

function appendSampleAudio(
  card: HTMLElement,
  assetId: string,
  assetUrls?: Readonly<Record<string, string>>,
): HTMLAudioElement {
  const audio = card.ownerDocument.createElement('audio');
  audio.dataset['cgAssetId'] = assetId;
  audio.dataset['cgUpcomingMediaSource'] = '';
  audio.dataset['cgUpcomingSampleAudio'] = '';
  audio.hidden = true;
  audio.preload = 'auto';
  audio.loop = true;
  const url = assetUrls?.[assetId];
  if (url) audio.src = url;
  card.appendChild(audio);
  return audio;
}

export function syncUpcomingProgramsPreviewAudio(stage: HTMLElement, enabled: boolean): void {
  const sounds = Array.from(
    stage.querySelectorAll<HTMLAudioElement>('audio[data-cg-upcoming-sample-audio]'),
  );
  const focused = enabled
    ? sounds.find((audio) => {
        const card = audio.closest(
          `[data-cg-upcoming-playing]:not([aria-hidden="true"]):not(${UPCOMING_BOUNDARY_HIDDEN}) ${FOCUSED_MEDIA_CARD}`,
        );
        return card?.querySelector<HTMLVideoElement>('video')?.paused === false;
      })
    : undefined;
  sounds.forEach((audio) => {
    if (audio !== focused && !audio.paused) audio.pause();
  });
  if (focused?.paused && focused.readyState >= focused.HAVE_CURRENT_DATA) {
    void focused.play().catch(() => undefined);
  }
}

interface UpcomingPage {
  node: HTMLElement;
  transitionFocus?: (id: string) => SequenceInPlaceTransition | undefined;
  createBoundaryMotion?: (kind: SequenceBoundaryKind) => SequenceBoundaryMotion | undefined;
  createPageTurnMotion?: (kind: SequenceBoundaryKind) => SequenceBoundaryMotion;
}

function playablePage(
  { node, transitionFocus, createBoundaryMotion, createPageTurnMotion }: UpcomingPage,
  syncAudio: () => void,
): RenderedSequenceItem {
  const observedSources = new WeakSet<HTMLMediaElement>();
  let active = false;
  const play = (video: HTMLVideoElement): void => {
    if (
      !active ||
      !video.isConnected ||
      node !== node.parentElement?.lastElementChild ||
      node.matches(UPCOMING_BOUNDARY_HIDDEN) ||
      video.closest(FOCUSED_MEDIA_CARD) === null
    ) {
      video.pause();
      return;
    }
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      void video.play().catch(() => undefined);
    }
  };
  const startFocusedMedia = (): void => {
    for (const video of Array.from(node.querySelectorAll<HTMLVideoElement>(PROGRAM_VIDEO))) {
      if (!observedSources.has(video)) {
        observedSources.add(video);
        video.addEventListener('loadeddata', () => play(video));
        video.addEventListener('playing', syncAudio);
        video.addEventListener('pause', syncAudio);
      }
      play(video);
    }
    const audio = node.querySelector<HTMLAudioElement>('audio[data-cg-upcoming-sample-audio]');
    if (audio !== null && !observedSources.has(audio)) {
      observedSources.add(audio);
      audio.addEventListener('loadeddata', syncAudio);
    }
    syncAudio();
  };
  const start = (): void => {
    active = true;
    node.dataset['cgUpcomingPlaying'] = '';
    // Next can paint two pages at once. Silence the outgoing picture before starting the new one.
    node.previousElementSibling
      ?.querySelector<HTMLVideoElement>(`${FOCUSED_CARD} ${PROGRAM_VIDEO}`)
      ?.pause();
    startFocusedMedia();
  };
  const pause = (): void => {
    active = false;
    delete node.dataset['cgUpcomingPlaying'];
    for (const video of Array.from(node.querySelectorAll<HTMLVideoElement>(PROGRAM_VIDEO))) {
      video.pause();
    }
    syncAudio();
  };
  const rendered: RenderedSequenceItem = { node, show: start, pause, resume: start, hide: pause };
  if (transitionFocus !== undefined) {
    rendered.transitionTo = (target) => {
      const effect = transitionFocus(target.id);
      if (effect !== undefined) startFocusedMedia();
      return effect;
    };
  }
  const mediaHidden = (): boolean =>
    node.matches(UPCOMING_BOUNDARY_HIDDEN) ||
    node.querySelector(`${FOCUSED_CARD}${UPCOMING_BOUNDARY_HIDDEN}`) !== null;
  const withMedia = (motion: SequenceBoundaryMotion): SequenceBoundaryMotion => ({
    durationMs: motion.durationMs,
    paint(elapsedMs) {
      const before = mediaHidden();
      motion.paint(elapsedMs);
      if (active && before !== mediaHidden()) startFocusedMedia();
    },
  });
  if (createBoundaryMotion !== undefined) {
    rendered.createBoundaryMotion = (kind) => {
      const motion = createBoundaryMotion(kind);
      return motion === undefined ? undefined : withMedia(motion);
    };
  }
  if (createPageTurnMotion !== undefined) {
    rendered.createPageTurnMotion = (kind) => withMedia(createPageTurnMotion(kind));
  }
  return rendered;
}

export function renderUpcomingProgramsPage(
  doc: Document,
  element: UpcomingProgramsElement,
  items: readonly UpcomingProgramsSampleItem[],
  index = 0,
  assetUrls?: Readonly<Record<string, string>>,
  rehearsal = true,
): HTMLElement {
  return buildUpcomingProgramsPage(doc, element, items, index, assetUrls, rehearsal).node;
}

function buildUpcomingProgramsPage(
  doc: Document,
  element: UpcomingProgramsElement,
  items: readonly UpcomingProgramsSampleItem[],
  index: number,
  assetUrls: Readonly<Record<string, string>> | undefined,
  rehearsal: boolean,
): UpcomingPage {
  const { layout, visibleCards, showAirtime } = element;
  const { w, h } = element.transform.size;
  const style = upcomingProgramsCardStyleOf(element);
  const effects = upcomingProgramsSceneEffectsOf(element);
  const nextPage = upcomingProgramsUsesPagination(element)
    ? upcomingProgramsNextPageEffectOf(element)
    : undefined;
  const staggered = [effects.entrance, effects.exit, nextPage?.entrance, nextPage?.exit].some(
    (effect) => effect !== undefined && effect.edge !== 'none' && effect.stagger !== undefined,
  );
  const carousel = layout === 'carousel' ? style.carousel : undefined;
  const rowAlignment =
    style.verticalAlign === 'top' ? 'start' : style.verticalAlign === 'bottom' ? 'end' : 'center';
  const across = carousel?.focusMovement === 'across';
  const visibleCount = Math.min(visibleCards, items.length);
  const fixedFocusSlot =
    carousel?.focusPosition === 'start'
      ? 0
      : carousel?.focusPosition === 'end'
        ? visibleCount - 1
        : Math.floor(visibleCount / 2);
  const batchStart = across && visibleCount > 0 ? index - (index % visibleCount) : index;
  const focusSlot = across ? index - batchStart : fixedFocusSlot;
  const pageItems =
    layout === 'sequence' || layout === 'single'
      ? items.slice(index, index + 1)
      : carousel !== undefined
        ? across
          ? items.slice(batchStart, batchStart + visibleCount)
          : carouselPageItems(items, index, visibleCount, focusSlot)
        : items.slice(0, visibleCount);
  const cardCount = pageItems.length;

  // Across keeps the same logical slots in the final, potentially short batch.
  const autoColumns =
    carousel === undefined
      ? Math.max(1, Math.min(cardCount, Math.floor(w / 190)))
      : Math.max(1, across ? visibleCount : cardCount);
  const autoRows = Math.max(1, Math.ceil(cardCount / autoColumns));
  const defaultGap = Math.max(4, Math.min(38, w / autoColumns / 7, h / autoRows / 4) / 3);
  const preferredGap = style.gap ?? defaultGap;
  const fixedWidth = style.width === undefined ? undefined : Math.min(style.width, w);
  const columns =
    carousel !== undefined || fixedWidth === undefined
      ? autoColumns
      : Math.max(
          1,
          Math.min(cardCount, Math.floor((w + preferredGap) / (fixedWidth + preferredGap))),
        );
  const rows = Math.max(1, Math.ceil(cardCount / columns));
  const gap = Math.min(
    preferredGap,
    maxCardGap(w, columns, style.gap === undefined),
    maxCardGap(h, rows, style.gap === undefined),
  );
  const usableWidth = w - gap * (columns - 1);
  const tallestScale =
    carousel === undefined
      ? 1
      : Math.max(carousel.focusedScale, visibleCount > 1 ? carousel.unfocusedScale : 0);
  const commonSlotScale = carousel?.allowOverlap
    ? visibleCount > 1
      ? carousel.unfocusedScale
      : tallestScale
    : tallestScale;
  const commonSlots = across || carousel?.allowOverlap === true;
  // Extra room on both sides keeps the largest card inside the graphics frame even at an edge.
  const slotOverhang = commonSlots ? tallestScale - commonSlotScale : 0;
  const widthUnits =
    carousel === undefined || cardCount === 0
      ? columns
      : commonSlots
        ? columns * commonSlotScale + slotOverhang
        : carousel.focusedScale + (cardCount - 1) * carousel.unfocusedScale;
  const rowHeight = (h - gap * (rows - 1)) / rows;
  const cardWidth = Math.min(
    style.width ?? usableWidth / Math.max(columns, widthUnits),
    usableWidth / widthUnits,
  );
  const cardHeight = Math.min(
    style.height ?? rowHeight / Math.max(1, tallestScale),
    rowHeight / tallestScale,
  );
  const horizontalTracks =
    carousel === undefined
      ? `repeat(${String(columns)}, ${fixedWidth === undefined ? 'minmax(0, 1fr)' : px(cardWidth)})`
      : commonSlots
        ? `repeat(${String(columns)}, ${px(cardWidth * commonSlotScale)})`
        : pageItems
            .map((_, i) =>
              px(cardWidth * (i === focusSlot ? carousel.focusedScale : carousel.unfocusedScale)),
            )
            .join(' ');
  const titleSize = Math.max(12, Math.min(32, cardWidth / 8.5, cardHeight / 5));

  const page = doc.createElement('div');
  page.dataset['cgUpcomingPage'] = items[index]?.id ?? '';
  if (across) page.dataset['cgUpcomingGroup'] = pageItems[0]?.id ?? '';
  const layoutDirection = detectDirection(items[0]?.title ?? '') === 'ltr' ? 'ltr' : 'rtl';
  page.dir = layoutDirection;
  Object.assign(page.style, {
    width: '100%',
    height: '100%',
    gridArea: '1 / 1',
    display: 'grid',
    gridTemplateColumns: horizontalTracks,
    gridTemplateRows: `repeat(${String(rows)}, ${style.height === undefined ? 'minmax(0, 1fr)' : px(cardHeight * tallestScale)})`,
    gridGap: px(gap),
    boxSizing: 'border-box',
    paddingLeft: slotOverhang > 0 ? px((cardWidth * slotOverhang) / 2) : '',
    paddingRight: slotOverhang > 0 ? px((cardWidth * slotOverhang) / 2) : '',
    overflow: 'hidden',
  });
  if (layout === 'grid') page.style.alignContent = rowAlignment;

  let focusedCardId = items[index]?.id;
  const cardMotions: UpcomingCardMotion[] = [];
  const cards = new Map<
    string,
    {
      setFocus(focused: boolean): void;
      paintEmphasis(focusAmount: number): void;
    }
  >();
  pageItems.forEach((item, cardIndex) => {
    const initiallyFocused =
      layout === 'single' ||
      layout === 'sequence' ||
      (carousel !== undefined && cardIndex === focusSlot);
    const card = doc.createElement('div');
    const slot = staggered ? doc.createElement('div') : card;
    card.dataset['cgUpcomingCard'] = item.id;
    Object.assign(card.style, {
      position: 'relative',
      boxSizing: 'border-box',
      overflow: 'hidden',
      minWidth: '0',
      minHeight: '0',
      borderRadius: px(style.cornerRadius),
    });
    if (staggered) {
      slot.dataset['cgUpcomingCardClip'] = '';
      Object.assign(slot.style, {
        position: 'relative',
        minWidth: '0',
        minHeight: '0',
        overflow: 'hidden',
      });
      card.style.width = '100%';
      card.style.height = '100%';
      slot.appendChild(card);
      cardMotions.push(upcomingCardMotion(card, { width: cardWidth, height: cardHeight }));
    }
    if (carousel !== undefined) {
      Object.assign(slot.style, {
        alignSelf: rowAlignment,
        justifySelf: 'center',
        width: px(cardWidth),
        height: px(cardHeight),
        transformOrigin: `center ${style.verticalAlign}`,
      });
    } else if (layout === 'grid') {
      slot.style.alignSelf = rowAlignment;
      slot.style.height = '100%';
    }

    const aperture =
      style.media.visible &&
      (rehearsal || (item.mediaAssetId !== undefined && item.mediaKind !== undefined))
        ? createMediaFrame(doc, style.media, rehearsal)
        : undefined;
    const setMediaFocus =
      aperture === undefined
        ? undefined
        : mountProgramMedia(aperture, item, style.media.fit, assetUrls);
    if (aperture !== undefined) {
      card.appendChild(aperture);
    }
    const title = createTextRegion(doc, 'cgUpcomingTitle', item.title, titleSize, layoutDirection);
    card.appendChild(title.node);
    const airtimeValue = item.airtime?.trim();
    const airtime =
      showAirtime && airtimeValue
        ? createTextRegion(
            doc,
            'cgUpcomingAirtime',
            airtimeValue,
            titleSize * 0.72,
            layoutDirection,
          )
        : undefined;
    if (airtime !== undefined) card.appendChild(airtime.node);

    let audio: HTMLAudioElement | undefined;
    const setFocus = (focused: boolean): void => {
      if (focused) {
        card.dataset['cgUpcomingFocus'] = '';
        card.setAttribute('aria-current', 'true');
        if (
          rehearsal &&
          aperture !== undefined &&
          item.mediaKind === 'video' &&
          item.audioAssetId
        ) {
          audio = appendSampleAudio(card, item.audioAssetId, assetUrls);
        }
      } else {
        delete card.dataset['cgUpcomingFocus'];
        card.removeAttribute('aria-current');
        audio?.pause();
        audio?.remove();
        audio = undefined;
      }
      const highlighted = carousel !== undefined && focused;
      const borderWidth = Math.min(
        highlighted ? style.focusedBorderWidth : style.borderWidth,
        cardWidth / 2,
        cardHeight / 2,
      );
      card.style.border = `${px(borderWidth)} solid ${highlighted ? style.focusedBorderColor : style.borderColor}`;
      card.style.backgroundColor = highlighted ? style.focusedBackground : style.background;
      if (carousel?.allowOverlap) slot.style.zIndex = highlighted ? '1' : '0';
      if (aperture !== undefined) {
        sizeMediaFrame(aperture, style.media, {
          width: cardWidth - 2 * borderWidth,
          height: cardHeight - 2 * borderWidth,
        });
      }
      setMediaFocus?.(focused);
      title.applyStyle(highlighted ? style.focusedTitle : style.title);
      airtime?.applyStyle(highlighted ? style.focusedAirtime : style.airtime);
    };
    const paintEmphasis = (focusAmount: number): void => {
      if (carousel === undefined) return;
      const scale =
        carousel.unfocusedScale * (1 - focusAmount) + carousel.focusedScale * focusAmount;
      const opacity =
        carousel.unfocusedOpacity * (1 - focusAmount) + carousel.focusedOpacity * focusAmount;
      slot.style.transform = scale === 1 ? '' : `scale(${String(scale)})`;
      slot.style.opacity = String(opacity);
    };
    setFocus(initiallyFocused);
    paintEmphasis(initiallyFocused ? 1 : 0);
    if (across) cards.set(item.id, { setFocus, paintEmphasis });
    page.appendChild(slot);
  });
  const built: UpcomingPage = { node: page };
  const pageMotion =
    nextPage === undefined ? undefined : upcomingPageMotion(page, { width: w, height: h });
  if (staggered || pageMotion !== undefined) {
    built.createBoundaryMotion = (kind) =>
      createUpcomingCardBoundary(cardMotions, kind, effects[kind]) ??
      (kind === 'exit' && pageMotion !== undefined && effects.exit.edge !== 'none'
        ? createUpcomingPageBoundary(pageMotion, kind, effects.exit)
        : undefined);
  }
  if (nextPage !== undefined && pageMotion !== undefined) {
    built.createPageTurnMotion = (kind) =>
      createUpcomingCardBoundary(cardMotions, kind, nextPage[kind]) ??
      createUpcomingPageBoundary(pageMotion, kind, nextPage[kind]);
  }
  if (!across || carousel === undefined) return built;
  const durationMs = carousel.focusMotionMs;
  return {
    ...built,
    transitionFocus: (id) => {
      if (focusedCardId === undefined || focusedCardId === id) return undefined;
      const outgoing = cards.get(focusedCardId);
      const incoming = cards.get(id);
      if (outgoing === undefined || incoming === undefined) return undefined;
      outgoing.setFocus(false);
      incoming.setFocus(true);
      focusedCardId = id;
      page.dataset['cgUpcomingPage'] = id;
      return {
        durationMs,
        paint: (progress) => {
          const focus = cubicBezierEase(FOCUS_EASE, progress);
          outgoing.paintEmphasis(1 - focus);
          incoming.paintEmphasis(focus);
        },
      };
    },
  };
}

export interface UpcomingProgramsDriver extends SequenceDriver {
  replaceUpcomingItems(items: readonly UpcomingProgramsSampleItem[]): void;
}

export function createUpcomingProgramsDriver(
  host: HTMLElement,
  element: UpcomingProgramsElement,
  initialItems: readonly UpcomingProgramsSampleItem[],
  clock: RuntimeClock | undefined,
  assetUrls: Readonly<Record<string, string>> | undefined,
  syncAudio: () => void,
  compositionOwnsOutro: boolean,
  rehearsal: boolean,
): UpcomingProgramsDriver {
  const paged = upcomingProgramsUsesPagination(element);
  let items = initialItems;
  const pagesOf = (rows: readonly UpcomingProgramsSampleItem[]) =>
    paged ? rows : rows.slice(0, 1);
  let pages = pagesOf(items);
  let indices = new Map(pages.map((item, index) => [item.id, index]));
  const repeat = paged ? upcomingProgramsRepeatOf(element) : 1;
  const advance = () =>
    paged && (pages.length > 1 || repeat !== 'infinite') ? element.advance : 'manual';
  const driverItems = () => pages.map(({ id, title }) => ({ id, text: title }));
  const effects = upcomingProgramsSceneEffectsOf(element);
  let rendered: RenderedSequenceItem | undefined;
  const driver = new SequenceDriver({
    host,
    direction: 'ltr',
    items: driverItems(),
    defaultDwellMs: element.dwellMs,
    advance: advance(),
    ...upcomingProgramsTransitionOf(paged ? element : {}),
    entranceEffect: effects.entrance,
    exitEffect: effects.exit,
    repeat,
    keepVisibleOnComplete: effects.exit.edge === 'none' && (!paged || compositionOwnsOutro),
    renderText: ({ id }) => {
      rendered = playablePage(
        buildUpcomingProgramsPage(
          host.ownerDocument,
          element,
          items,
          indices.get(id) ?? 0,
          assetUrls,
          rehearsal,
        ),
        syncAudio,
      );
      return rendered;
    },
    onItemShown: () => {
      // Both pages are painted during a transition. Only the incoming page owns semantic focus.
      const current = host.lastElementChild;
      for (const page of Array.from(host.children)) {
        if (page === current) continue;
        page.setAttribute('aria-hidden', 'true');
        const focus = page.querySelector(FOCUSED_CARD);
        focus?.removeAttribute('aria-current');
        focus?.removeAttribute('data-cg-upcoming-focus');
      }
      syncAudio();
    },
    onComplete: () => rendered?.pause(),
    clock,
  });
  return Object.assign(driver, {
    replaceUpcomingItems(replacement: readonly UpcomingProgramsSampleItem[]): void {
      items = replacement;
      pages = pagesOf(items);
      indices = new Map(pages.map((item, index) => [item.id, index]));
      rendered = undefined;
      driver.reset(driverItems());
      driver.setAdvance(advance());
    },
  });
}

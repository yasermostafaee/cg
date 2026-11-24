import {
  UpcomingProgramsElementSchema,
  upcomingProgramMediaAssetId,
  upcomingProgramMediaPath,
  withCgControl,
  type Scene,
  type UpcomingProgramsElement,
} from '@cg/shared-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import {
  provideUpcomingProgramMedia,
  upcomingProgramVisualUrl,
} from '../src/upcoming-program-media.js';
import {
  createUpcomingProgramsDriver,
  renderUpcomingProgramsPage,
} from '../src/upcoming-programs.js';
import { lowerThirdScene } from './fixtures.js';

const firstLayer = lowerThirdScene.layers[0]!;
const upcoming = UpcomingProgramsElementSchema.parse({
  ...firstLayer.children[0],
  type: 'upcomingPrograms',
  id: 'upcoming',
  name: 'Upcoming Programs',
  layout: 'single',
  sampleItems: [{ id: 'sample-1', title: 'برنامهٔ آزمایشی', airtime: 'ساعت ۲' }],
});
const scene = {
  ...lowerThirdScene,
  layers: [{ ...firstLayer, children: [upcoming] }],
  fields: [],
  bindings: [],
};

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function contentDrivenScene(overrides: Partial<UpcomingProgramsElement>): Scene {
  const element = UpcomingProgramsElementSchema.parse({
    ...upcoming,
    drivesHold: true,
    layout: 'sequence',
    repeat: 1,
    dwellMs: 400,
    sampleItems: [...upcoming.sampleItems, { id: 'sample-2', title: 'بعدی' }],
    ...overrides,
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 20, value: 1, easing: 'linear' },
            { frame: 50, value: 0, easing: 'linear' },
          ],
        },
      },
    },
  });
  return {
    ...scene,
    layers: [{ ...firstLayer, children: [element] }],
    lifecycle: { contentStart: 0, outPoint: 20 },
    playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 10_000 },
  };
}

function rehearseUpcoming(authored: Scene) {
  vi.useFakeTimers({
    toFake: [
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
    ],
  });
  const events: string[] = [];
  const runtime = createRuntime(authored, {
    mode: 'author',
    showUpcomingProgramsSampleItems: true,
    skipFontLoad: true,
  });
  runtime.on('stop.start', () => events.push('out'));
  runtime.on('stop.end', () => events.push('stopped'));
  return { runtime, events };
}

function currentPage(): HTMLElement | null {
  return document.querySelector('[data-cg-upcoming-page]');
}

function motionCards(): HTMLElement[] {
  return Array.from(
    currentPage()?.querySelectorAll<HTMLElement>('[data-cg-upcoming-card-motion]') ?? [],
  );
}

const stagedRows = [
  { id: 'first', title: 'یک' },
  { id: 'second', title: 'دو' },
  { id: 'third', title: 'سه' },
  { id: 'fourth', title: 'چهار' },
  { id: 'last', title: 'پنج' },
];

describe('Upcoming Programs staged Next', () => {
  it('clears all old cards in RTL logical order, then enters the new group and services a queued hop', async () => {
    const { runtime } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'carousel',
        visibleCards: 2,
        advance: 'manual',
        sampleItems: stagedRows,
        cardStyle: { carousel: { focusMovement: 'across', focusMotionMs: 0 } },
        nextPageEffect: {
          exit: {
            edge: 'fade',
            durationMs: 200,
            stagger: { delayMs: 120, order: 'last-to-first' },
          },
          entrance: {
            edge: 'fade',
            durationMs: 100,
            stagger: { delayMs: 180, order: 'first-to-last' },
          },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(32);
    const old = currentPage();
    const [first, second] = motionCards();
    expect(old?.dir).toBe('rtl');
    await runtime.next?.();
    expect(currentPage()).toBe(old);
    expect(old?.dataset['cgUpcomingPage']).toBe('second');

    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(currentPage()).toBe(old);
    expect(first?.style.opacity).toBe('');
    expect(Number(second?.style.opacity)).toBeGreaterThan(0);
    expect(Number(second?.style.opacity)).toBeLessThan(1);
    expect(document.querySelector('[data-cg-upcoming-page="third"]')).toBeNull();
    await runtime.next?.();
    runtime.pause?.();
    const frozen = second?.style.opacity;
    await vi.advanceTimersByTimeAsync(600);
    expect(second?.style.opacity).toBe(frozen);
    runtime.resume?.();
    await vi.advanceTimersByTimeAsync(245);
    expect(old?.isConnected).toBe(false);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('third');
    const [third, fourth] = motionCards();
    expect(Number(third?.style.opacity)).toBeGreaterThan(0);
    expect(Number(third?.style.opacity)).toBeLessThan(1);
    expect(fourth?.style.visibility).toBe('hidden');
    expect(document.querySelectorAll('[data-cg-upcoming-page]')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(290);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('fourth');
    expect(fourth?.style.opacity).toBe('');

    await runtime.next?.();
    // The partial tail needs only one entrance duration, not two slot delays.
    await vi.advanceTimersByTimeAsync(450);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('last');
    expect(motionCards()).toHaveLength(1);
    expect(motionCards()[0]?.style.opacity).toBe('');
    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('[data-cg-upcoming-page="first"]')).toBeNull();
    runtime.remove();
  });

  it('cuts outgoing and begins a Together entrance without using the old Next effect', async () => {
    const { runtime } = rehearseUpcoming(
      contentDrivenScene({
        advance: 'manual',
        transitionIn: 'left',
        nextPageEffect: {
          exit: { edge: 'none', durationMs: 5000 },
          entrance: { edge: 'fade', durationMs: 200 },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(32);
    const old = currentPage();
    await runtime.next?.();
    const entering = currentPage();
    expect(old?.isConnected).toBe(false);
    expect(entering?.dataset['cgUpcomingPage']).toBe('sample-2');
    expect(entering?.style.opacity).toBe('0');
    expect(entering?.style.transform).toBe('');
    await vi.advanceTimersByTimeAsync(230);
    expect(entering?.style.opacity).toBe('');
    runtime.remove();
  });

  it('pauses outgoing video before exit and waits for the incoming focused card to be visible', async () => {
    const playing = new Set<HTMLMediaElement>();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playing.add(this);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playing.delete(this);
    });
    const sample = (id: string) => ({
      id,
      title: id,
      mediaKind: 'video' as const,
      mediaAssetId: id,
    });
    const { runtime } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'carousel',
        visibleCards: 2,
        advance: 'manual',
        sampleItems: [
          { id: 'first', title: 'one' },
          sample('old'),
          sample('new'),
          { id: 'fourth', title: 'four' },
        ],
        cardStyle: {
          media: { visible: true },
          carousel: { focusMovement: 'across', focusMotionMs: 0 },
        },
        nextPageEffect: {
          exit: { edge: 'fade', durationMs: 150 },
          entrance: {
            edge: 'fade',
            durationMs: 100,
            stagger: { delayMs: 250, order: 'last-to-first' },
          },
        },
      }),
    );
    const focusedVideo = (): HTMLVideoElement => {
      const video = currentPage()?.querySelector<HTMLVideoElement>(
        '[data-cg-upcoming-focus] video',
      );
      if (video === null || video === undefined) throw new Error('Missing focused video');
      Object.defineProperty(video, 'HAVE_CURRENT_DATA', { value: 2 });
      video.dispatchEvent(new Event('loadeddata'));
      return video;
    };
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(32);
    await runtime.next?.();
    const old = focusedVideo();
    expect(playing).toEqual(new Set([old]));
    await runtime.next?.();
    expect(playing.size).toBe(0);
    await vi.advanceTimersByTimeAsync(190);
    const incoming = focusedVideo();
    expect(incoming).not.toBe(old);
    expect(old.isConnected).toBe(false);
    old.dispatchEvent(new Event('loadeddata'));
    expect(playing.size).toBe(0);
    await vi.advanceTimersByTimeAsync(260);
    expect(playing).toEqual(new Set([incoming]));
    runtime.remove();
  });

  it('keeps the partial old Together pose through Out and cancels a pending page on Quick Stop', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({
        advance: 'manual',
        repeat: 'infinite',
        exitEffect: { edge: 'fade-left', durationMs: 200 },
        nextPageEffect: {
          exit: { edge: 'left', durationMs: 800 },
          entrance: { edge: 'none' },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(32);
    const old = currentPage();
    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(260);
    const partial = old?.style.transform;
    expect(partial).toMatch(/^translate\(-/);
    const out = runtime.out();
    expect(old?.style.transform).toBe(partial);
    await vi.advanceTimersByTimeAsync(850);
    await out;
    expect(currentPage()).toBe(old);
    expect(events).toContain('out');
    expect(document.querySelector('[data-cg-upcoming-page="sample-2"]')).toBeNull();

    await runtime.play({});
    await vi.advanceTimersByTimeAsync(32);
    expect(currentPage()).not.toBe(old);
    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(180);
    await runtime.stop();
    await vi.advanceTimersByTimeAsync(950);
    expect(document.querySelector('[data-cg-upcoming-page="sample-2"]')).toBeNull();
    runtime.remove();
  });
});

describe('Upcoming Programs on the Take wire', () => {
  it('resolves hash media only from the Bridge route or its dedicated Preview host', () => {
    const preview = document.implementation.createHTMLDocument();
    Object.defineProperty(preview, 'URL', { value: 'about:srcdoc' });
    const sha = 'a'.repeat(64);
    const id = upcomingProgramMediaAssetId(sha);
    provideUpcomingProgramMedia(sha, 'https://untrusted.invalid/video.webm', preview);
    expect(upcomingProgramVisualUrl(preview, id, 'video', undefined)).toBeUndefined();
    const local = 'data:video/webm;base64,AQIDBA==';
    provideUpcomingProgramMedia(sha, local, preview);
    expect(upcomingProgramVisualUrl(preview, id, 'video', undefined)).toBe(local);
    expect(upcomingProgramVisualUrl(preview, id, 'image', undefined)).toBeUndefined();
    expect(upcomingProgramVisualUrl(document, id, 'video', undefined)).toBe(
      upcomingProgramMediaPath(sha),
    );
    expect(upcomingProgramVisualUrl(document, 'toString', 'image', {})).toBeUndefined();
  });

  it('populates an empty published template and replaces its active data only on Play', async () => {
    const element = UpcomingProgramsElementSchema.parse({
      ...upcoming,
      layout: 'sequence',
      advance: 'manual',
      cardStyle: { media: { visible: true } },
    });
    const hashes = { video: 'a'.repeat(64), poster: 'b'.repeat(64) };
    const first = [
      {
        id: 'same-program',
        title: 'شروع 22',
        airtime: 'ساعت ۲۲',
        mediaKind: 'video' as const,
        mediaAssetId: upcomingProgramMediaAssetId(hashes.video),
        posterAssetId: upcomingProgramMediaAssetId(hashes.poster),
      },
      { id: 'next-program', title: 'برنامهٔ بعد' },
    ];
    const draft = [{ id: 'same-program', title: 'ویرایش در انتظار Take' }];
    const runtime = createRuntime(
      { ...scene, layers: [{ ...firstLayer, children: [element] }] },
      { mode: 'output', skipFontLoad: true },
    );
    expect(currentPage()).toBeNull();
    await runtime.update(withCgControl({}, { upcomingPrograms: { upcoming: first } }));
    expect(currentPage()).toBeNull();
    await runtime.play({});
    expect(currentPage()?.textContent).toContain('شروع 22');
    expect(currentPage()?.querySelector('video')?.getAttribute('src')).toBe(
      upcomingProgramMediaPath(hashes.video),
    );
    expect(
      currentPage()?.querySelector('[data-cg-upcoming-video-poster]')?.getAttribute('src'),
    ).toBe(upcomingProgramMediaPath(hashes.poster));

    await runtime.update(withCgControl({}, { upcomingPrograms: { upcoming: draft } }));
    expect(currentPage()?.textContent).toContain('شروع 22');
    await runtime.next?.();
    expect(currentPage()?.textContent).toContain('برنامهٔ بعد');
    await runtime.update(
      withCgControl({}, { take: 'second-take', upcomingPrograms: { upcoming: draft } }),
    );
    expect(currentPage()?.textContent).toContain('برنامهٔ بعد');
    await runtime.play({});
    expect(currentPage()?.textContent).toContain('ویرایش در انتظار Take');

    await runtime.play(withCgControl({}, { upcomingPrograms: {} }));
    expect(currentPage()).toBeNull();
    runtime.remove();
  });

  it('keeps a newly populated graphic in authored Content-driven Hold until its last step', async () => {
    vi.useFakeTimers({
      toFake: [
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
      ],
    });
    const authored = contentDrivenScene({ sampleItems: [], advance: 'manual' });
    const runtime = createRuntime(authored, { mode: 'output', skipFontLoad: true });
    const out = vi.fn();
    runtime.on('stop.start', out);
    await runtime.play(
      withCgControl({}, { upcomingPrograms: { upcoming: [{ id: 'one', title: 'Premiere' }] } }),
    );
    await vi.advanceTimersByTimeAsync(11000);
    expect(out).not.toHaveBeenCalled();
    expect(currentPage()?.textContent).toBe('Premiere');
    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toHaveBeenCalledOnce();
    runtime.remove();
  });
});

describe('Upcoming Programs card layout', () => {
  const items = [
    { id: 'first', title: 'برنامهٔ اول', airtime: '۲۰:۱۵' },
    { id: 'second', title: 'برنامهٔ دوم', airtime: '22:30' },
    { id: 'third', title: 'برنامهٔ سوم', airtime: '۲۳:۰۰' },
    { id: 'fourth', title: 'برنامهٔ چهارم', airtime: '۰۰:۱۵' },
  ];

  it('applies the fixed gap to Grid slot selection and the scaled Carousel tracks', () => {
    const element: UpcomingProgramsElement = {
      ...upcoming,
      layout: 'grid',
      visibleCards: 4,
      transform: { ...upcoming.transform, size: { w: 320, h: 200 } },
      cardStyle: { width: 100, gap: 0 },
    };
    const compact = renderUpcomingProgramsPage(document, element, items);
    expect(compact.style.gridGap).toBe('0px');
    expect(compact.style.gridTemplateColumns).toBe('repeat(3, 100px)');
    const spaced = renderUpcomingProgramsPage(
      document,
      { ...element, cardStyle: { ...element.cardStyle, gap: 30 } },
      items,
    );
    expect(spaced.style.gridGap).toBe('30px');
    expect(spaced.style.gridTemplateColumns).toBe('repeat(2, 100px)');

    const carousel = renderUpcomingProgramsPage(
      document,
      {
        ...element,
        layout: 'carousel',
        visibleCards: 3,
        cardStyle: { width: 100, gap: 15, carousel: { focusedScale: 1.25, unfocusedScale: 0.75 } },
      },
      items,
    );
    expect(carousel.style.gridGap).toBe('15px');
    expect(carousel.style.gridTemplateColumns).toBe('75px 125px 75px');
  });

  it('contains an independent media border and removes the placeholder outline for loaded media', () => {
    const element: UpcomingProgramsElement = {
      ...upcoming,
      cardStyle: {
        width: 400,
        height: 100,
        borderWidth: 0,
        media: {
          visible: true,
          rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.6 },
          fit: 'contain',
          borderWidth: 200,
          borderColor: '#D5A018',
          backgroundColor: '#336699',
          cornerRadius: 7,
        },
      },
    };
    const photo = { ...items[0]!, mediaAssetId: 'poster', mediaKind: 'image' } as const;
    const page = renderUpcomingProgramsPage(document, element, [photo]);
    const media = page.querySelector<HTMLElement>('[data-cg-upcoming-media]');
    expect(media?.style.boxSizing).toBe('border-box');
    expect(media?.style.width).toBe('50%');
    expect(media?.style.height).toBe('60%');
    expect(media?.style.borderWidth).toBe('30px');
    expect(media?.style.borderRadius).toBe('7px');
    expect(media?.style.overflow).toBe('hidden');

    const borderless = renderUpcomingProgramsPage(
      document,
      {
        ...element,
        cardStyle: { ...element.cardStyle, media: { ...element.cardStyle?.media, borderWidth: 0 } },
      },
      [photo],
    );
    const defaultFrame = borderless.querySelector<HTMLElement>('[data-cg-upcoming-media]');
    expect(defaultFrame?.style.boxShadow).toContain('inset');
    defaultFrame?.querySelector('img')?.dispatchEvent(new Event('load'));
    expect(defaultFrame?.style.boxShadow).toBe('');
    expect(defaultFrame?.querySelector<HTMLElement>('[data-cg-upcoming-media-guide]')?.hidden).toBe(
      true,
    );
  });

  it.each([
    {
      focusPosition: 'start',
      first: ['first', 'second', 'third'],
      last: ['fourth', 'first', 'second'],
      slot: 0,
    },
    {
      focusPosition: 'center',
      first: ['fourth', 'first', 'second'],
      last: ['third', 'fourth', 'first'],
      slot: 1,
    },
    {
      focusPosition: 'end',
      first: ['third', 'fourth', 'first'],
      last: ['second', 'third', 'fourth'],
      slot: 2,
    },
  ] as const)(
    'keeps $focusPosition focused at the first and last program',
    ({ focusPosition, first, last, slot }) => {
      const element = {
        ...upcoming,
        layout: 'carousel' as const,
        visibleCards: 3,
        cardStyle: { carousel: { focusPosition } },
      };
      for (const [index, expected] of [
        [0, first],
        [3, last],
      ] as const) {
        const page = renderUpcomingProgramsPage(document, element, items, index);
        const cards = Array.from(page.querySelectorAll<HTMLElement>('[data-cg-upcoming-card]'));
        expect(page.dir).toBe('rtl');
        expect(cards.map((card) => card.dataset['cgUpcomingCard'])).toEqual(expected);
        expect(page.querySelector('[aria-current="true"]')).toBe(cards[slot]);
      }
    },
  );

  it('keeps numeric airtime aligned to the layout and isolates explicit content direction', () => {
    const element: UpcomingProgramsElement = {
      ...upcoming,
      layout: 'carousel',
      cardStyle: {
        airtime: { align: 'start', direction: 'auto' },
        focusedTitle: { fontWeight: 800 },
        focusedAirtime: { direction: 'ltr', fontSize: 24, color: '#FAD400' },
        carousel: { focusedScale: 1.25, unfocusedScale: 0.8, unfocusedOpacity: 0.6 },
      },
    };
    const page = renderUpcomingProgramsPage(document, element, items);
    const focus = page.querySelector<HTMLElement>('[aria-current="true"]');
    const base = page.querySelector<HTMLElement>('[data-cg-upcoming-card="second"]');
    const focusedTime = focus?.querySelector<HTMLElement>('[data-cg-upcoming-airtime]');
    const normalTime = base?.querySelector<HTMLElement>('[data-cg-upcoming-airtime]');
    expect(focusedTime?.textContent).toBe('۲۰:۱۵');
    expect(normalTime?.textContent).toBe('22:30');
    expect(focusedTime?.dir).toBe('rtl');
    expect(normalTime?.dir).toBe('rtl');
    expect(focusedTime?.style.textAlign).toBe('start');
    expect(normalTime?.style.textAlign).toBe('start');
    expect(normalTime?.style.fontVariantNumeric).toBe('tabular-nums');
    expect(focusedTime?.querySelector('bdi')?.dir).toBe('ltr');
    expect(normalTime?.querySelector('bdi')?.dir).toBe('auto');
    expect(focusedTime?.style.fontSize).toBe('24px');
    expect(focus?.querySelector<HTMLElement>('[data-cg-upcoming-title]')?.style.fontWeight).toBe(
      '800',
    );
    expect(focus?.style.transform).toBe('scale(1.25)');
    expect(base?.style.transform).toBe('scale(0.8)');
    expect(base?.style.opacity).toBe('0.6');
  });

  it.each([
    ['top', 'start'],
    ['center', 'center'],
    ['bottom', 'end'],
  ] as const)(
    'aligns Carousel scaling and fixed Grid tracks at the %s',
    (verticalAlign, alignment) => {
      const element: UpcomingProgramsElement = {
        ...upcoming,
        layout: 'carousel',
        visibleCards: 2,
        cardStyle: {
          height: 60,
          verticalAlign,
          carousel: {
            focusMovement: 'across',
            allowOverlap: true,
            focusedScale: 1.4,
            unfocusedScale: 0.8,
          },
        },
      };
      const carousel = renderUpcomingProgramsPage(document, element, items);
      for (const card of Array.from(
        carousel.querySelectorAll<HTMLElement>('[data-cg-upcoming-card]'),
      )) {
        expect(card.style.alignSelf).toBe(alignment);
        expect(card.style.transformOrigin).toBe(`center ${verticalAlign}`);
      }
      const grid = renderUpcomingProgramsPage(document, { ...element, layout: 'grid' }, items);
      expect(grid.style.alignContent).toBe(alignment);
      expect(grid.querySelector<HTMLElement>('[data-cg-upcoming-card]')?.style.height).toBe('100%');
      const legacyGrid = renderUpcomingProgramsPage(
        document,
        { ...element, layout: 'grid', cardStyle: { height: 60 } },
        items,
      );
      expect(legacyGrid.style.alignContent).toBe('start');
    },
  );

  it('moves focus through fixed slot nodes on active time and applies Next between groups', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const element: UpcomingProgramsElement = {
      ...upcoming,
      layout: 'carousel',
      visibleCards: 3,
      advance: 'manual',
      transitionIn: 'right',
      transitionOut: 'left',
      transitionMs: 500,
      transform: { ...upcoming.transform, size: { w: 450, h: 200 } },
      cardStyle: {
        width: 120,
        gap: 0,
        title: { digits: 'persian', direction: 'rtl' },
        airtime: { digits: 'arabic-indic' },
        focusedTitle: { digits: 'latin', direction: 'ltr' },
        carousel: {
          focusMovement: 'across',
          allowOverlap: true,
          focusMotionMs: 250,
          focusedScale: 1.5,
          unfocusedScale: 0.75,
          unfocusedOpacity: 0.5,
        },
      },
    };
    const rows = items.map((item) => ({ ...item, title: `${item.title} ١٦` }));
    const host = document.createElement('div');
    Object.assign(host.style, { width: '450px', height: '200px' });
    document.body.appendChild(host);
    const driver = createUpcomingProgramsDriver(
      host,
      element,
      rows,
      undefined,
      undefined,
      () => undefined,
      false,
      true,
    );
    driver.start();
    const group = host.querySelector<HTMLElement>('[data-cg-upcoming-group="first"]')!;
    const cards = Array.from(group.querySelectorAll<HTMLElement>('[data-cg-upcoming-card]'));
    const [first, second, third] = cards;
    const focused = () => group.querySelector('[data-cg-upcoming-focus]');
    const titleValue = (card: HTMLElement | undefined) =>
      card?.querySelector<HTMLElement>('[data-cg-upcoming-title] bdi');
    expect(focused()).toBe(first);
    expect(group.dir).toBe('rtl');
    expect(group.style.gridTemplateColumns).toBe('repeat(3, 90px)');
    expect(group.style.paddingLeft).toBe('45px');
    expect(group.style.paddingRight).toBe('45px');
    expect(titleValue(first)?.textContent).toContain('16');
    expect(titleValue(second)?.textContent).toContain('۱۶');
    expect(titleValue(first)?.dir).toBe('ltr');
    expect(titleValue(second)?.dir).toBe('rtl');
    expect(second?.querySelector('[data-cg-upcoming-airtime]')?.textContent).toBe('٢٢:٣٠');

    driver.next();
    await vi.advanceTimersByTimeAsync(112);
    expect(focused()).toBe(second);
    expect(group.style.transform).toBe('');
    expect(second?.style.zIndex).toBe('1');
    expect(first?.style.zIndex).toBe('0');
    expect(titleValue(first)?.textContent).toContain('۱۶');
    expect(titleValue(second)?.textContent).toContain('16');
    expect(second?.querySelector('[data-cg-upcoming-airtime]')?.textContent).toBe('٢٢:٣٠');
    const midwayOpacity = Number(second?.style.opacity);
    expect(midwayOpacity).toBeGreaterThan(0.5);
    expect(midwayOpacity).toBeLessThan(1);
    driver.next();
    driver.pause();
    await vi.advanceTimersByTimeAsync(500);
    expect(Number(second?.style.opacity)).toBe(midwayOpacity);
    expect(focused()).toBe(second);
    driver.resume();
    await vi.advanceTimersByTimeAsync(420);
    expect(focused()).toBe(third);
    expect(third?.style.transform).toBe('scale(1.5)');
    expect(host.firstElementChild).toBe(group);
    expect(Array.from(group.children)).toEqual(cards);

    driver.next();
    const tail = host.querySelector<HTMLElement>('[data-cg-upcoming-group="fourth"]');
    expect(host.children).toHaveLength(2);
    expect(tail?.style.transform).toBe('translate(450px, 0px)');
    expect(tail?.style.gridTemplateColumns).toBe(group.style.gridTemplateColumns);
    expect(tail?.querySelectorAll('[data-cg-upcoming-card]')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(520);
    expect(host.firstElementChild).toBe(tail);
    expect(host.children).toHaveLength(1);
    driver.destroy();
  });
});

describe('Upcoming Programs authoring samples', () => {
  it('paints samples only in a Designer surface that explicitly enables them', async () => {
    const preview = createRuntime(scene, {
      mode: 'author',
      showUpcomingProgramsSampleItems: true,
      skipFontLoad: true,
    });
    expect(document.querySelector('[data-cg-upcoming-card]')?.textContent).toContain(
      'برنامهٔ آزمایشی',
    );
    preview.remove();

    const controlPreview = createRuntime(scene, { mode: 'author', skipFontLoad: true });
    expect(document.querySelector('[data-cg-upcoming-card]')).toBeNull();
    controlPreview.remove();

    const output = createRuntime(scene, {
      mode: 'output',
      showUpcomingProgramsSampleItems: true,
      skipFontLoad: true,
    });
    await output.play({});
    expect(document.querySelector('[data-cg-upcoming-card]')).toBeNull();
    output.remove();
  });

  it.each(['author', 'output'] as const)(
    'renders and pages an explicitly prepared visual list in %s without test guides or audition',
    async (mode) => {
      const element = UpcomingProgramsElementSchema.parse({
        ...upcoming,
        dataSource: 'prepared',
        layout: 'sequence',
        advance: 'manual',
        cardStyle: { media: { visible: true } },
        sampleItems: [
          {
            id: 'prepared-1',
            title: 'Prepared 20:15',
            mediaAssetId: 'clip',
            mediaKind: 'video',
            audioAssetId: 'sound',
          },
          { id: 'prepared-2', title: 'Prepared Next' },
        ],
      });
      const runtime = createRuntime(
        { ...scene, layers: [{ ...firstLayer, children: [element] }] },
        {
          mode,
          skipFontLoad: true,
          assetUrls: { clip: 'assets/clip.webm', sound: 'assets/sound.wav' },
        },
      );
      await runtime.play({});
      expect(currentPage()?.textContent).toBe('Prepared 20:15');
      const video = currentPage()?.querySelector<HTMLVideoElement>('video');
      expect(video?.getAttribute('src')).toBe('assets/clip.webm');
      expect(video?.muted).toBe(true);
      expect(currentPage()?.querySelector('audio')).toBeNull();
      expect(currentPage()?.querySelector('[data-cg-upcoming-media-guide]')).toBeNull();
      await runtime.next?.();
      expect(currentPage()?.textContent).toBe('Prepared Next');
      expect(currentPage()?.querySelector('[data-cg-upcoming-media]')).toBeNull();
      runtime.remove();
    },
  );

  it.each([
    ['author', 'fixed'],
    ['output', 'fixed'],
    ['author', 'across'],
    ['output', 'across'],
  ] as const)(
    'plays only the active Carousel video and uses posters elsewhere in %s (%s)',
    async (mode, focusMovement) => {
      const playing = new Set<HTMLMediaElement>();
      let peak = 0;
      vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
        this: HTMLMediaElement,
      ) {
        playing.add(this);
        peak = Math.max(peak, playing.size);
        return Promise.resolve();
      });
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
        this: HTMLMediaElement,
      ) {
        playing.delete(this);
      });
      const decode = (video: HTMLVideoElement | null | undefined): void => {
        if (video === null || video === undefined) throw new Error('Expected a video');
        // Happy DOM omits the native constant used by the browser's readiness check.
        Object.defineProperty(video, 'HAVE_CURRENT_DATA', { value: 2 });
        video.dispatchEvent(new Event('loadeddata'));
      };
      const element = UpcomingProgramsElementSchema.parse({
        ...upcoming,
        dataSource: 'prepared',
        layout: 'carousel',
        visibleCards: 2,
        advance: 'manual',
        transitionIn: 'right',
        transitionMs: 500,
        cardStyle: { media: { visible: true }, carousel: { focusMovement, focusMotionMs: 0 } },
        sampleItems: [
          { id: 'first', title: 'Legacy', mediaAssetId: 'legacy', mediaKind: 'video' },
          {
            id: 'second',
            title: 'With poster',
            mediaAssetId: 'clip',
            mediaKind: 'video',
            posterAssetId: 'poster',
          },
        ],
      });
      const options = {
        mode,
        showUpcomingProgramsSampleItems: mode === 'author',
        skipFontLoad: true,
        assetUrls: {
          legacy: '/assets/legacy.webm',
          clip: '/assets/clip.webm',
          poster: '/assets/poster.png',
        },
      };
      const runtime = createRuntime(
        { ...scene, layers: [{ ...firstLayer, children: [element] }] },
        options,
      );
      await runtime.play({});
      const outgoingCard = currentPage()?.querySelector('[data-cg-upcoming-card="first"]');
      const outgoingVideo = outgoingCard?.querySelector('video');
      const posterCard = currentPage()?.querySelector('[data-cg-upcoming-card="second"]');
      decode(outgoingVideo);
      expect(playing).toEqual(new Set([outgoingVideo]));
      expect(posterCard?.querySelector('video')).toBeNull();
      expect(
        posterCard?.querySelector('[data-cg-upcoming-video-poster]')?.getAttribute('src'),
      ).toBe('/assets/poster.png');

      await runtime.next?.();
      const latest = document.querySelector('[data-cg-upcoming-page="second"]');
      const incomingVideo = latest?.querySelector<HTMLVideoElement>(
        '[data-cg-upcoming-focus] video',
      );
      const incomingPoster = latest?.querySelector<HTMLElement>('[data-cg-upcoming-video-poster]');
      expect(playing.size).toBe(0);
      outgoingVideo?.dispatchEvent(new Event('loadeddata'));
      latest
        ?.querySelector('[data-cg-upcoming-card="first"] video')
        ?.dispatchEvent(new Event('loadeddata'));
      expect(playing.size).toBe(0);
      incomingPoster?.dispatchEvent(new Event('load'));
      expect(incomingPoster?.style.visibility).toBe('');
      decode(incomingVideo);
      expect(playing).toEqual(new Set([incomingVideo]));
      expect(peak).toBe(1);
      expect(incomingPoster?.style.visibility).toBe('hidden');
      if (focusMovement === 'across') {
        expect(latest?.querySelector('[data-cg-upcoming-card="first"]')).toBe(outgoingCard);
        await runtime.previous?.();
        expect(incomingVideo?.isConnected).toBe(false);
        expect(posterCard?.querySelector('[data-cg-upcoming-video-poster]')).toBe(incomingPoster);
        expect(incomingPoster?.style.visibility).toBe('');
        incomingVideo?.dispatchEvent(new Event('loadeddata'));
        expect(playing).toEqual(new Set([outgoingVideo]));
        expect(peak).toBe(1);
      }
      runtime.remove();
      expect(playing.size).toBe(0);

      const grid = createRuntime(
        { ...scene, layers: [{ ...firstLayer, children: [{ ...element, layout: 'grid' }] }] },
        options,
      );
      await grid.play({});
      currentPage()?.querySelector('video')?.dispatchEvent(new Event('loadeddata'));
      expect(currentPage()?.querySelectorAll('[data-cg-upcoming-video-poster]')).toHaveLength(1);
      expect(playing.size).toBe(0);
      grid.remove();
    },
  );

  it('keeps whole-page entrance and explicit Out independent of the Next effect', async () => {
    const authored = contentDrivenScene({
      layout: 'carousel',
      advance: 'manual',
      repeat: 'infinite',
      entranceEffect: { edge: 'left', durationMs: 500 },
      transitionIn: 'right',
      transitionOut: 'none',
      transitionMs: 120,
      exitEffect: { edge: 'fade', durationMs: 700 },
    });
    const { runtime, events } = rehearseUpcoming(authored);
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(175);
    expect(currentPage()?.style.transform).toMatch(/^translate\(-/);
    expect(currentPage()?.querySelectorAll('[data-cg-upcoming-card]')).toHaveLength(2);
    expect(motionCards()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(currentPage()?.style.transform).toBe('');

    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(50);
    const incoming = document.querySelector<HTMLElement>('[data-cg-upcoming-page="sample-2"]');
    expect(incoming?.style.transform).toMatch(/^translate\(\d/);
    await vi.advanceTimersByTimeAsync(120);
    expect(currentPage()).toBe(incoming);
    expect(incoming?.style.transform).toBe('');

    const out = runtime.out();
    await vi.advanceTimersByTimeAsync(350);
    expect(events).toEqual([]);
    expect(Number(incoming?.style.opacity)).toBeGreaterThan(0);
    expect(Number(incoming?.style.opacity)).toBeLessThan(1);
    await vi.advanceTimersByTimeAsync(1100);
    await out;
    expect(events).toEqual(['out', 'stopped']);
    runtime.remove();
  });

  it('stages the first Entrance and reverse Exit card by card while Next remains independent', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'carousel',
        visibleCards: 3,
        advance: 'manual',
        repeat: 'infinite',
        cardStyle: { carousel: { focusMovement: 'across', focusMotionMs: 0 } },
        sampleItems: [
          { id: 'first', title: 'یک' },
          { id: 'second', title: 'دو' },
          { id: 'third', title: 'سه' },
        ],
        entranceEffect: {
          edge: 'fade',
          durationMs: 120,
          stagger: { delayMs: 180, order: 'first-to-last' },
        },
        exitEffect: {
          edge: 'left',
          durationMs: 160,
          stagger: { delayMs: 220, order: 'last-to-first' },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(85);
    const page = currentPage();
    const [first, second, third] = motionCards();
    expect(Number(first?.style.opacity)).toBeGreaterThan(0);
    expect(Number(first?.style.opacity)).toBeLessThan(1);
    expect(second?.style.visibility).toBe('hidden');
    expect(third?.style.visibility).toBe('hidden');
    expect(page?.style.opacity).toBe('');
    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(180);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('first');
    expect(first?.style.opacity).toBe('');
    expect(Number(second?.style.opacity)).toBeGreaterThan(0);
    expect(Number(second?.style.opacity)).toBeLessThan(1);
    expect(third?.style.visibility).toBe('hidden');
    await vi.advanceTimersByTimeAsync(275);
    expect(currentPage()).toBe(page);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('second');
    expect(motionCards()).toEqual([first, second, third]);
    expect(motionCards().map((card) => card.style.visibility)).toEqual(['', '', '']);

    const out = runtime.out();
    await vi.advanceTimersByTimeAsync(100);
    expect(third?.style.transform).toMatch(/^translate\(-/);
    expect(first?.style.transform).toBe('');
    expect(second?.style.transform).toBe('');
    await vi.advanceTimersByTimeAsync(330);
    expect(third?.style.visibility).toBe('hidden');
    expect(second?.style.visibility).toBe('hidden');
    expect(first?.style.visibility).toBe('');
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(250);
    await out;
    expect(first?.style.visibility).toBe('hidden');
    expect(events).toEqual(['out']);
    runtime.remove();
  });

  it('slides only the cards already in view when Out interrupts a staggered Entrance', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'grid',
        entranceEffect: {
          edge: 'left',
          durationMs: 300,
          stagger: { delayMs: 4000, order: 'first-to-last' },
        },
        exitEffect: {
          edge: 'right',
          durationMs: 160,
          stagger: { delayMs: 4000, order: 'last-to-first' },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(140);
    const [first, second] = motionCards();
    expect(first?.style.transform).toMatch(/^translate\(-/);
    expect(second?.style.visibility).toBe('hidden');
    const out = runtime.out();
    expect(first?.style.transform).toMatch(/^translate\(-/);
    expect(second?.style.visibility).toBe('hidden');
    await vi.advanceTimersByTimeAsync(510);
    await out;
    expect(events).toContain('out');
    expect(second?.style.visibility).toBe('hidden');

    await runtime.play({});
    await vi.advanceTimersByTimeAsync(130);
    const fresh = motionCards();
    expect(fresh[0]).not.toBe(first);
    expect(fresh[1]?.style.visibility).toBe('hidden');
    await runtime.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(fresh[1]?.style.visibility).toBe('hidden');
    runtime.remove();
  });

  it('keeps a delayed focused video parked until its staggered card is visible', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    const { runtime } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'carousel',
        visibleCards: 2,
        advance: 'manual',
        repeat: 'infinite',
        cardStyle: { media: { visible: true }, carousel: { focusPosition: 'start' } },
        sampleItems: [
          { id: 'video', title: 'Video', mediaKind: 'video', mediaAssetId: 'clip' },
          { id: 'still', title: 'Still' },
        ],
        entranceEffect: {
          edge: 'fade',
          durationMs: 120,
          stagger: { delayMs: 220, order: 'last-to-first' },
        },
      }),
    );
    await runtime.play({});
    const video = currentPage()?.querySelector('video');
    if (video === null || video === undefined) throw new Error('Expected a focused video');
    Object.defineProperty(video, 'HAVE_CURRENT_DATA', { value: 2 });
    video.dispatchEvent(new Event('loadeddata'));
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(260);
    expect(play).toHaveBeenCalledOnce();
    runtime.remove();
  });

  it('finishes the last staggered card before content-driven composition Outro', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({
        layout: 'grid',
        dwellMs: 100,
        exitEffect: {
          edge: 'fade',
          durationMs: 160,
          stagger: { delayMs: 500, order: 'last-to-first' },
        },
      }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(770);
    const [first, last] = motionCards();
    expect(first?.style.visibility).toBe('');
    expect(last?.style.visibility).toBe('hidden');
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(550);
    expect(first?.style.visibility).toBe('hidden');
    expect(events).toEqual(['out']);
    runtime.remove();
  });

  it('completes the optional finite exit once before the authored graphic Outro', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({ exitEffect: { edge: 'fade', durationMs: 600 } }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('sample-2');
    expect(Number(currentPage()?.style.opacity)).toBeGreaterThan(0);
    expect(Number(currentPage()?.style.opacity)).toBeLessThan(1);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(currentPage()?.style.visibility).toBe('hidden');
    expect(events).toEqual(['out']);
    await vi.advanceTimersByTimeAsync(700);
    expect(events).toEqual(['out', 'stopped']);
    runtime.remove();
  });

  it('cuts a long optional exit on Quick Stop and lets the normal frame Outro run', async () => {
    const { runtime, events } = rehearseUpcoming(
      contentDrivenScene({ repeat: 'infinite', exitEffect: { edge: 'fade', durationMs: 5000 } }),
    );
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(600);
    const resolved = vi.fn();
    void runtime.stop().then(resolved);
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toHaveBeenCalledOnce();
    expect(events).toEqual(['out']);
    const host = document.querySelector<HTMLElement>('[data-cg-upcoming-layout]');
    expect(Number(host?.style.opacity)).toBeGreaterThan(0);
    expect(Number(host?.style.opacity)).toBeLessThan(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(events).toEqual(['out', 'stopped']);
    runtime.remove();
  });

  it('manual finite page completion plays the authored composition outro with the last card', async () => {
    const { runtime, events } = rehearseUpcoming(contentDrivenScene({ advance: 'manual' }));
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual([]);

    await runtime.next?.();
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('sample-2');
    expect(events).toEqual([]);

    await runtime.next?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toEqual(['out']);
    expect(currentPage()?.style.visibility).not.toBe('hidden');
    const host = document.querySelector<HTMLElement>('[data-cg-upcoming-layout]');
    expect(Number(host?.style.opacity)).toBeGreaterThan(0);
    expect(Number(host?.style.opacity)).toBeLessThan(1);

    await vi.advanceTimersByTimeAsync(750);
    expect(events).toEqual(['out', 'stopped']);
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(500);
    expect(events).toEqual(['out', 'stopped']);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('sample-1');
    runtime.remove();
  });

  it('automatically finishes a finite carousel and keeps an infinite carousel until explicit Out', async () => {
    const finite = rehearseUpcoming(contentDrivenScene({ layout: 'carousel', advance: 'auto' }));
    await finite.runtime.play({});
    await vi.advanceTimersByTimeAsync(600);
    expect(finite.events).toEqual([]);
    expect(currentPage()?.dataset['cgUpcomingPage']).toBe('sample-2');
    await vi.advanceTimersByTimeAsync(1000);
    expect(finite.events).toEqual(['out', 'stopped']);
    finite.runtime.remove();

    const infinite = rehearseUpcoming(
      contentDrivenScene({ layout: 'carousel', repeat: 'infinite' }),
    );
    await infinite.runtime.play({});
    await vi.advanceTimersByTimeAsync(3000);
    expect(infinite.events).toEqual([]);
    const out = infinite.runtime.out();
    await vi.advanceTimersByTimeAsync(1200);
    await out;
    expect(infinite.events).toEqual(['out', 'stopped']);
    infinite.runtime.remove();
  });

  it.each(['single', 'grid'] as const)(
    'ends one opted-in static dwell for %s and ignores Next',
    async (layout) => {
      const { runtime, events } = rehearseUpcoming(contentDrivenScene({ layout, dwellMs: 1200 }));
      await runtime.play({});
      await vi.advanceTimersByTimeAsync(500);
      await runtime.next?.();
      expect(events).toEqual([]);
      expect(currentPage()?.dataset['cgUpcomingPage']).toBe('sample-1');
      await vi.advanceTimersByTimeAsync(1900);
      expect(events).toEqual(['out', 'stopped']);
      runtime.remove();
    },
  );

  it('waits for the last enabled driver and the composition Exit delay', async () => {
    const authored = contentDrivenScene({ advance: 'auto' });
    const later: UpcomingProgramsElement = {
      ...upcoming,
      id: 'later',
      dwellMs: 1200,
      drivesHold: true,
    };
    const { runtime, events } = rehearseUpcoming({
      ...authored,
      layers: authored.layers.map((layer) => ({ ...layer, children: [...layer.children, later] })),
      playout: { mode: 'auto-out', holdSource: 'content-driven', contentEndDelayMs: 400 },
    });
    await runtime.play({});
    await vi.advanceTimersByTimeAsync(1750);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(400);
    expect(events).toEqual(['out']);
    runtime.remove();
  });

  it('uses the ordinary timed fallback when an opted-in list has no test data', async () => {
    const { runtime, events } = rehearseUpcoming({
      ...contentDrivenScene({ sampleItems: [], repeat: 'infinite' }),
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 250 },
    });
    await runtime.play({});
    expect(currentPage()).toBeNull();
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(450);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(events).toEqual(['out']);
    runtime.remove();
  });

  it('preserves the visibility of static cards during an authored intro when hold is disabled', async () => {
    vi.useFakeTimers();
    const runtime = createRuntime(
      {
        ...contentDrivenScene({ layout: 'grid', drivesHold: false }),
        lifecycle: { contentStart: 12, outPoint: 20 },
      },
      { mode: 'author', showUpcomingProgramsSampleItems: true, skipFontLoad: true },
    );
    await runtime.play({});
    const host = document.querySelector<HTMLElement>('[data-cg-upcoming-layout]');
    expect(host?.style.display).toBe('grid');
    expect(host?.querySelectorAll('[data-cg-upcoming-card]')).toHaveLength(2);
    runtime.remove();
  });
});

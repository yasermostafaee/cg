import {
  FieldValuesSchema,
  stripCgControl,
  type Element,
  type NestedFieldValues,
  type Scene,
} from '@cg/shared-schema';
import { applyScopedFieldValues } from './bindings.js';
import { buildScene } from './scene-builder.js';
import { fitSequenceTextInk } from './sequence-text-ink.js';
import { fitAllText } from './text-fit.js';

export interface ManagedStaticStage {
  readonly active: boolean;
  applyState(value: unknown): Promise<void>;
}

interface StageOptions {
  readonly stage: HTMLElement;
  readonly ready: Promise<void>;
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly skipFontLoad?: boolean;
  readonly canApply: () => boolean;
  readonly applyAssetUrls: (stage: HTMLElement, urls?: Readonly<Record<string, string>>) => void;
}

function snapshotOf(
  value: unknown,
  pageCount: number,
): { visibility: 'shown' | 'stopped'; data: NestedFieldValues; page: number } {
  if (value === null || typeof value !== 'object')
    throw new Error('Invalid managed graphic state.');
  const state = value as Record<string, unknown>;
  const { revision, graphicInstanceId, visibility, page, resumeWithoutReplay } = state;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof graphicInstanceId !== 'string' ||
    graphicInstanceId === '' ||
    (visibility !== 'shown' && visibility !== 'stopped') ||
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page >= pageCount ||
    resumeWithoutReplay !== true
  ) {
    throw new Error(
      pageCount === 1
        ? 'Managed graphic state requires a resumable static page.'
        : 'Managed graphic state has an invalid sequence page.',
    );
  }
  const data = FieldValuesSchema.parse(state['data'] === undefined ? {} : state['data']);
  return { visibility, data: stripCgControl(data) as NestedFieldValues, page };
}

function sceneAtPage(scene: Scene, page: number): Scene {
  if (page === 0) return scene;

  function selectPage(element: Element): Element {
    if (element.type === 'container')
      return { ...element, children: element.children.map(selectPage) };
    if (element.type !== 'sequence') return element;
    const item = element.items[page];
    if (item === undefined) throw new Error('Managed graphic sequence page is unavailable.');
    // The scene builder already renders the first item at rest, using the shared sequence
    // text and image renderers. Select the requested item before building the candidate DOM.
    return { ...element, items: [item] };
  }

  return {
    ...scene,
    layers: scene.layers.map((layer) => ({ ...layer, children: layer.children.map(selectPage) })),
  };
}

async function waitForImages(stage: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(stage.querySelectorAll<HTMLImageElement>('img[data-cg-asset-id]')).map(
      async (img) => {
        if (img.getAttribute('src') === null)
          throw new Error('A managed graphic image is missing.');
        await img.decode();
      },
    ),
  );
}

async function waitForStageFonts(stage: HTMLElement): Promise<void> {
  const { fonts } = stage.ownerDocument;
  if (fonts === undefined) return;
  const text = Array.from(stage.querySelectorAll<HTMLElement>('[data-cg-element-id]'));
  await Promise.all(
    text.flatMap((node) => {
      const { fontFamily, fontSize, fontWeight, fontStyle } = node.style;
      if (fontFamily === '' || node.textContent === '') return [];
      return [
        fonts.load([fontStyle, fontWeight, fontSize, fontFamily].join(' '), node.textContent ?? ''),
      ];
    }),
  );
  await fonts.ready;
}

/**
 * Core owns the mixer transform and animation origin. The static page stages absolute field
 * values on an unpainted DOM, then publishes the complete pose in a single browser task.
 */
export function createManagedStaticStage(
  scene: Scene,
  pageCount: number,
  options: StageOptions,
): ManagedStaticStage {
  const { stage, ready, assetUrls, skipFontLoad, canApply, applyAssetUrls } = options;
  const doc = stage.ownerDocument;
  let active = false;
  let last = Promise.resolve();

  async function apply(snapshot: ReturnType<typeof snapshotOf>): Promise<void> {
    await ready;
    const parent = stage.parentNode;
    if (!canApply() || parent === null) throw new Error('Managed graphic page is unavailable.');

    const candidate = buildScene(sceneAtPage(scene, snapshot.page), doc);
    applyAssetUrls(candidate.container, assetUrls);
    applyScopedFieldValues(scene, scene, snapshot.data, candidate.scopeTree, assetUrls);
    candidate.container.style.position = 'absolute';
    candidate.container.style.opacity = '0';
    candidate.container.style.pointerEvents = 'none';
    parent.appendChild(candidate.container);
    try {
      await Promise.all([
        waitForImages(candidate.container),
        skipFontLoad ? Promise.resolve() : waitForStageFonts(candidate.container),
      ]);
      if (!canApply() || stage.parentNode !== parent)
        throw new Error('Managed graphic page is unavailable.');
      fitAllText(candidate.container);
      candidate.container
        .querySelectorAll<HTMLElement>('[data-cg-sequence-text]')
        .forEach(fitSequenceTextInk);
      // Keep the existing stage element and its output placement. One synchronous DOM task
      // replaces all children, so intermediate or asset-less states are never painted.
      while (stage.firstChild !== null) stage.removeChild(stage.firstChild);
      while (candidate.container.firstChild !== null)
        stage.appendChild(candidate.container.firstChild);
      doc.body.classList.toggle('cg-pending', snapshot.visibility === 'stopped');
      active = true;
    } finally {
      candidate.container.remove();
    }
  }

  return {
    get active() {
      return active;
    },
    async applyState(value) {
      const snapshot = snapshotOf(value, pageCount);
      const applying = last.then(() => apply(snapshot));
      last = applying.catch(() => undefined);
      await applying;
    },
  };
}

import {
  FieldValuesSchema,
  stripCgControl,
  type NestedFieldValues,
  type Scene,
} from '@cg/shared-schema';
import { applyScopedFieldValues } from './bindings.js';
import { buildScene } from './scene-builder.js';
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

function snapshotOf(value: unknown): { visibility: 'shown' | 'stopped'; data: NestedFieldValues } {
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
    page !== 0 ||
    resumeWithoutReplay !== true
  ) {
    throw new Error('Managed graphic state requires a resumable static page.');
  }
  const data = FieldValuesSchema.parse(state['data'] === undefined ? {} : state['data']);
  return { visibility, data: stripCgControl(data) as NestedFieldValues };
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
export function createManagedStaticStage(scene: Scene, options: StageOptions): ManagedStaticStage {
  const { stage, ready, assetUrls, skipFontLoad, canApply, applyAssetUrls } = options;
  const doc = stage.ownerDocument;
  let active = false;
  let last = Promise.resolve();

  async function apply(snapshot: ReturnType<typeof snapshotOf>): Promise<void> {
    await ready;
    const parent = stage.parentNode;
    if (!canApply() || parent === null) throw new Error('Managed graphic page is unavailable.');

    const candidate = buildScene(scene, doc);
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
      const snapshot = snapshotOf(value);
      const applying = last.then(() => apply(snapshot));
      last = applying.catch(() => undefined);
      await applying;
    },
  };
}

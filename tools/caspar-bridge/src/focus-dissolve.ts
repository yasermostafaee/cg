import { sceneFromRetainedPage } from '@cg/shared-ipc';
import {
  controlLiveLayoutFrameAttachments,
  HexColorSchema,
  ShapeElementSchema,
  type ControlLiveLayout,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import { z } from 'zod';
import type { PageStore } from './page-store.js';
import type { NormalizedRect } from './live-layers.js';

export const FOCUS_NORMALIZE_FIELDS = 30_000;

// A picture or nested scene can contain animation even when the enclosing VCG has
// one frame. Only known, unbound, solid native shapes can safely be rendered twice.
const stillShape = ShapeElementSchema.pick({
  id: true,
  name: true,
  type: true,
  shape: true,
  transform: true,
  visible: true,
  locked: true,
  opacity: true,
  zIndex: true,
  liveForeground: true,
})
  .extend({
    shape: z.enum(['rect', 'rounded-rect', 'ellipse']),
    fill: z.object({ kind: z.literal('solid'), color: HexColorSchema }).strict(),
  })
  .strict();

const stillComposition = z
  .object({
    id: z.string(),
    name: z.string(),
    resolution: z.object({ width: z.number().positive(), height: z.number().positive() }).strict(),
    frameRange: z.object({ in: z.literal(0), out: z.literal(1) }).strict(),
    editorBackdrop: z.literal('transparent').optional(),
    layers: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            visible: z.boolean(),
            locked: z.boolean(),
            blendMode: z.literal('normal').optional(),
            children: z.array(stillShape).min(1).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

function staticFocusImports(html: string): ReadonlySet<string> {
  const scene = sceneFromRetainedPage(html, 384 * 1024);
  const parsed = z
    .object({
      schemaVersion: z.literal(1),
      compositions: z.array(z.unknown()).max(256),
    })
    .safeParse(scene);
  const still = new Set<string>();
  const seen = new Set<string>();
  if (parsed.success)
    for (const comp of parsed.data.compositions) {
      if (
        typeof comp !== 'object' ||
        comp === null ||
        !('id' in comp) ||
        typeof comp.id !== 'string'
      )
        continue;
      const source = /^frame-art-([0-9a-f]{64})$/.exec(comp.id)?.[1];
      if (source === undefined) continue;
      if (seen.has(source)) still.delete(source);
      else if (stillComposition.safeParse(comp).success) still.add(source);
      seen.add(source);
    }
  return still;
}

/** Cache only small classification sets for immutable held versions, never the page or its assets. */
export class FocusImportSurfaces {
  readonly #byVersion = new Map<string, ReadonlySet<string>>();

  canUseSeparateMatte(
    version: string,
    layout: Pick<ControlLiveLayout, 'frameAttachments'>,
    looks: readonly {
      preset: Pick<ControlLiveLayoutPreset, 'frameAttachments'>;
      frameId: string;
    }[],
    readPage: () => string | null,
  ): boolean {
    const attachments = looks.flatMap(({ preset, frameId }) =>
      controlLiveLayoutFrameAttachments(layout, preset, frameId),
    );
    if (attachments.length === 0) return true;
    let still = this.#byVersion.get(version);
    if (still === undefined) {
      const html = readPage();
      if (html === null) return false;
      still = staticFocusImports(html);
      this.#byVersion.set(version, still);
      if (this.#byVersion.size > 16) this.#byVersion.delete(this.#byVersion.keys().next().value!);
    }
    return attachments.every(({ sourceId }) => still.has(sourceId));
  }
}

export interface FocusSurfaceSlot {
  readonly channel: number;
  readonly layer: number;
}

export interface FocusDissolvePlate {
  readonly picture: FocusSurfaceSlot;
  readonly artwork: FocusSurfaceSlot;
  readonly matte: FocusSurfaceSlot;
  readonly group: FocusSurfaceSlot;
  readonly normalized: FocusSurfaceSlot;
  readonly blackUri: string;
}

export interface FocusDissolveSurface {
  readonly fields: number;
  readonly slot: FocusSurfaceSlot;
  readonly outgoing: FocusSurfaceSlot;
  readonly incoming: FocusSurfaceSlot;
  readonly plates?: readonly FocusDissolvePlate[];
}

// A transparent draw frame consumes the native key without altering picture alpha.
// Its scoped PNG URL identifies this STING in the engine's foreground INFO.
const BLACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAD0lEQVR4nGNgGAWjgAoAAAJJAAHZX3+dAAAAAElFTkSuQmCC',
  'base64',
);

export async function focusBlackUri(pages: PageStore, template: string): Promise<URL | undefined> {
  const result = await pages.put(BLACK_PNG, 'Focus composite black');
  if (!result.ok) return undefined;
  const path = pages.pathOf(result.page.sha256);
  return path === null ? undefined : new URL(path, template);
}

// Layer routes sample the raw producer before its ordinary seat's mixer fit.
// A staged compound can replace the whole picture only for this same aperture.
export function isFullFocusFit(fit: { fill: NormalizedRect; clip: NormalizedRect }): boolean {
  return [fit.fill, fit.clip].every(
    (rect) =>
      Math.abs(rect.x) < 1e-6 &&
      Math.abs(rect.y) < 1e-6 &&
      Math.abs(rect.width - 1) < 1e-6 &&
      Math.abs(rect.height - 1) < 1e-6,
  );
}

/** Allocate the graph in source order so that a same-channel route samples
 * this field's producer. No slot is committed unless both graphs are complete. */
export function planFocusDissolve(
  inputs: readonly { picture: FocusSurfaceSlot; artwork: FocusSurfaceSlot }[],
  free: readonly FocusSurfaceSlot[],
  uri: URL,
  take: string,
  fields: number,
): FocusDissolveSurface | undefined {
  if (inputs.length !== 2) return undefined;
  const slots = [...free].sort((a, b) => a.layer - b.layer);
  const claim = (above = 0) => {
    const index = slots.findIndex((slot) => slot.layer > above);
    return index < 0 ? undefined : slots.splice(index, 1)[0];
  };
  const inputsAtDepth = inputs
    .map((input, index) => ({ ...input, index }))
    .sort(
      (a, b) =>
        Math.max(a.picture.layer, a.artwork.layer) - Math.max(b.picture.layer, b.artwork.layer),
    );
  const plates: FocusDissolvePlate[] = [];
  for (const input of inputsAtDepth) {
    const matte = claim();
    if (!matte) return undefined;
    const group = claim(Math.max(input.artwork.layer, input.picture.layer, matte.layer));
    if (!group) return undefined;
    const normalized = claim(group.layer);
    if (!normalized) return undefined;
    const target = new URL(uri);
    target.searchParams.set('cgfocus', take + '/' + input.index);
    plates[input.index] = { ...input, matte, group, normalized, blackUri: target.href };
  }
  const slot = slots.findLast((slot) =>
    plates.every((plate) => slot.layer > plate.normalized.layer),
  );
  if (!slot) return undefined;
  return { slot, fields, outgoing: plates[0]!.normalized, incoming: plates[1]!.normalized, plates };
}

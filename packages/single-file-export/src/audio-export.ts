import type { Element, Scene } from '@cg/shared-schema';
import { resolveVideoAsset, type VideoAssetSource } from './video-export.js';

/**
 * `D-165` — the SOUND-asset seam for the export paths (`.vcg` packaging + single-file HTML
 * inlining), mirroring `video-export.ts`: one place collects which sound assets an export needs.
 * A sound is referenced by `<audio src>` exactly as a video is by `<video src>` — the exporters
 * bake `assetId → url` into the `assetUrls` map (single file: a base64 `data:audio/wav` URI;
 * `.vcg`: the packaged `assets/audio/<sha>.wav`), and the runtime's asset-src walk wires it. The
 * bytes are the STORED WAV verbatim.
 */

/** A sound element reference found in a scene. */
export interface AudioRef {
  readonly elementId: string;
  readonly assetId: string;
}

/**
 * Every audio element in a scene — the main scene AND all compositions, recursing containers.
 * Deduped by element id. The single source of "which sound assets does this export need".
 */
export function collectAudioElements(scene: Scene): AudioRef[] {
  const out: AudioRef[] = [];
  const seen = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'audio') {
        if (!seen.has(el.id)) {
          seen.add(el.id);
          out.push({ elementId: el.id, assetId: el.assetId });
        }
      } else if (el.type === 'container') {
        walk(el.children);
      }
    }
  };
  for (const layer of scene.layers) walk(layer.children);
  for (const comp of scene.compositions ?? []) {
    for (const layer of comp.layers) walk(layer.children);
  }
  return out;
}

/** The MIME of a stored sound: always WAV — the one form the import stores. */
export function audioMimeOf(_filename: string): string {
  return 'audio/wav';
}

/** The asset-byte source a sound resolves from: the same contract as a video's. */
export type AudioAssetSource = VideoAssetSource;

/** Resolve one sound's stored bytes + metadata — the same resolution a video uses. */
export const resolveAudioAsset = resolveVideoAsset;

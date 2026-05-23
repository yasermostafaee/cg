import { EventEmitter } from 'node:events';
import type { Scene, FieldValues } from '@cg/shared-schema';
import { PreviewFs, type PreviewFsOptions } from './preview-fs.js';

/**
 * PreviewService — owns the cgpreview:// virtual FS + the live-preview
 * coordination between the Designer's Inspector and the iframe.
 *
 * - `loadScene(scene)` swaps the active scene; the renderer's iframe
 *   then `src=cgpreview://<sceneId>/index.html`.
 * - `pushFieldUpdate(fields)` is fired by the Inspector when a field
 *   changes. The Designer's renderer process receives the same event
 *   via the `preview.update` IPC channel and uses postMessage to drop
 *   the values into the iframe (the iframe's bootstrap script listens
 *   for those messages and calls `window.update`).
 *
 * Wire-protocol parity: the iframe runs the same `@cg/template-runtime`
 * that ships inside `.vcg` files, so what the Designer shows IS what
 * the Runtime will play.
 */
export interface PreviewServiceEvents {
  ready: [info: { sceneId: string }];
  'field-update': [info: { fields: FieldValues }];
}

export type PreviewServiceOptions = PreviewFsOptions;

export class PreviewService extends EventEmitter<PreviewServiceEvents> {
  readonly fs: PreviewFs;
  private lastFields: FieldValues = {};

  constructor(options: PreviewServiceOptions) {
    super();
    this.fs = new PreviewFs(options);
  }

  /** Switch the active scene; returns the URL the renderer's iframe should load. */
  loadScene(scene: Scene): string {
    this.fs.setActive(scene);
    this.lastFields = {};
    return `cgpreview://${scene.id}/index.html`;
  }

  /** Inform the Designer renderer of a field update; the renderer relays via postMessage. */
  pushFieldUpdate(fields: FieldValues): void {
    this.lastFields = { ...this.lastFields, ...fields };
    this.emit('field-update', { fields });
  }

  /** Last-known field values applied to the preview. Useful for an Inspector restore. */
  get fields(): FieldValues {
    return { ...this.lastFields };
  }

  /** Mark the iframe as ready — called when it posts `cg-preview-ready`. */
  markReady(sceneId: string): void {
    this.emit('ready', { sceneId });
  }

  /** Drop the active scene (e.g. on project close). */
  clear(): void {
    this.fs.clear();
    this.lastFields = {};
  }
}

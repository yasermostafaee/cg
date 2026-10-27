import type { DynamicField, FieldValue, NestedFieldValues } from '@cg/shared-schema';

/**
 * Session-only file bytes selected while authoring. The template deliberately stores only the
 * Bridge-relative path; this store lets every Designer surface (canvas, inspector and Preview)
 * agree on the current file without embedding its contents in the project.
 */
export interface DesignerFileSourcePreview {
  readonly sceneId: string;
  readonly fieldId: string;
  readonly bridgePath: string;
  readonly displayPath: string;
  readonly content: string;
  readonly value: FieldValue;
}

const previews = new Map<string, DesignerFileSourcePreview>();
const openPreviewRequests = new Set<string>();
const fixedFileIntents = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function keyOf(sceneId: string, fieldId: string): string {
  return `${sceneId}\u0000${fieldId}`;
}

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function designerFileSourcePreviewsVersion(): number {
  return version;
}

export function subscribeDesignerFileSourcePreviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDesignerFileSourcePreview(preview: DesignerFileSourcePreview): void {
  previews.set(keyOf(preview.sceneId, preview.fieldId), preview);
  emit();
}

export function clearDesignerFileSourcePreview(sceneId: string, fieldId: string): void {
  const key = keyOf(sceneId, fieldId);
  const previewChanged = previews.delete(key);
  const requestChanged = openPreviewRequests.delete(key);
  if (previewChanged || requestChanged) emit();
}

export function requestDesignerFileSourcePreviewOpen(sceneId: string, fieldId: string): void {
  const size = openPreviewRequests.size;
  openPreviewRequests.add(keyOf(sceneId, fieldId));
  if (openPreviewRequests.size !== size) emit();
}

export function dismissDesignerFileSourcePreview(sceneId: string, fieldId: string): void {
  if (openPreviewRequests.delete(keyOf(sceneId, fieldId))) emit();
}

export function isDesignerFileSourcePreviewOpen(sceneId: string, fieldId: string): boolean {
  return openPreviewRequests.has(keyOf(sceneId, fieldId));
}

/** Session-only authoring intent while the fixed source is enabled but no file is chosen yet. */
export function setDesignerFixedFileIntent(
  sceneId: string,
  elementId: string,
  enabled: boolean,
): void {
  const key = keyOf(sceneId, elementId);
  const changed = enabled ? !fixedFileIntents.has(key) : fixedFileIntents.has(key);
  if (!changed) return;
  if (enabled) fixedFileIntents.add(key);
  else fixedFileIntents.delete(key);
  emit();
}

export function isDesignerFixedFileIntent(sceneId: string, elementId: string): boolean {
  return fixedFileIntents.has(keyOf(sceneId, elementId));
}

export function getDesignerFileSourcePreview(
  sceneId: string,
  fieldId: string,
  bridgePath?: string,
): DesignerFileSourcePreview | null {
  const preview = previews.get(keyOf(sceneId, fieldId));
  if (preview === undefined) return null;
  return bridgePath === undefined || preview.bridgePath === bridgePath ? preview : null;
}

/** Overlay the root composition's selected-file values onto authored defaults. */
export function applyDesignerFileSourcePreviews(
  sceneId: string,
  fields: readonly DynamicField[],
  defaults: NestedFieldValues,
): NestedFieldValues {
  let next = defaults;
  for (const field of fields) {
    const bridgePath = 'fileSource' in field ? field.fileSource?.bridgePath : undefined;
    if (bridgePath === undefined) continue;
    const preview = getDesignerFileSourcePreview(sceneId, field.id, bridgePath);
    if (preview === null) continue;
    if (next === defaults) next = { ...defaults };
    next[field.id] = preview.value;
  }
  return next;
}

/** Tests only: session state must never leak between cases. */
export function resetDesignerFileSourcePreviewsForTest(): void {
  if (previews.size === 0 && openPreviewRequests.size === 0 && fixedFileIntents.size === 0) return;
  previews.clear();
  openPreviewRequests.clear();
  fixedFileIntents.clear();
  emit();
}

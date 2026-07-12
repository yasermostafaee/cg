import type { Position } from '@cg/shared-schema';

/**
 * R-011 — the manifest default on-air position per template, recorded by the
 * Library at `.vcg` import (the ONE moment the app holds the unpacked
 * scene). The Inspector's position picker seeds from it; `TemplateInfo`
 * deliberately does not carry it. Display-only residual: a template imported
 * by a PREVIOUS page session lists from the bridge registry without its
 * scene, so the picker seeds from the centered fallback — the APPLIED
 * default is always correct regardless (the on-air runtime reads it from
 * the scene inside the served HTML).
 */
const defaults = new Map<string, Position>();

/** The centered fallback — matches the on-air runtime's own fallback. */
export const CENTERED: Position = { anchor: 'center', offset: { x: 0, y: 0 } };

export function recordDefaultPosition(templateId: string, position: Position | undefined): void {
  if (position === undefined) defaults.delete(templateId);
  else defaults.set(templateId, position);
}

/** The template's manifest default, or the centered fallback. */
export function defaultPositionOf(templateId: string): Position {
  return defaults.get(templateId) ?? CENTERED;
}

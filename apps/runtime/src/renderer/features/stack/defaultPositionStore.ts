import type { Position, StackItemState } from '@cg/shared-schema';

/**
 * R-011 — a local fallback for templates whose catalogue record has no authored
 * placement. Current imports carry the default in the template's channel-scoped
 * Live Source metadata, including when the template has no live plates.
 */
const defaults = new Map<string, Position>();

/** The centered fallback — matches the on-air runtime's own fallback. */
export const CENTERED: Position = { anchor: 'center', offset: { x: 0, y: 0 } };

export function recordDefaultPosition(templateId: string, position: Position | undefined): void {
  if (position === undefined) defaults.delete(templateId);
  else defaults.set(templateId, position);
}

/** The template's manifest default, or the centered fallback. */
export function defaultPositionOf(templateId: string, authored?: Position): Position {
  return authored ?? defaults.get(templateId) ?? CENTERED;
}

export function appliedPositionOf(
  item: Pick<StackItemState, 'templateId' | 'position'>,
  authored?: Position,
): Position {
  return item.position ?? defaultPositionOf(item.templateId, authored);
}

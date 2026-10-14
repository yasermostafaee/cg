/**
 * `R-100` — **WHERE A PAGE TURN LANDS.** The one rule for Next, Previous and Go to on a page list,
 * 0-based in and out:
 *
 * - a BOOK (`wrap: false`) stops at its ends — Next on the last page and Previous on the first stay;
 * - a WRAPPING list (`repeat: 'infinite'`) wraps both ways;
 * - Go to takes the operator's 1-based page number and clamps it to the book.
 *
 * Pure, so the bridge's verb and its tests read the same arithmetic.
 */
export type PageTurn = 'next' | 'previous' | number;

/** One page of a page list as the bridge reads it: an operator picture, or an authored one. */
export interface PageRef {
  media?: string;
  assetId?: string;
  name?: string;
}

/**
 * The pages of a page-list VALUE, one ref per item so indices stay aligned with the page's own
 * sequence (an item that is not a picture is an empty ref). Defensive: a value from a console of
 * another build is read, never trusted.
 */
export function pageRefsOf(raw: unknown): PageRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v): PageRef => {
    if (v === null || typeof v !== 'object') return {};
    const o = v as Record<string, unknown>;
    if (o['kind'] !== 'image') return {};
    return {
      ...(typeof o['media'] === 'string' && /^[0-9a-f]{64}$/.test(o['media'])
        ? { media: o['media'] }
        : {}),
      ...(typeof o['assetId'] === 'string' ? { assetId: o['assetId'] } : {}),
      ...(typeof o['name'] === 'string' ? { name: o['name'] } : {}),
    };
  });
}

export function pageTarget(current: number, count: number, wrap: boolean, to: PageTurn): number {
  if (count <= 0) return 0;
  const at = Math.max(0, Math.min(count - 1, current));
  if (to === 'next') return at + 1 < count ? at + 1 : wrap ? 0 : at;
  if (to === 'previous') return at > 0 ? at - 1 : wrap ? count - 1 : 0;
  return Math.max(0, Math.min(count - 1, Math.floor(to) - 1));
}

import type { TemplatePageRefusal } from '@cg/shared-ipc';

/**
 * 🔴 `RELEASE-091-01` §1 (`B-288`) — **THE PAGE PVW RENDERS, AND WHERE IT CAME FROM.**
 *
 * PVW used to read only the page THIS browser had imported (`LibraryStore`: OPFS, one profile, one
 * origin), so a template imported on another machine, in another browser or on another channel could
 * not be rehearsed until it was re-imported here. The bridge already holds every page and serves it to
 * CasparCG; PVW now asks it first (`templates.page`) and falls back to the browser's copy only when
 * the bridge cannot be reached at all.
 *
 * - `page` — the HTML to render, and whether it is the bridge's (the page CasparCG gets) or this
 *   browser's own copy (the fallback);
 * - `missing` — why nothing can be drawn: the channel's list does not hold the template
 *   (`not-listed`), the bridge holds no file for its version (`no-file`), or the bridge cannot be
 *   reached and this browser holds no copy (`unreachable`).
 */
export type PvwPage =
  | { readonly kind: 'page'; readonly html: string; readonly source: 'bridge' | 'local' }
  | { readonly kind: 'missing'; readonly reason: TemplatePageRefusal | 'unreachable' };

/** What the bridge said when asked for a page — or that it could not be asked. */
export type BridgePageAnswer =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly reason: TemplatePageRefusal }
  | 'unreachable';

/**
 * 🔴 **THE ONE DECISION: the bridge first; this browser's copy only when the bridge cannot be
 * reached.** A bridge that ANSWERS is believed, including when it answers that it holds no page — the
 * local copy is never shown instead, because it may be another version than the one on air, and a
 * rehearsal of the wrong page is worse than a line saying there is none.
 */
export function pvwPageSource(bridge: BridgePageAnswer, local: string | null): PvwPage {
  if (bridge !== 'unreachable') {
    return bridge.ok
      ? { kind: 'page', html: bridge.html, source: 'bridge' }
      : { kind: 'missing', reason: bridge.reason };
  }
  return local !== null
    ? { kind: 'page', html: local, source: 'local' }
    : { kind: 'missing', reason: 'unreachable' };
}

import { TEXT_FIT_MIN_SCALE, type TextElement } from '@cg/shared-schema';

/**
 * 🔴 `TEXT-FIT-01` (`B-147`) — **SHRINK-TO-FIT: the text shrinks until the RENDERED text fits its box.**
 *
 * `fitMode: 'shrink-to-fit'` keeps the authored box and makes the FONT smaller — from its authored
 * size down to {@link TEXT_FIT_MIN_SCALE} of it — until the laid-out text fits. Letter spacing is in
 * `em`, so it shrinks with the font. Past the minimum, the element's `overflow` decides: `clip` hides
 * what spills, `ellipsis` ends a one-line text with `…` (a wrapping or vertically-aligned box clips,
 * because CSS can only ellipsise a single line of a block box).
 *
 * ── MEASURED, NEVER COUNTED ──────────────────────────────────────────────────
 *
 * Whether the text fits is decided from the BROWSER'S LAYOUT of the shaped run — `scrollWidth` /
 * `scrollHeight` against the box's `clientWidth` / `clientHeight` — never from a character count.
 * Persian joins: contextual forms and ligatures make a run's width something other than the sum of
 * its letters, so a rule that counts works for Latin and fails on air with the next guest's name.
 *
 * ── WHEN IT RUNS, AND WHY THERE IS NO JUMP FRAME ─────────────────────────────
 *
 * - When a bound value writes new text (`bindings.ts`), synchronously, in the same task: the font
 *   is already right before the browser paints the new text.
 * - When the box first has a size or its size changes (a lifespan reveal, a size keyframe) — a
 *   `ResizeObserver`, whose callbacks run after layout and BEFORE paint.
 * - When a font finishes loading (`document.fonts`), because the run is then a different width.
 *
 * The node carries everything the fit needs (`data-cg-fit*`), so every caller — the scene build,
 * a binding, an observer — fits it the same way without reaching back into the scene. The Designer's
 * canvas and preview run this same runtime, and so does the exported page.
 */

/** The authored values a fit starts from, stamped on the node at build. */
const FIT = 'cgFit';
const FIT_BASE = 'cgFitBase';
const FIT_OVERFLOW = 'cgFitOverflow';
/** The scale the last fit settled on (1 = authored size). Read by the animation applier. */
const FIT_SCALE = 'cgFitScale';

/** Steps of the size search: a ~0.1 % precision on a 0.5–1 range. */
const SEARCH_STEPS = 10;

/** Mark a `shrink-to-fit` text node (no-op for any other mode) and start watching its box. */
export function markTextFit(node: HTMLElement, element: TextElement): void {
  if (element.fitMode !== 'shrink-to-fit') return;
  node.dataset[FIT] = 'shrink';
  node.dataset[FIT_BASE] = String(element.font.size);
  node.dataset[FIT_OVERFLOW] = element.overflow === 'ellipsis' ? 'ellipsis' : 'clip';
  node.dataset[FIT_SCALE] = '1';
  watchTextFit(node);
}

/** Whether `node` is a shrink-to-fit text. */
export function isFitText(node: HTMLElement): boolean {
  return node.dataset[FIT] === 'shrink';
}

/** The scale the last fit chose for `node` (1 when it is not a fit text, or nothing shrank). */
export function fitScaleOf(node: HTMLElement): number {
  const scale = Number(node.dataset[FIT_SCALE]);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Fit one node now. A no-op for a node that is not a shrink-to-fit text, and for one that is not laid
 * out (no box — `display: none`, detached): it keeps its authored size until it has one, when the
 * observer fits it.
 */
export function fitText(node: HTMLElement): void {
  if (!isFitText(node)) return;
  const base = Number(node.dataset[FIT_BASE]);
  if (!(base > 0)) return;
  releaseOverflow(node);
  setScale(node, base, 1);
  if (node.clientWidth === 0 && node.clientHeight === 0) return; // not laid out yet
  if (fits(node)) return;

  setScale(node, base, TEXT_FIT_MIN_SCALE);
  if (!fits(node)) {
    // Even at its smallest the text spills: the author's overflow choice takes over.
    holdOverflow(node);
    return;
  }
  // The largest scale that fits, between the minimum (fits) and 1 (does not).
  let lo = TEXT_FIT_MIN_SCALE;
  let hi = 1;
  for (let i = 0; i < SEARCH_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    setScale(node, base, mid);
    if (fits(node)) lo = mid;
    else hi = mid;
  }
  setScale(node, base, lo);
}

/** Fit every shrink-to-fit text under `root`. */
export function fitAllText(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-cg-fit="shrink"]').forEach(fitText);
}

/** The node's laid-out content fits its box (a sub-pixel tolerance for rounding). */
function fits(node: HTMLElement): boolean {
  return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
}

function setScale(node: HTMLElement, base: number, scale: number): void {
  node.style.fontSize = `${String(Math.round(base * scale * 100) / 100)}px`;
  node.dataset[FIT_SCALE] = String(scale);
}

/** Past the minimum: clip, or ellipsise a single line of a block box. */
function holdOverflow(node: HTMLElement): void {
  node.style.overflow = 'hidden';
  const oneLineBlock = node.style.whiteSpace === 'nowrap' && node.style.display !== 'flex';
  if (node.dataset[FIT_OVERFLOW] === 'ellipsis' && oneLineBlock) {
    node.style.textOverflow = 'ellipsis';
  }
}

/** Undo {@link holdOverflow} before measuring again (a shorter value may fit now). */
function releaseOverflow(node: HTMLElement): void {
  node.style.overflow = '';
  node.style.textOverflow = '';
}

// ── THE OBSERVERS ─────────────────────────────────────────────────────────────

const observers = new WeakMap<Document, ResizeObserver>();

/**
 * One `ResizeObserver` per document fits a node whenever its box gets or changes a size; one font
 * listener per document re-fits every fit text when a font loads. Both tolerate an engine without
 * them (a test DOM): the build-time and binding-time fits still run.
 */
function watchTextFit(node: HTMLElement): void {
  const doc = node.ownerDocument;
  const view = doc.defaultView;
  const Observer = view?.ResizeObserver;
  if (Observer === undefined) return;
  let observer = observers.get(doc);
  if (observer === undefined) {
    const created = new Observer((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (!target.isConnected) {
          created.unobserve(target); // a torn-down scene lets its nodes go
          continue;
        }
        fitText(target);
      }
    });
    observer = created;
    observers.set(doc, observer);
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts !== undefined) {
      const refit = (): void => fitAllText(doc);
      fonts.addEventListener('loadingdone', refit);
      void fonts.ready.then(refit, () => undefined);
    }
  }
  observer.observe(node);
}

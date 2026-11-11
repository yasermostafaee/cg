import type { FitRect } from '@cg/shared-schema';

type Edges = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>;

function intersect(a: Edges, b: Edges): Edges {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

function toBox(rect: Edges): FitRect | null {
  const { left: x, top: y, right, bottom } = rect;
  const width = right - x;
  const height = bottom - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

const COMPOSITION = '[data-cg-composition-id]';

/** Read the template's layout even when the page is hidden by `cg-pending`. */
export function measureRehearsalBounds(
  doc: Document,
): { stage: FitRect; content: FitRect | null } | null {
  const stageNode = doc.querySelector('.cg-stage');
  if (stageNode === null) return null;
  const stageRect = stageNode.getBoundingClientRect();
  const stage = toBox(stageRect);
  if (stage === null) return null;

  // Composition wrappers clip their children and may be much larger than what they paint.
  // Audio is not a .cg-element. Authored display:none is reflected in empty rectangles.
  const visuals = stageNode.querySelectorAll(`.cg-element[data-cg-element-id]:not(${COMPOSITION})`);
  let union: Edges | null = null;
  for (const visual of visuals) {
    let rect = intersect(stageRect, visual.getBoundingClientRect());
    let wrapper = visual.parentElement?.closest(COMPOSITION);
    while (wrapper != null && stageNode.contains(wrapper)) {
      rect = intersect(rect, wrapper.getBoundingClientRect());
      wrapper = wrapper.parentElement?.closest(COMPOSITION);
    }
    if (toBox(rect) === null) continue;
    union =
      union === null
        ? rect
        : {
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
          };
  }
  return { stage, content: union === null ? null : toBox(union) };
}

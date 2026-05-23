/**
 * Baseline CSS injected by the runtime. The .vcg's index.html should *also*
 * ship `cg.css` with @font-face declarations and template-specific styles.
 * This block is the irreducible minimum the runtime needs to function:
 * the hide-until-play mechanism (Phase 4 §2) and a sane stage container.
 */
export const BASELINE_CSS = `
.cg-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.cg-element {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
.cg-pending .cg-stage {
  visibility: hidden;
}
.cg-removed .cg-stage {
  display: none;
}
`;

/** Inject the baseline CSS once, idempotent. */
export function ensureBaselineCss(doc: Document = document): void {
  if (doc.getElementById('cg-baseline')) return;
  const style = doc.createElement('style');
  style.id = 'cg-baseline';
  style.textContent = BASELINE_CSS;
  doc.head.appendChild(style);
}

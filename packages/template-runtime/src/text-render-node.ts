/**
 * B-016 / B-017 — the node that carries a text element's GLYPHS (text content,
 * colour, and the glyph shadow).
 *
 * For a SOLID text colour this is the element host itself (rendered exactly as
 * before — `color` + `text-shadow`). For a GRADIENT text colour the gradient
 * (`background: <gradient>` + `background-clip: text` + `color: transparent`)
 * cannot share the host with the box background (it would overwrite + clip it,
 * B-016) nor sit under a `text-shadow` (which would paint over the clipped
 * gradient, B-017), so it lives on a dedicated inner node marked `data-cg-text`
 * with its glyph shadow as `filter: drop-shadow(...)`.
 *
 * Build (`scene-builder`), the field bindings, and the animation applier all
 * resolve the current glyph node through this one helper — keyed off the DOM
 * marker, so they agree with whatever was built, including across a
 * solid↔gradient switch (the inner node is created/removed on rebuild and every
 * writer follows it; no cached, stale references).
 */
export const TEXT_NODE_DATASET = 'cgText';

/** The glyph node for a text host: the `data-cg-text` child if present, else the host. */
export function textRenderNode(host: HTMLElement): HTMLElement {
  for (const child of Array.from(host.children)) {
    if (child instanceof HTMLElement && child.dataset[TEXT_NODE_DATASET] !== undefined) {
      return child;
    }
  }
  return host;
}

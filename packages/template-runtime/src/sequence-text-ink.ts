const contexts = new WeakMap<Document, CanvasRenderingContext2D | null>();
const observers = new WeakMap<Document, ResizeObserver>();

function contextFor(doc: Document): CanvasRenderingContext2D | null {
  const cached = contexts.get(doc);
  if (cached !== undefined) return cached;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = doc.createElement('canvas').getContext('2d');
  } catch {
    // A host without Canvas metrics can still render the authored sequence.
  }
  contexts.set(doc, context);
  return context;
}

/**
 * Move a single line's ink into the authored Sequence aperture when the font's
 * baseline would otherwise shave glyphs off a line that fits. CSS line height
 * alone says nothing about where a particular font paints its accents or descenders.
 */
export function fitSequenceTextInk(node: HTMLElement): void {
  if (node.dataset['cgSequenceText'] === undefined) return;
  if (node.isConnected) observers.get(node.ownerDocument)?.observe(node);
  node.style.top = '';
  const host = node.parentElement;
  const doc = node.ownerDocument;
  const view = doc.defaultView;
  const text = node.textContent ?? '';
  if (
    host === null ||
    view == null ||
    !node.isConnected ||
    text.trim() === '' ||
    /[\r\n\t]/.test(text)
  )
    return;

  const height = host.clientHeight;
  if (height <= 0 || node.offsetHeight <= 0) return;
  const style = view.getComputedStyle(node);
  const lineHeight = Number.parseFloat(style.lineHeight);
  // A genuinely overfull line or several wrapped lines keep the authored clip.
  if (!(lineHeight <= height) || node.offsetHeight > lineHeight + 1) return;
  const context = contextFor(doc);
  if (context === null) return;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } =
    context.measureText(text);
  if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent + descent <= 0) return;

  // An empty inline-box's bottom is the actual DOM baseline. Offset positions
  // are in CSS pixels, independent of the item's slide or an ancestor's scale.
  const marker = doc.createElement('span');
  marker.style.cssText = 'display:inline-block;width:0;height:0';
  node.appendChild(marker);
  let baseline: number;
  try {
    if (
      node.offsetParent !== host ||
      marker.offsetParent !== node ||
      node.offsetHeight > lineHeight + 1
    )
      return;
    baseline = node.offsetTop + marker.offsetTop;
  } finally {
    marker.remove();
  }
  const earliest = Math.ceil(ascent - baseline);
  const latest = Math.floor(height - baseline - descent);
  if (earliest > latest) return;
  const adjustment = Math.max(earliest, Math.min(0, latest));
  if (adjustment !== 0) node.style.top = `${String(adjustment)}px`;
}

function fitSequenceHost(host: HTMLElement): void {
  for (const child of Array.from(host.children)) fitSequenceTextInk(child as HTMLElement);
}

/** Refit when the authored box changes or a different font finishes loading. */
export function watchSequenceTextInk(host: HTMLElement): void {
  host.dataset['cgSequenceTextHost'] = '1';
  // Scene building happens off-document. Observe only hosts actually mounted;
  // a discarded or pre-flight tree would never send a resize callback.
  void Promise.resolve().then(() => {
    if (host.isConnected) observeSequenceTextInk(host);
  });
}

function observeSequenceTextInk(host: HTMLElement): void {
  const doc = host.ownerDocument;
  const Observer = doc.defaultView?.ResizeObserver;
  if (Observer === undefined) return;
  let observer = observers.get(doc);
  if (observer === undefined) {
    const created = new Observer((entries) => {
      for (const { target } of entries) {
        if (!target.isConnected) {
          created.unobserve(target);
          continue;
        }
        const node = target as HTMLElement;
        if (node.dataset['cgSequenceText'] !== undefined) fitSequenceTextInk(node);
        else fitSequenceHost(node);
      }
    });
    observer = created;
    observers.set(doc, observer);
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts !== undefined) {
      const refit = (): void => {
        doc.querySelectorAll<HTMLElement>('[data-cg-sequence-text-host]').forEach(fitSequenceHost);
      };
      fonts.addEventListener('loadingdone', refit);
      void fonts.ready.then(refit, () => undefined);
    }
  }
  observer.observe(host);
}

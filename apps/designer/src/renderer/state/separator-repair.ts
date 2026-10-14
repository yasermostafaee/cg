import type { AssetKind, Element, Layer, Scene } from '@cg/shared-schema';

/**
 * 🔴 `B-128` — a ticker separator is an IMAGE, and a saved project that says otherwise is repaired
 * on open.
 *
 * The picker used to offer every asset and wrote whatever was chosen as `kind: 'image'`, so a
 * project can carry an "image" separator that is really a font, a video or an animation. MEASURED
 * (Chrome 155, `REPORT-DESIGNER-FIX-02` item 2): the page draws a separator as `<img alt="">`
 * sized to its box, and a font or video there paints a BROKEN-IMAGE ICON with a grey border
 * between every pair of ticker items — on air. So such a record is never silently kept: it is
 * dropped when the project opens and the author is told once.
 *
 * PURE: the asset kinds come in as data, so the rule is tested without a store or a bridge.
 */

/** One separator that points at something a separator cannot show. */
export interface NonImageSeparator {
  readonly tickerId: string;
  /** The ticker's name, for the author's sentence. */
  readonly tickerName: string;
  readonly kind: Exclude<AssetKind, 'image'>;
}

/** What the open project's asset stores hold. */
export interface SeparatorAssetKinds {
  /** Project assets, id → kind. */
  readonly project: ReadonlyMap<string, AssetKind>;
  /** The shared library's ids — pictures only, by construction. */
  readonly shared: ReadonlySet<string>;
}

/** Every element of every document, containers walked, each ticker once. */
function* allElements(scene: Scene): Generator<Element> {
  const walk = function* (children: readonly Element[]): Generator<Element> {
    for (const el of children) {
      yield el;
      if (el.type === 'container') yield* walk(el.children);
    }
  };
  const layers: readonly Layer[] = [
    ...scene.layers,
    ...(scene.compositions ?? []).flatMap((c) => c.layers),
  ];
  for (const layer of layers) yield* walk(layer.children);
}

/**
 * The tickers whose separator points at a font, a video or an animation.
 *
 * Resolved the way the exporter resolves it (`compositeImageSource`): the store the separator
 * names first, the other as a fallback. A `shared` id is a picture by construction. An id found
 * in neither store is not judged here — the export preflight already refuses a missing asset.
 */
export function nonImageSeparators(scene: Scene, kinds: SeparatorAssetKinds): NonImageSeparator[] {
  const out: NonImageSeparator[] = [];
  const seen = new Set<string>();
  for (const el of allElements(scene)) {
    if (el.type !== 'ticker' || seen.has(el.id)) continue;
    seen.add(el.id);
    const sep = el.separator;
    if (typeof sep !== 'object') continue;
    if (sep.source === 'shared' && kinds.shared.has(sep.assetId)) continue;
    const kind = kinds.project.get(sep.assetId);
    if (kind === undefined || kind === 'image') continue;
    out.push({ tickerId: el.id, tickerName: el.name.trim(), kind });
  }
  return out;
}

/** `scene` with the separators of `tickerIds` removed — nothing else touched. */
export function withoutSeparators(scene: Scene, tickerIds: ReadonlySet<string>): Scene {
  const fix = (children: readonly Element[]): Element[] =>
    children.map((el) => {
      if (el.type === 'ticker' && tickerIds.has(el.id)) {
        const { separator: _dropped, ...rest } = el;
        return rest as Element;
      }
      if (el.type === 'container') return { ...el, children: fix(el.children) } as Element;
      return el;
    });
  const fixLayers = (layers: readonly Layer[]): Layer[] =>
    layers.map((l) => ({ ...l, children: fix(l.children) }));
  return {
    ...scene,
    layers: fixLayers(scene.layers),
    ...(scene.compositions !== undefined
      ? { compositions: scene.compositions.map((c) => ({ ...c, layers: fixLayers(c.layers) })) }
      : {}),
  };
}

const KIND_WORDS: Record<NonImageSeparator['kind'], string> = {
  font: 'a font',
  video: 'a video',
  lottie: 'an animation',
};

/** The ONE sentence the author is told, once, when the repair ran. */
export function separatorRepairNotice(found: readonly NonImageSeparator[]): string {
  const named = (f: NonImageSeparator): string =>
    f.tickerName === '' ? 'an unnamed ticker' : `"${f.tickerName}"`;
  const [only] = found;
  if (found.length === 1 && only !== undefined) {
    return (
      `Removed the separator from ticker ${named(only)}: it pointed at ${KIND_WORDS[only.kind]}, ` +
      `and a separator can only be an image. Choose an image for it.`
    );
  }
  const names = found.map(named);
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
  return (
    `Removed the separator from ${String(found.length)} tickers (${list}): each pointed at a ` +
    `font, a video or an animation, and a separator can only be an image. Choose an image for each.`
  );
}

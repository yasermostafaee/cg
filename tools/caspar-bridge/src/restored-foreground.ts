/** Find the paired page on one engine. INFO can include both a resident and a queued producer. */
export function restoredForegroundLayers(
  xml: string,
  itemId: string,
  templateBase: string,
  range: { start: number; end: number },
): number[] | null {
  if (!/<channel>[\s\S]*<\/channel>/.test(xml)) return null;
  const stage = /<stage>([\s\S]*?)<\/stage>/.exec(xml)?.[1];
  if (stage === undefined) return xml.includes('<stage>') ? null : [];
  const expected = new URL(templateBase);
  const layers: number[] = [];
  for (const [, index, entry] of stage.matchAll(/<layer_(\d+)>([\s\S]*?)<\/layer_\1>/g)) {
    const layer = Number(index);
    if (layer < range.start || layer > range.end || entry === undefined) continue;
    const front = /<foreground>([\s\S]*?)<\/foreground>/.exec(entry)?.[1];
    if (front === undefined) return null;
    const producers = front.match(/<producer>[^<]+<\/producer>/g);
    if (producers?.length !== 1 || producers[0] !== '<producer>html</producer>') continue;
    const path = /<file>\s*<path>([^<]+)<\/path>\s*<\/file>/
      .exec(front)?.[1]
      ?.replaceAll('&amp;', '&');
    if (path === undefined || !URL.canParse(path)) return null;
    const url = new URL(path);
    const version = url.pathname.slice(expected.pathname.length);
    if (
      url.origin !== expected.origin ||
      !url.pathname.startsWith(expected.pathname) ||
      (version !== '' && !/^~[\da-f]{16}(?:~\d+)?$/i.test(version)) ||
      url.searchParams.get('cgpass') !== 'foreground' ||
      url.searchParams.get('cgsync') !== itemId
    )
      continue;
    const back = /<background>([\s\S]*?)<\/background>/.exec(entry)?.[1];
    if (back?.trim() !== '<producer>empty</producer>') return null;
    layers.push(layer);
  }
  return layers;
}

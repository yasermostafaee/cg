/** A paired page may be restored only after the peer proves both producers empty. */
export function mirroredPageState(
  xml: string,
  layer: number,
  expected: { templateUrl: string; itemId: string; pass: 'background' | 'foreground' },
): 'empty' | 'owned' | 'occupied' | 'unknown' {
  if (!/<channel>[\s\S]*<\/channel>\s*$/.test(xml.trim())) return 'unknown';
  let channelDepth = 0;
  for (const token of xml.matchAll(/<\/?channel>/g)) {
    channelDepth += token[0] === '<channel>' ? 1 : -1;
    if (channelDepth < 0) return 'unknown';
  }
  if (channelDepth !== 0) return 'unknown';
  const stage = /<stage>([\s\S]*?)<\/stage>/.exec(xml)?.[1];
  if (stage === undefined) return xml.includes('<stage') ? 'unknown' : 'empty';
  const allEntries = [...stage.matchAll(/<layer_(\d+)>([\s\S]*?)<\/layer_\1>/g)];
  if (allEntries.length !== [...stage.matchAll(/<layer_\d+>/g)].length) return 'unknown';
  const entries = allEntries.filter(([, index]) => Number(index) === layer);
  if (entries.length === 0) return 'empty';
  if (entries.length !== 1) return 'unknown';
  const entry = entries[0]?.[2] ?? '';
  const front = /<foreground>([\s\S]*?)<\/foreground>/.exec(entry)?.[1];
  const back = /<background>([\s\S]*?)<\/background>/.exec(entry)?.[1];
  if (front === undefined || back === undefined) return 'unknown';
  if (back.trim() !== '<producer>empty</producer>') return 'occupied';
  if (front.trim() === '<producer>empty</producer>') return 'empty';
  const producers = front.match(/<producer>[^<]+<\/producer>/g);
  if (producers?.length !== 1 || producers[0] !== '<producer>html</producer>') return 'occupied';
  const path = /<file>\s*<path>([^<]+)<\/path>\s*<\/file>/
    .exec(front)?.[1]
    ?.replaceAll('&amp;', '&');
  if (path === undefined || !URL.canParse(path)) return 'unknown';
  const url = new URL(path);
  const template = new URL(expected.templateUrl);
  return url.origin === template.origin &&
    url.pathname === template.pathname &&
    url.searchParams.get('cgpass') === expected.pass &&
    url.searchParams.get('cgsync') === expected.itemId
    ? 'owned'
    : 'occupied';
}

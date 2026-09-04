import type { DeclaredConsumer, MissingConsumer, RunningConsumer } from './connections.js';

/**
 * `C-029` — the two targeted extractions behind the program-output alarm, and the diff
 * between them.
 *
 * Deliberately NOT an XML parse, for the reason `parseVideoModeFromInfo` gives: the bridge
 * needs a few leaves out of documents whose shape differs across CasparCG versions, and an
 * unexpected surrounding structure should still yield the facts rather than throw. Both
 * shapes below are captured VERBATIM from the plant's 2.5.0 `69e8ad5` on 2026-09-04 and
 * pinned in `outputs.test.ts`; a dialect drift reddens there first, not on air.
 *
 * ── THE TWO DOCUMENTS ───────────────────────────────────────────────────────
 *
 * `INFO <channel>` — what is RUNNING. CasparCG builds it from the channel's monitor state,
 * where `output/port/<index>/consumer` is each consumer's own `name()`; the XML writer
 * prefixes the digit-only node, so a consumer at index 600 reads:
 *
 *     <output><port><port_600><consumer>screen</consumer>…</port_600></port></output>
 *
 * `INFO CONFIG` — what is DECLARED. The server writes its parsed `casparcg.config` back, so
 * `<channels><channel><consumers>` holds one element per declared consumer, named by kind:
 *
 *     <consumers><decklink><device>23487013</device>…</decklink><screen/><system-audio/></consumers>
 *
 * ── WHY THE KINDS COMPARE BY THE SAME TOKEN ─────────────────────────────────
 *
 * The config ELEMENT NAME and the running consumer's `name()` are the same word for every
 * consumer 2.5.0 ships (`decklink`, `screen`, `system-audio`, `bluefish`, `ndi`, `ffmpeg`,
 * `artnet`): the preconfigured factory is registered under the element name and the
 * consumer reports that same name on the wire. Verified at the wire for the three kinds
 * this plant declares; the comparison is therefore identity, with no mapping table to drift.
 */

/** The `<output>…</output>` block of an `INFO <channel>` reply, or null when there is none. */
function outputBlock(xml: string): string | null {
  const match = /<output>([\s\S]*?)<\/output>/i.exec(xml);
  return match?.[1] ?? null;
}

/**
 * The consumers RUNNING on a channel, from an `INFO <channel>` reply, sorted by port.
 *
 * Returns `null` when the reply carries no `<output>` element at all — a build or a reply
 * shape this parser does not know, which must read as "could not check" rather than as an
 * empty channel. An `<output>` with no ports (`<port/>`) is a real, empty answer: `[]`.
 */
export function parseRunningConsumersFromInfo(xml: string): RunningConsumer[] | null {
  const block = outputBlock(xml);
  if (block === null) return null;
  const running: RunningConsumer[] = [];
  const port = /<port_(\d+)>([\s\S]*?)<\/port_\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = port.exec(block)) !== null) {
    const kind = /<consumer>\s*([^<\s]+)\s*<\/consumer>/i.exec(m[2] ?? '')?.[1];
    if (kind === undefined) continue;
    running.push({ port: Number(m[1]), kind });
  }
  return running.sort((a, b) => a.port - b.port);
}

/** One channel's declared consumers, 1-based in `<channels>` order as CasparCG numbers them. */
export interface DeclaredChannelConsumers {
  channel: number;
  consumers: DeclaredConsumer[];
}

/** The text of the first `<name>…</name>` leaf inside `body`, or undefined. */
function leaf(body: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'i').exec(body);
  return m?.[1];
}

function leafBool(body: string, name: string): boolean | undefined {
  const value = leaf(body, name);
  if (value === undefined) return undefined;
  return value.trim().toLowerCase() === 'true';
}

/**
 * The consumers each channel DECLARES, from an `INFO CONFIG` reply.
 *
 * Returns `null` when the document has no `<channels>` block — not a configuration, so
 * nothing can be judged against it. A channel whose `<consumers>` is absent or empty
 * declares nothing, which is a real answer (`[]`), not a gap.
 */
export function parseDeclaredConsumersFromConfig(xml: string): DeclaredChannelConsumers[] | null {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, '');
  const channels = /<channels>([\s\S]*?)<\/channels>/i.exec(stripped)?.[1];
  if (channels === undefined) return null;
  const out: DeclaredChannelConsumers[] = [];
  const channel = /<channel>([\s\S]*?)<\/channel>/gi;
  let c: RegExpExecArray | null;
  let index = 0;
  while ((c = channel.exec(channels)) !== null) {
    index += 1;
    const consumersBody = /<consumers>([\s\S]*?)<\/consumers>/i.exec(c[1] ?? '')?.[1] ?? '';
    out.push({ channel: index, consumers: parseConsumerElements(consumersBody) });
  }
  return out;
}

/**
 * The direct child elements of a `<consumers>` body, in file order. A consumer element is
 * either self-closing (`<screen/>`) or a container whose children are its parameters
 * (`<decklink><device>…</device></decklink>`); consumer elements never nest their own kind,
 * so the first matching close tag ends the element.
 */
function parseConsumerElements(body: string): DeclaredConsumer[] {
  const consumers: DeclaredConsumer[] = [];
  const open = /<([a-z][a-z0-9-]*)(\s[^>]*)?(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(body)) !== null) {
    const kind = (m[1] ?? '').toLowerCase();
    if (m[3] === '/') {
      consumers.push({ kind });
      continue;
    }
    const closeAt = body.indexOf(`</${m[1] ?? ''}>`, open.lastIndex);
    const inner = closeAt === -1 ? '' : body.slice(open.lastIndex, closeAt);
    const device = leaf(inner, 'device');
    const embeddedAudio = leafBool(inner, 'embedded-audio');
    const keyOnly = leafBool(inner, 'key-only');
    const keyer = leaf(inner, 'keyer');
    consumers.push({
      kind,
      ...(device !== undefined && device !== '' ? { device } : {}),
      ...(embeddedAudio !== undefined ? { embeddedAudio } : {}),
      ...(keyOnly !== undefined ? { keyOnly } : {}),
      ...(keyer !== undefined && keyer !== '' ? { keyer } : {}),
    });
    if (closeAt !== -1) open.lastIndex = closeAt;
  }
  return consumers;
}

/**
 * Declared kinds with fewer running instances than declared — the alarm's content, in the
 * declaration's own order. Counted per kind: a channel declaring two DeckLinks with one
 * running is `{ kind: 'decklink', declared: 2, running: 1 }`.
 */
export function missingConsumers(
  declared: readonly DeclaredConsumer[],
  running: readonly RunningConsumer[],
): MissingConsumer[] {
  const runningByKind = new Map<string, number>();
  for (const r of running) runningByKind.set(r.kind, (runningByKind.get(r.kind) ?? 0) + 1);
  const order: string[] = [];
  const byKind = new Map<string, DeclaredConsumer[]>();
  for (const d of declared) {
    if (!byKind.has(d.kind)) {
      byKind.set(d.kind, []);
      order.push(d.kind);
    }
    byKind.get(d.kind)?.push(d);
  }
  const missing: MissingConsumer[] = [];
  for (const kind of order) {
    const wanted = byKind.get(kind) ?? [];
    const have = runningByKind.get(kind) ?? 0;
    if (have >= wanted.length) continue;
    missing.push({
      kind,
      declared: wanted.length,
      running: have,
      devices: wanted.flatMap((d) => (d.device !== undefined ? [d.device] : [])),
    });
  }
  return missing;
}

/**
 * Consumer kinds that carry the channel OFF the machine — a program output. `screen` and
 * `system-audio` are confidence monitors on the playout box itself: losing one is worth
 * saying, but it is not "nothing reaches air".
 */
export const AIR_OUTPUT_KINDS: readonly string[] = [
  'decklink',
  'bluefish',
  'ndi',
  'newtek-ivga',
  'ffmpeg',
  'artnet',
];

export function isAirOutputKind(kind: string): boolean {
  return AIR_OUTPUT_KINDS.includes(kind.toLowerCase());
}

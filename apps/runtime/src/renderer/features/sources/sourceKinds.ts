import type { SourceProducer } from '@cg/shared-ipc';

/**
 * `STATION-CHROME-01` §5 — **WHAT ADDRESSES A SOURCE, PER KIND, IN ONE PLACE.**
 *
 * A DeckLink is addressed by a device index (and a format), an NDI source by the name it
 * announces, a stream by a URL, a route by a channel, a clip by a file. The catalogue row
 * and the Add/Edit dialog both need to know that, and they must not learn it separately —
 * a row that labels a field one way while the form labels it another is the drift golden
 * rule 6 exists to end.
 *
 * So the KIND vocabulary lives here: the order kinds are offered in, their operator labels,
 * the empty producer each one starts from, and — the §5 addition — the LABELLED PARTS a row
 * shows instead of one unlabelled "Address" column.
 */

/**
 * The producer kinds, in the order an operator is most likely to need them.
 *
 * `decklink` FIRST, because an SDI input is what a station has most of. `stream` (C-025)
 * sits with the signal-bearing producers; `media` stays LAST because it is the odd one out
 * — "the one producer that needs no signal" in a list of lives — and an operator scanning
 * for a feed should not meet the clip in the middle of them.
 */
export const PRODUCER_KINDS: readonly SourceProducer['kind'][] = [
  'decklink',
  'ndi',
  'stream',
  'route',
  'media',
];

export const KIND_LABEL: Record<SourceProducer['kind'], string> = {
  route: 'Route (another channel)',
  decklink: 'DeckLink (SDI input)',
  ndi: 'NDI',
  stream: 'Stream (URL)',
  media: 'Media clip',
};

/** The SHORT badge on a catalogue row — the mockup's `kind` pill. */
export const KIND_BADGE: Record<SourceProducer['kind'], string> = {
  route: 'Route',
  decklink: 'DeckLink',
  ndi: 'NDI',
  stream: 'Stream',
  media: 'Media',
};

/**
 * A fresh producer of the chosen kind.
 *
 * ⚠ Each default must be one the VALIDATOR accepts, or switching the kind would refuse
 * before the operator had typed anything — a form that rejects its own initial state.
 * `stream`'s default carries an allowed scheme for exactly that reason (C-025).
 */
export function emptyProducer(kind: SourceProducer['kind']): SourceProducer {
  switch (kind) {
    case 'route':
      return { kind: 'route', channel: 1 };
    case 'decklink':
      return { kind: 'decklink', device: 1 };
    case 'ndi':
      return { kind: 'ndi', source: 'NDI SOURCE' };
    case 'stream':
      return { kind: 'stream', url: 'rtmp://server/live/stream' };
    case 'media':
      return { kind: 'media', file: 'AMB' };
  }
}

/**
 * 🔴 §5 — **WHERE THIS SOURCE COMES FROM, AS LABELLED PARTS.**
 *
 * The old row printed one derived string into an unlabelled column — `DECKLINK DEVICE 1`,
 * `NDI CG-INGEST`, `stream srt://…` — which forced three different addressing schemes into
 * one shape and named none of them. An operator reading `1` could not tell whether it was a
 * device, a channel or a layer.
 *
 * Each part carries its own LABEL, so the row says what the value IS. The caller renders
 * them; this decides what they are.
 */
export interface SourcePart {
  readonly label: string;
  readonly value: string;
}

export function producerParts(p: SourceProducer): readonly SourcePart[] {
  switch (p.kind) {
    case 'route':
      return p.layer === undefined
        ? [{ label: 'Channel', value: String(p.channel) }]
        : [
            { label: 'Channel', value: String(p.channel) },
            { label: 'Layer', value: String(p.layer) },
          ];
    case 'decklink':
      /*
        The FILL device alone reaches CasparCG — `producerArgument` emits exactly that — but
        a stored KEY device is SHOWN, because the alternative is a row that silently omits
        configuration the operator wrote. Its own note says it does not reach the server.
      */
      return p.keyDevice === undefined
        ? [{ label: 'Device', value: String(p.device) }]
        : [
            { label: 'Device', value: String(p.device) },
            { label: 'Key device — not sent to CasparCG', value: String(p.keyDevice) },
          ];
    case 'ndi':
      return [{ label: 'Source name', value: p.source }];
    case 'stream':
      return [{ label: 'URL', value: p.url }];
    case 'media':
      return [{ label: 'File', value: p.file }];
  }
}

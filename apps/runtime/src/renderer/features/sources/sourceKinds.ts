import { Clapperboard, CreditCard, Link2, Radio, type LucideIcon } from 'lucide-react';
import type { SourceProducer } from '@cg/shared-ipc';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.C — **THE KIND OF A PLAYOUT INPUT, AS STATION SETUP NAMES IT — and
 * nowhere else does.** The picker and every label name a source by its NAME and an input-or-media
 * icon; the kind word is this list's alone. It is the Playout's cable, in three words: an SDI
 * input (a `route` to the Playout's holder, or a `decklink`), an `NDI` source, or a `Stream`. The
 * address a kind carries — a device, an NDI name, a URL — is never shown (§1.E).
 *
 * (`STATION-CHROME-01`'s add/edit vocabulary — the kinds offered, their empty producers and the
 * labelled address parts — went with the catalogue editor, §1.F.)
 */
export const KIND_WORD: Record<SourceProducer['kind'], string> = {
  route: 'SDI',
  decklink: 'SDI',
  ndi: 'NDI',
  stream: 'Stream',
  media: 'Media',
};

/** The kind TILE's glyph — decorative; {@link KIND_WORD} beside it is the name. */
export const KIND_ICON: Record<SourceProducer['kind'], LucideIcon> = {
  route: CreditCard,
  decklink: CreditCard,
  ndi: Radio,
  stream: Link2,
  media: Clapperboard,
};

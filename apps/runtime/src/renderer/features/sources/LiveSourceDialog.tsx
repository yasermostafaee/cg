import { useState } from 'react';
import {
  LIVE_SOURCE_FORMATS,
  type LiveSourceFormat,
  type SourceDefinition,
  type SourceProducer,
} from '@cg/shared-ipc';
import { NumericInput } from '../../ui/NumericInput.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';
import { KIND_LABEL, PRODUCER_KINDS, emptyProducer } from './sourceKinds.js';

/**
 * `STATION-CHROME-01` §5 + §6 — **Add / Edit one live source, with the fields that KIND
 * actually has.**
 *
 * ── §5: THE FIELDS DEPEND ON THE KIND ───────────────────────────────────────
 *
 * A DeckLink is addressed by a device index (and, for a fill/key pair, a second one); an NDI
 * source by the name the network announces; a stream by URL; a route by a channel and
 * optionally a layer; a clip by a file name. One "Address" field would force five different
 * things into one shape and label none of them — so the form SWITCHES on the kind and every
 * field carries its own label.
 *
 * ── §6: IT IS THE SAME SMALL SECOND DIALOG AS EVERY OTHER ADD ───────────────
 *
 * `RecordDialog`, exactly as the delimiter and the backup server use it. The DRAFT lives
 * here and reaches the catalogue only on the confirming press — which is a real change from
 * the inline editors this replaces, where every keystroke went to the bridge.
 *
 * ⚠ **THE TWO SHAPES STAY APART.** This edits the installation-wide CATALOGUE. WHICH PLATE
 * uses which source is per-template and lives in the Inspector. `LiveSourceSwapDialog`'s own
 * intro exists to prevent exactly that merge, and nothing here reaches an assignment.
 */

export function LiveSourceDialog({
  /** The record being edited, or `null` to add a new one. */
  source,
  existingNames,
  onCancel,
  onCommit,
}: {
  source: SourceDefinition | null;
  /** The other sources' names, for the instant duplicate check. The bridge re-checks. */
  existingNames: readonly string[];
  onCancel: () => void;
  /** Commit the draft. Return an operator sentence to refuse, or `null` to accept. */
  onCommit: (draft: { name: string; producer: SourceProducer; format?: LiveSourceFormat }) => void;
}): JSX.Element {
  const [name, setName] = useState(source?.name ?? '');
  const [producer, setProducer] = useState<SourceProducer>(
    source?.producer ?? emptyProducer('decklink'),
  );
  const [format, setFormat] = useState<string>(source?.format ?? '');

  const submit = (): string | null => {
    const trimmed = name.trim();
    // The LOCAL checks are about what was typed into THIS form; the BRIDGE re-checks the
    // whole catalogue and is authoritative. These exist so the form can answer instantly.
    if (trimmed === '') {
      return 'Give the source a name — it is what the operator picks, e.g. Studio A.';
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      return `There is already a source called ${trimmed}. Names are what the operator picks from, so they have to be distinct.`;
    }
    const bad = producerError(producer);
    if (bad !== null) return bad;
    onCommit({
      name: trimmed,
      producer,
      ...(format === '' ? {} : { format: format as LiveSourceFormat }),
    });
    return null;
  };

  return (
    <RecordDialog
      title={source === null ? 'Add live source' : 'Edit live source'}
      confirmLabel={source === null ? 'Add source' : 'Save'}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <DialogField label="Name" hint="What the operator sees on the row.">
        <input
          className="cg-field"
          type="text"
          value={name}
          aria-label="Source name"
          placeholder="Studio A"
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>

      <DialogField label="Kind">
        <select
          className="cg-field"
          aria-label="Source kind"
          value={producer.kind}
          onChange={(e) => setProducer(emptyProducer(e.target.value as SourceProducer['kind']))}
        >
          {PRODUCER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </DialogField>

      <KindFields producer={producer} onChange={setProducer} />

      {/*
        FORMAT is offered for every kind, because the crop-to-fill ASPECT derives from it
        (§3a) and that is true of a route and a stream as much as of a DeckLink. It is a
        PICKER and not a number: a hand-entered aspect is a value that can be wrong on air
        while looking entirely reasonable.
      */}
      <DialogField
        label="Signal format"
        hint="The crop-to-fill aspect is derived from this — leave it unstated if you do not know it."
      >
        <select
          className="cg-field"
          aria-label="Signal format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="">— not stated —</option>
          {LIVE_SOURCE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </DialogField>
    </RecordDialog>
  );
}

/** What the operator must still supply for this kind, in his words. */
function producerError(p: SourceProducer): string | null {
  switch (p.kind) {
    case 'ndi':
      return p.source.trim() === ''
        ? 'An NDI source is addressed by the name the network announces — type it exactly as NDI shows it.'
        : null;
    case 'stream':
      return p.url.trim() === ''
        ? 'A stream is addressed by its URL, e.g. srt://ingest.example:9000.'
        : null;
    case 'media':
      return p.file.trim() === ''
        ? 'A clip is addressed by its file name in CasparCG’s media folder, e.g. AMB.'
        : null;
    case 'decklink':
    case 'route':
      // Both are numbers with a schema floor and a NumericInput that cannot go below it.
      return null;
  }
}

/**
 * The per-kind fields — §5's whole point, in the form as well as in the row.
 *
 * ⚠ `keyDevice` appears on the DECKLINK arm ALONE, and that is the schema's shape rather
 * than a layout choice: a fill/key pair is two physical SDI inputs, so offering the field
 * beside a route or an NDI name would invite an operator to configure a pair that cannot
 * exist. It is KEPT even though nothing sends it — a station may already have written one,
 * and removing the field would delete that configuration — and it SAYS so. Seating the pair
 * is `C-027`.
 */
function KindFields({
  producer,
  onChange,
}: {
  producer: SourceProducer;
  onChange: (next: SourceProducer) => void;
}): JSX.Element {
  switch (producer.kind) {
    case 'decklink':
      return (
        <>
          <DialogField label="Device index" hint="The FILL input's device number on the server.">
            <NumericInput
              className="cg-field"
              aria-label="DeckLink device index"
              value={String(producer.device)}
              onValueChange={(v) => {
                const n = Number(v);
                onChange({ ...producer, device: Number.isInteger(n) && n > 0 ? n : 1 });
              }}
            />
          </DialogField>
          <DialogField
            label="Key device (optional)"
            hint="A fill/key pair's second input. It is stored, and it is not sent to CasparCG — seating the pair is C-027."
          >
            <NumericInput
              className="cg-field"
              aria-label="DeckLink key device index"
              value={producer.keyDevice === undefined ? '' : String(producer.keyDevice)}
              onValueChange={(v) => {
                const n = Number(v);
                const { keyDevice: _drop, ...rest } = producer;
                onChange(
                  v.trim() === '' || !Number.isInteger(n) || n <= 0
                    ? rest
                    : { ...rest, keyDevice: n },
                );
              }}
            />
          </DialogField>
        </>
      );
    case 'ndi':
      /*
        "NDI source name", not the row's shorter "Source name": this dialog ALSO has a field
        called Name (the operator's own label for the source), and two fields whose names
        differ by one word are two fields an operator can fill in the wrong order. On the ROW
        there is no such neighbour, so it stays short there.
      */
      return (
        <DialogField label="NDI source name" hint="Exactly as NDI announces it.">
          <input
            className="cg-field"
            type="text"
            value={producer.source}
            aria-label="NDI source name"
            placeholder="CG-INGEST (Studio 2)"
            onChange={(e) => onChange({ ...producer, source: e.target.value })}
          />
        </DialogField>
      );
    case 'stream':
      return (
        <DialogField label="URL" hint="srt://, rtmp://, rtsp://, udp:// or http(s)://.">
          <input
            className="cg-field"
            type="text"
            value={producer.url}
            aria-label="Stream URL"
            placeholder="srt://ingest.example:9000"
            onChange={(e) => onChange({ ...producer, url: e.target.value })}
          />
        </DialogField>
      );
    case 'media':
      return (
        <DialogField label="File" hint="A clip in CasparCG’s media folder.">
          <input
            className="cg-field"
            type="text"
            value={producer.file}
            aria-label="Media file"
            placeholder="AMB"
            onChange={(e) => onChange({ ...producer, file: e.target.value })}
          />
        </DialogField>
      );
    case 'route':
      return (
        <>
          <DialogField label="From channel">
            <NumericInput
              className="cg-field"
              aria-label="Route source channel"
              value={String(producer.channel)}
              onValueChange={(v) => {
                const n = Number(v);
                onChange({ ...producer, channel: Number.isInteger(n) && n > 0 ? n : 1 });
              }}
            />
          </DialogField>
          <DialogField label="From layer (optional)" hint="Empty routes the whole channel output.">
            <NumericInput
              className="cg-field"
              aria-label="Route source layer"
              value={producer.layer === undefined ? '' : String(producer.layer)}
              onValueChange={(v) => {
                const n = Number(v);
                const { layer: _drop, ...rest } = producer;
                onChange(
                  v.trim() === '' || !Number.isInteger(n) || n < 0 ? rest : { ...rest, layer: n },
                );
              }}
            />
          </DialogField>
        </>
      );
  }
}

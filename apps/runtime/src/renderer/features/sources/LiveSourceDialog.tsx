import { useState } from 'react';
import {
  LIVE_SOURCE_FORMATS,
  type LiveSourceFormat,
  type SourceDefinition,
  type SourceProducer,
} from '@cg/shared-ipc';
import { STATION_SETUP_PX } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { indexError } from '../../ui/fieldValue.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';
import { KIND_BADGE, KIND_ICON, KIND_LABEL, PRODUCER_KINDS, emptyProducer } from './sourceKinds.js';

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
      /* §8b — `Save source`, not a bare `Save`: the primary's verb names the act, and this
         frame's other four say `Add to draft`, `Add source`, `Add delimiter`, `Remove source`. */
      confirmLabel={source === null ? 'Add source' : 'Save source'}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <DialogField label="Source name" hint="The name operators see in the source list." focusFirst>
        <input
          className="cg-field"
          type="text"
          dir="auto"
          value={name}
          aria-label="Source name"
          placeholder="e.g. Studio B"
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>

      {/*
        🔴 `SETTINGS-MATCH-02` §8b — **A SEGMENTED CONTROL, NOT A SELECT.**

        The kind is the one control in this form whose VALUE CHANGES THE FORM — pick NDI and
        the fields below become a source name; pick Stream and they become a URL. A `<select>`
        hides four of five answers behind a press and gives no hint that choosing differently
        would ask for something different, which is the same argument §5 made for giving the
        catalogue ROW its labelled parts rather than one derived string.

        ⚠ **A RADIO GROUP, not a row of buttons.** One choice from a named set is what a radio
        group IS; it brings the group's accessible name and arrow-key traversal with it, and a
        row of buttons would have to re-implement both badly. `Source kind` is kept as the
        group's name because five specs query the control by it.

        ⚠ The reference draws THREE (DeckLink · NDI · Stream). Ours draws FIVE, because
        `SourceProducer` has five and a picker that cannot express a stored value is a defect
        rather than a simplification — the same reason the strategy select kept its third
        option.
      */}
      <fieldset className="cg-setup-field" data-sub-field="kind">
        <legend className="cg-setup-field__label">Input type</legend>
        <div className="cg-kind-options" role="radiogroup" aria-label="Source kind">
          {PRODUCER_KINDS.map((kind) => (
            <label className="cg-kind-option" key={kind} title={KIND_LABEL[kind]}>
              <input
                type="radio"
                name="cg-source-kind"
                value={kind}
                checked={producer.kind === kind}
                aria-label={KIND_LABEL[kind]}
                onChange={() => setProducer(emptyProducer(kind))}
              />
              <Icon icon={KIND_ICON[kind]} size={STATION_SETUP_PX.kindOptionIcon} />
              {KIND_BADGE[kind]}
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        🔴 `key={producer.kind}` IS LOAD-BEARING, and a test caught its absence.

        `KindFields` holds the numeric fields' own TEXT (see its note — that is what replaced
        the silent clamps §10.3 forbids). Without the key React keeps the same instance across
        a kind switch, so that text SURVIVES: `route` with channel 5 → `stream` → `route` came
        back showing 5 against a fresh producer whose channel is 1. The form would have been
        displaying a number the record did not hold.

        `emptyProducer`'s documented rule is that switching arms discards the previous one's
        fields; the key is what makes the local text obey it too.
      */}
      <KindFields key={producer.kind} producer={producer} onChange={setProducer} />

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
  /*
    🔴 §10.3 — THE NUMERIC FIELDS KEEP THEIR OWN TEXT.

    A number field controlled by a NUMBER cannot hold the states an operator types through:
    empty, and any value the parse rejects. That is what forced the old clamps — `? n : 1` was
    the only way to keep a number in scope — and the clamp is what silently rewrote his input.
    Holding the TEXT here and pushing a number up only when it parses gives the field both
    halves: it shows what he typed, and the record never receives something it cannot mean.

    ⚠ Keyed on the KIND, so switching kind resets these to the new producer's own defaults
    rather than carrying a stale string across.
  */
  const [deviceText, setDeviceText] = useState(
    producer.kind === 'decklink' ? String(producer.device) : '',
  );
  const [keyText, setKeyText] = useState(
    producer.kind === 'decklink' && producer.keyDevice !== undefined
      ? String(producer.keyDevice)
      : '',
  );
  const [channelText, setChannelText] = useState(
    producer.kind === 'route' ? String(producer.channel) : '',
  );
  const [layerText, setLayerText] = useState(
    producer.kind === 'route' && producer.layer !== undefined ? String(producer.layer) : '',
  );
  switch (producer.kind) {
    case 'decklink':
      return (
        <>
          {/*
            🔴 `SETTINGS-MATCH-02` §10.3 — **THE SILENT CLAMP IS GONE.** This read
            `device: Number.isInteger(n) && n > 0 ? n : 1` — so typing `0` put a `1` in the
            field, and clearing it put a `1` in the field, and the operator was never told. A
            number the console changed without saying so is the one thing §10.3 forbids by
            name: the value is kept as typed, and the field says what is wrong with it.
          */}
          <DialogField
            label="Device index"
            id="decklink-device"
            hint="The FILL input's device number on the server."
            error={indexError(deviceText, { label: 'Device index' })}
          >
            <NumericInput
              className="cg-field cg-field--mono"
              dir="ltr"
              allow="digits"
              aria-label="DeckLink device index"
              value={deviceText}
              onValueChange={(v) => {
                setDeviceText(v);
                const n = Number(v);
                if (v !== '' && Number.isInteger(n) && n > 0) onChange({ ...producer, device: n });
              }}
            />
          </DialogField>
          <DialogField
            label="Key device"
            id="decklink-key"
            hint="A fill/key pair's second input. It is stored, and it is not sent to CasparCG — seating the pair is C-027."
            error={indexError(keyText, { label: 'Key device', blankAllowed: true })}
          >
            <NumericInput
              className="cg-field cg-field--mono"
              dir="ltr"
              allow="digits"
              aria-label="DeckLink key device index"
              value={keyText}
              onValueChange={(v) => {
                setKeyText(v);
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
        <DialogField
          label="NDI source name"
          id="ndi-source"
          hint="Use the exact name announced by the NDI source."
        >
          <input
            className="cg-field cg-field--mono"
            type="text"
            dir="ltr"
            value={producer.source}
            aria-label="NDI source name"
            placeholder="CG-INGEST (Studio 2)"
            onChange={(e) => onChange({ ...producer, source: e.target.value })}
          />
        </DialogField>
      );
    case 'stream':
      return (
        <DialogField
          label="Stream URL"
          id="stream-url"
          hint="Include the protocol, such as srt://, rtmp:// or https://."
        >
          <input
            className="cg-field cg-field--mono"
            type="text"
            dir="ltr"
            value={producer.url}
            aria-label="Stream URL"
            /* ⚠ OURS, not the reference's `srt://10.4.0.9:9000` — §0's rule (its sample data
               is prototype furniture) and the `cg/no-hardcoded-origin` lint rule agree: a
               literal address in the product is one that works on exactly one box. */
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
          {/* §10.3 — the same correction as the DeckLink arm: no silent clamp to 1. */}
          <DialogField
            label="From channel"
            id="route-channel"
            error={indexError(channelText, { label: 'From channel' })}
          >
            <NumericInput
              className="cg-field cg-field--mono"
              dir="ltr"
              allow="digits"
              aria-label="Route source channel"
              value={channelText}
              onValueChange={(v) => {
                setChannelText(v);
                const n = Number(v);
                if (v !== '' && Number.isInteger(n) && n > 0) onChange({ ...producer, channel: n });
              }}
            />
          </DialogField>
          <DialogField
            label="From layer"
            id="route-layer"
            hint="Empty routes the whole channel output."
            error={indexError(layerText, { label: 'From layer', min: 0, blankAllowed: true })}
          >
            <NumericInput
              className="cg-field cg-field--mono"
              dir="ltr"
              allow="digits"
              aria-label="Route source layer"
              value={layerText}
              onValueChange={(v) => {
                setLayerText(v);
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

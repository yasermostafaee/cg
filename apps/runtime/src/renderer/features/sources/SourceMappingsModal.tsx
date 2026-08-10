import { useState, useSyncExternalStore } from 'react';
import { Trash2 } from 'lucide-react';
import {
  aspectForFormat,
  LIVE_SOURCE_FORMATS,
  mappingAspect,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  type LiveSourceFormat,
  type SourceMapping,
  type SourceMappings,
  type SourceProducer,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  commitSourceMappings,
  currentSourceMappings,
  sourceMappingsVersion,
  subscribeSourceMappings,
} from './sourceMappingStore.js';

/**
 * D-137 / C-015 — bind each symbolic Live Source id to a concrete producer.
 *
 * THE SURFACE THE OWNER NAMED AS THE BLOCKER for the whole feature: a template
 * declares `guest-1` and the scene deliberately never says what that is, so
 * until an operator says it here, nothing reaches air.
 *
 * Modelled on `DelimitersModal` rather than `FixedBankConfigModal`, because this
 * is a LIST EDITOR and not a read-only ceiling, and two of its behaviours are
 * copied deliberately:
 *
 * - **No optimistic local update.** Every edit goes through
 *   `commitSourceMappings`, which adopts the value only once the bridge accepts
 *   it. The bridge can refuse (a duplicate id, a band overlapping the candidate
 *   bank or the reserved playout range), and showing a mapping the station does
 *   not have would send an operator away believing a guest box is bound.
 * - **The older-bridge translation.** Every station whose bridge predates this
 *   feature hits `unknown channel: sources.set-config`, and the store turns that
 *   into a sentence naming the real cause.
 *
 * The FORMAT is a picker, not a number: §3a's decision is that the crop-to-fill
 * aspect DERIVES from the signal format, because a hand-entered aspect is a
 * value that can be wrong on air while looking entirely reasonable. The derived
 * aspect is shown beside the picker so the operator can see what they just said.
 */

const styles = {
  intro: { fontSize: '0.8rem', color: colors.textMuted, margin: '0 0 0.6rem' },
  empty: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.7rem',
    fontSize: '0.82rem',
    color: colors.textMuted,
    marginBottom: '0.6rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    marginBottom: '0.7rem',
  },
  entry: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.5rem 0.6rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' as const },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem' },
  fieldLabel: { fontSize: '0.72rem', color: colors.textMuted },
  id: { fontFamily: 'monospace', fontSize: '0.9rem', flex: 1, minWidth: 0 },
  derived: { fontSize: '0.72rem', color: colors.textMuted, alignSelf: 'center' },
  section: {
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '0.6rem',
    marginTop: '0.2rem',
  },
  sectionTitle: {
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: colors.textMuted,
    marginBottom: '0.35rem',
  },
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: '0.5rem 0 0' },
  error: { fontSize: '0.75rem', color: colors.error, margin: '0.4rem 0 0' },
} as const;

/** The producer kinds, in the order an operator is most likely to need them. */
const PRODUCER_KINDS: readonly SourceProducer['kind'][] = ['route', 'decklink', 'ndi', 'media'];

const KIND_LABEL: Record<SourceProducer['kind'], string> = {
  route: 'Route from a channel',
  decklink: 'Decklink input',
  ndi: 'NDI source',
  media: 'Media file',
};

/**
 * A fresh producer of the chosen kind.
 *
 * Switching kinds DISCARDS the previous arm's fields rather than trying to carry
 * them across. A device number and a channel number are not the same number, and
 * quietly reusing one as the other is how a mapping comes to point at hardware
 * nobody chose.
 */
function emptyProducer(kind: SourceProducer['kind']): SourceProducer {
  switch (kind) {
    case 'route':
      return { kind: 'route', channel: 1 };
    case 'decklink':
      return { kind: 'decklink', device: 1 };
    case 'ndi':
      return { kind: 'ndi', source: '' };
    case 'media':
      return { kind: 'media', file: '' };
  }
}

/** What this entry resolves to, in the words the bridge will send. */
function describeProducer(p: SourceProducer): string {
  switch (p.kind) {
    case 'route':
      return p.layer === undefined
        ? `route://${String(p.channel)}`
        : `route://${String(p.channel)}-${String(p.layer)}`;
    case 'decklink':
      return p.keyDevice === undefined
        ? `DECKLINK DEVICE ${String(p.device)}`
        : `DECKLINK DEVICE ${String(p.device)} + KEY ${String(p.keyDevice)}`;
    case 'ndi':
      return p.source === '' ? 'NDI (no source named)' : `NDI ${p.source}`;
    case 'media':
      return p.file === '' ? 'media (no file named)' : `media ${p.file}`;
  }
}

/** `1.7778` is not an answer an operator can check; `16:9` is. */
function describeAspect(mapping: SourceMapping): string {
  const aspect = mappingAspect(mapping);
  if (aspect === null) return 'aspect: not stated';
  const nearest = [
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['1.90:1 (DCI)', 2048 / 1080],
    ['1.32:1', 2048 / 1556],
  ] as const;
  const match = nearest.find(([, v]) => Math.abs(v - aspect) < 0.001);
  const shown = match === undefined ? aspect.toFixed(3) : match[0];
  const derived = mapping.format !== undefined && aspectForFormat(mapping.format) !== null;
  return `aspect: ${shown}${derived ? ' (from the format)' : ''}`;
}

function parseLayerNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
}

export function SourceMappingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  useSyncExternalStore(subscribeSourceMappings, sourceMappingsVersion);
  const mappings = currentSourceMappings();
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');

  const commit = (next: SourceMappings): void => {
    void commitSourceMappings(next).then(setError);
  };

  const replaceEntry = (index: number, entry: SourceMapping): void => {
    commit({ ...mappings, mappings: mappings.mappings.map((m, i) => (i === index ? entry : m)) });
  };

  const addEntry = (): void => {
    const id = newId.trim();
    // The LOCAL checks are about what was typed into this form; the BRIDGE
    // re-checks the whole mapping and is authoritative. These exist so the form
    // can answer instantly, not to be the only guard.
    if (id === '') {
      setError('Give the source an id — it is the name a template declares, e.g. guest-1.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      setError(
        'A source id is symbolic: letters, digits, "_" and "-", starting alphanumeric. The ' +
          'device goes below, not in the id.',
      );
      return;
    }
    if (mappings.mappings.some((m) => m.id === id)) {
      setError(`“${id}” is already mapped.`);
      return;
    }
    setNewId('');
    commit({
      ...mappings,
      mappings: [...mappings.mappings, { id, producer: emptyProducer('route') }],
    });
  };

  const applyBand = (): void => {
    const start = parseLayerNumber(bandStart);
    const end = parseLayerNumber(bandEnd);
    if (start === null || end === null) {
      setError('The band is two layer numbers, e.g. 10 and 59.');
      return;
    }
    if (end < start) {
      setError('The band ends before it starts — swap the two numbers.');
      return;
    }
    commit({ ...mappings, layerRange: { start, end } });
  };

  const band = mappings.layerRange;

  return (
    <Modal
      title="Live sources"
      size="wide"
      onClose={onClose}
      {...(error !== null ? { message: <span style={styles.error}>{error}</span> } : {})}
      footer={
        <ModalAction actionRole="primary" onClick={onClose}>
          Done
        </ModalAction>
      }
    >
      <p style={styles.intro}>
        A template declares a source by name — <code>guest-1</code> — and never says what it is.
        This is where this station says it. An id with no mapping here refuses its take rather than
        going to air as an empty box.
      </p>

      {mappings.mappings.length === 0 ? (
        <div style={styles.empty} role="status">
          Nothing is mapped yet, so no template declaring a live source can be taken. Add the id the
          template declares, then say what it is on this station.
        </div>
      ) : (
        <div style={styles.list}>
          {mappings.mappings.map((m, index) => (
            <div key={m.id} style={styles.entry}>
              <div style={styles.row}>
                <span style={styles.id}>{m.id}</span>
                <span style={styles.derived}>{describeProducer(m.producer)}</span>
                <Button
                  variant="danger"
                  aria-label={`Remove the mapping for ${m.id}`}
                  onClick={() =>
                    commit({
                      ...mappings,
                      mappings: mappings.mappings.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Icon icon={Trash2} />
                </Button>
              </div>

              <div style={styles.row}>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Shown as</span>
                  <input
                    className="cg-field"
                    type="text"
                    value={m.label ?? ''}
                    placeholder={m.id}
                    aria-label={`Label for ${m.id}`}
                    onChange={(e) => {
                      const label = e.target.value;
                      replaceEntry(index, {
                        ...m,
                        ...(label === '' ? {} : { label }),
                      });
                    }}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Kind</span>
                  <select
                    className="cg-field"
                    style={{ width: 'auto' }}
                    aria-label={`Producer kind for ${m.id}`}
                    value={m.producer.kind}
                    onChange={(e) =>
                      replaceEntry(index, {
                        ...m,
                        producer: emptyProducer(e.target.value as SourceProducer['kind']),
                      })
                    }
                  >
                    {PRODUCER_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Format</span>
                  <select
                    className="cg-field"
                    style={{ width: 'auto' }}
                    aria-label={`Signal format for ${m.id}`}
                    value={m.format ?? ''}
                    onChange={(e) => {
                      const format = e.target.value;
                      replaceEntry(index, {
                        ...m,
                        ...(format === '' ? {} : { format: format as LiveSourceFormat }),
                      });
                    }}
                  >
                    <option value="">— not stated —</option>
                    {LIVE_SOURCE_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <span style={styles.derived}>{describeAspect(m)}</span>
              </div>

              <ProducerFields
                mapping={m}
                onChange={(producer) => replaceEntry(index, { ...m, producer })}
              />
            </div>
          ))}
        </div>
      )}

      <div style={styles.row}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>New source id</span>
          <input
            className="cg-field"
            type="text"
            value={newId}
            aria-label="New source id"
            placeholder="guest-1"
            onChange={(e) => setNewId(e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={addEntry}>
          Add
        </Button>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>LAYER BAND</div>
        <div style={styles.row}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>From</span>
            <NumericInput
              className="cg-field"
              style={{ width: '5rem' }}
              aria-label="Live source band start layer"
              placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}
              value={bandStart === '' && band !== undefined ? String(band.start) : bandStart}
              onValueChange={setBandStart}
            />
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>To</span>
            <NumericInput
              className="cg-field"
              style={{ width: '5rem' }}
              aria-label="Live source band end layer"
              placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)}
              value={bandEnd === '' && band !== undefined ? String(band.end) : bandEnd}
              onValueChange={setBandEnd}
            />
          </div>
          <Button variant="secondary" onClick={applyBand}>
            Apply band
          </Button>
        </div>
        <p style={styles.hint}>
          The layers live sources are placed on, below the template&rsquo;s own layer. It must not
          overlap the candidate layer bank or the layers the playout system owns — the bridge
          refuses an overlap and names both ranges.{' '}
          {band === undefined
            ? `Nothing is declared yet; ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}–${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)} is the usual choice.`
            : `Currently ${String(band.start)}–${String(band.end)}.`}
        </p>
      </div>
    </Modal>
  );
}

/**
 * The per-kind fields.
 *
 * `keyDevice` appears on the DECKLINK arm ALONE, and that is the schema's shape
 * rather than a layout choice: a fill/key pair is two physical SDI inputs, so
 * offering the field beside a route or an NDI name would invite an operator to
 * configure a pair that cannot exist.
 */
function ProducerFields({
  mapping,
  onChange,
}: {
  mapping: SourceMapping;
  onChange: (producer: SourceProducer) => void;
}): JSX.Element {
  const p = mapping.producer;
  const numeric = (
    label: string,
    aria: string,
    value: number | undefined,
    apply: (n: number | undefined) => void,
    optional = false,
  ): JSX.Element => (
    // A <div>, not a <label>: the caption sits beside the control and the
    // accessible name comes from the input's own `aria-label` — the
    // ServerSettingsPanel pattern, and the one the a11y rule can verify.
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <NumericInput
        className="cg-field"
        style={{ width: '5rem' }}
        aria-label={`${aria} for ${mapping.id}`}
        value={value === undefined ? '' : String(value)}
        placeholder={optional ? '—' : '1'}
        onValueChange={(next) => {
          const trimmed = next.trim();
          if (trimmed === '') {
            apply(undefined);
            return;
          }
          const n = Number(trimmed);
          if (Number.isInteger(n) && n >= 0) apply(n);
        }}
      />
    </div>
  );

  switch (p.kind) {
    case 'route':
      return (
        <div style={styles.row}>
          {numeric('Channel', 'Route channel', p.channel, (n) =>
            onChange({ ...p, channel: n ?? 1 }),
          )}
          {numeric(
            'Layer (optional)',
            'Route layer',
            p.layer,
            (n) =>
              onChange(
                n === undefined ? { kind: 'route', channel: p.channel } : { ...p, layer: n },
              ),
            true,
          )}
        </div>
      );
    case 'decklink':
      return (
        <div style={styles.row}>
          {numeric('Fill device', 'Decklink fill device', p.device, (n) =>
            onChange({ ...p, device: n ?? 1 }),
          )}
          {numeric(
            'Key device (optional)',
            'Decklink key device',
            p.keyDevice,
            (n) =>
              onChange(
                n === undefined ? { kind: 'decklink', device: p.device } : { ...p, keyDevice: n },
              ),
            true,
          )}
        </div>
      );
    case 'ndi':
      return (
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>NDI source name</span>
            <input
              className="cg-field"
              type="text"
              value={p.source}
              aria-label={`NDI source name for ${mapping.id}`}
              placeholder="STUDIO (CAM 2)"
              onChange={(e) => onChange({ ...p, source: e.target.value })}
            />
          </label>
        </div>
      );
    case 'media':
      return (
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Media file</span>
            <input
              className="cg-field"
              type="text"
              value={p.file}
              aria-label={`Media file for ${mapping.id}`}
              placeholder="AMB"
              onChange={(e) => onChange({ ...p, file: e.target.value })}
            />
          </label>
        </div>
      );
  }
}

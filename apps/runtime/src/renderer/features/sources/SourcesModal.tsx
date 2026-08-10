import { useEffect, useState, useSyncExternalStore } from 'react';
import { Trash2 } from 'lucide-react';
import {
  aspectForFormat,
  LIVE_SOURCE_FORMATS,
  nextSourceId,
  sourceAspect,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  type LiveSourceFormat,
  type SourceCatalog,
  type SourceDefinition,
  type SourceProducer,
  type TemplateInfo,
  type TemplateSourceAssignment,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { templateDisplayName } from '../library/templateName.js';
import {
  commitSourceCatalog,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from './sourceStore.js';

/**
 * D-137 / C-015 — the CG Control surface where an installation DEFINES its live
 * sources.
 *
 * ── ⭐ ONE JOB, AFTER THE 2026-08-10 CORRECTION ─────────────────────────
 *
 * This is the installation's own list: what lives this plant has, each with a
 * NAME the operator chose ("Studio A", "Baku", "Skype 1") and its producer. It
 * is built with NO reference to any template.
 *
 * BINDING a plate to one of them is NOT here — it is in the INSPECTOR, beside
 * the template being bound. This surface briefly carried both, and two unrelated
 * jobs in one dialog is what that cost: six plates across two templates, none of
 * them the thing the operator opened this to do, and a scrollbar before the first
 * source existed. Selecting a template shows that template's plates; a global
 * list shows every plate in the station.
 *
 * ── TWO BEHAVIOURS COPIED FROM `DelimitersModal`, DELIBERATELY ──────────────
 *
 * - **No optimistic local update.** Every edit goes through the store, which
 *   adopts the value only once the bridge accepts it. The bridge can refuse (a
 *   duplicate name, a band overlapping the candidate bank), and showing a source
 *   the station does not have would send an operator away believing a guest box
 *   can be bound to it.
 * - **The older-bridge translation.** A station whose bridge predates this
 *   feature answers with a wire identifier; `sourcesTransportMessage` turns every
 *   such answer into a sentence naming the real cause.
 *
 * ── DELETING A SOURCE THAT IS IN USE ───────────────────────────────
 *
 * It is ALLOWED, it CASCADES bridge-side, and this surface SAYS SO at the moment
 * of deletion — naming the templates that referenced it. Those plates then read
 * as needing a source, and their take refuses. Refusing the delete would trap an
 * installation with a live it no longer has; leaving the binding to dangle until
 * air is the failure this project exists to prevent.
 *
 * The FORMAT is a picker, not a number: §3a's decision is that the crop-to-fill
 * aspect DERIVES from the signal format, because a hand-entered aspect is a
 * value that can be wrong on air while looking entirely reasonable. The derived
 * aspect is shown beside the picker so the operator can see what they just said.
 */

const styles = {
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
  derived: { fontSize: '0.72rem', color: colors.textMuted, alignSelf: 'center' },
  section: {
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '0.6rem',
    marginTop: '0.6rem',
  },
  sectionTitle: {
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: colors.textMuted,
    marginBottom: '0.35rem',
  },
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: '0.5rem 0 0' },
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
 * quietly reusing one as the other is how a source comes to point at hardware
 * nobody chose.
 */
function emptyProducer(kind: SourceProducer['kind']): SourceProducer {
  switch (kind) {
    case 'route':
      return { kind: 'route', channel: 1 };
    case 'decklink':
      return { kind: 'decklink', device: 1 };
    case 'ndi':
      return { kind: 'ndi', source: 'NDI SOURCE' };
    case 'media':
      return { kind: 'media', file: 'AMB' };
  }
}

/** What this source resolves to, in the words the bridge will send. */
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
      return `NDI ${p.source}`;
    case 'media':
      return `media ${p.file}`;
  }
}

/** `1.7778` is not an answer an operator can check; `16:9` is. */
function describeAspect(source: SourceDefinition): string {
  const aspect = sourceAspect(source);
  if (aspect === null) return 'aspect: not stated';
  const nearest = [
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['1.90:1 (DCI)', 2048 / 1080],
    ['1.32:1', 2048 / 1556],
  ] as const;
  const match = nearest.find(([, v]) => Math.abs(v - aspect) < 0.001);
  const shown = match === undefined ? aspect.toFixed(3) : match[0];
  const derived = source.format !== undefined && aspectForFormat(source.format) !== null;
  return `aspect: ${shown}${derived ? ' (from the format)' : ''}`;
}

function parseLayerNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
}

/**
 * A text field whose stored value cannot legally be empty (a source NAME, an NDI
 * source name, a media file).
 *
 * It holds a DRAFT while the operator types and commits only a non-empty value,
 * so clearing the field to retype it never sends the wire an entry that its own
 * schema rejects. On blur an empty draft snaps back to the stored value: the
 * committed state is the truth, and a field left blank must not read as a value
 * that was saved.
 */
function RequiredText({
  value,
  label,
  ariaLabel,
  placeholder,
  onCommit,
}: {
  value: string;
  label: string;
  ariaLabel: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        className="cg-field"
        type="text"
        value={draft}
        aria-label={ariaLabel}
        {...(placeholder !== undefined ? { placeholder } : {})}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (next.trim() !== '') onCommit(next);
        }}
        onBlur={() => {
          if (draft.trim() === '') setDraft(value);
        }}
      />
    </label>
  );
}

export function SourcesModal({ onClose }: { onClose: () => void }): JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const catalog = currentSourceCatalog();
  const [message, setMessage] = useState<ModalMessage | null>(null);
  const [newName, setNewName] = useState('');
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([]);

  // Pulled at OPEN, not subscribed: the catalogue is browser-local (B-085) and
  // this dialog is short-lived. It is read for ONE purpose — turning the
  // cascade report's template IDS into the names the operator knows them by.
  useEffect(() => {
    let live = true;
    void window.cg.templates.list().then(
      (list) => {
        if (live) setTemplates(list);
      },
      () => {
        // A list this surface could not read only costs the deletion report its
        // template NAMES; it falls back to ids and everything else still works.
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const refuse = (text: string): void => {
    setMessage({ role: 'refusal', text });
  };

  const commitCatalog = (next: SourceCatalog): void => {
    void commitSourceCatalog(next).then(({ refusal, droppedAssignments }) => {
      if (refusal !== null) {
        setMessage({ role: 'refusal', ...refusal });
        return;
      }
      setMessage(droppedAssignments.length === 0 ? null : describeDropped(droppedAssignments));
    });
  };

  /** The deletion report, in the operator's vocabulary: template names, not ids. */
  const describeDropped = (dropped: readonly TemplateSourceAssignment[]): ModalMessage => {
    const named = dropped.map((a) => {
      const template = templates.find((t) => t.templateId === a.templateId);
      const label = template === undefined ? a.templateId : templateDisplayName(template);
      return `${label} / ${a.plateId}`;
    });
    return {
      role: 'notice',
      text: `${String(dropped.length)} plate${dropped.length === 1 ? '' : 's'} used that source and now need${dropped.length === 1 ? 's' : ''} a new one.`,
      detail: named.join(' · '),
    };
  };

  const replaceSource = (index: number, entry: SourceDefinition): void => {
    commitCatalog({
      ...catalog,
      sources: catalog.sources.map((s, i) => (i === index ? entry : s)),
    });
  };

  const addSource = (): void => {
    const name = newName.trim();
    // The LOCAL checks are about what was typed into this form; the BRIDGE
    // re-checks the whole catalog and is authoritative. These exist so the form
    // can answer instantly, not to be the only guard.
    if (name === '') {
      refuse('Give the source a name — it is what the operator picks, e.g. Studio A.');
      return;
    }
    setNewName('');
    commitCatalog({
      ...catalog,
      sources: [
        ...catalog.sources,
        {
          id: nextSourceId(catalog.sources.map((s) => s.id)),
          name,
          producer: emptyProducer('route'),
        },
      ],
    });
  };

  const applyBand = (): void => {
    const start = parseLayerNumber(bandStart);
    const end = parseLayerNumber(bandEnd);
    if (start === null || end === null) {
      refuse('The band is two layer numbers, e.g. 10 and 59.');
      return;
    }
    if (end < start) {
      refuse('The band ends before it starts — swap the two numbers.');
      return;
    }
    commitCatalog({ ...catalog, layerRange: { start, end } });
  };

  const band = catalog.layerRange;

  return (
    <Modal
      title="Live sources"
      size="wide"
      onClose={onClose}
      {...(message !== null ? { message } : {})}
      footer={
        <ModalAction actionRole="primary" onClick={onClose}>
          Done
        </ModalAction>
      }
    >
      {/*
        ONE line per section, attached to the thing it concerns — never a block of
        prose above the form. The previous version's three paragraphs explained the
        FEATURE, all of it true and none of it needed at the moment of acting;
        sharing one muted grey, nothing on the surface stood out. What survives is
        the fact that changes what the operator does.
      */}
      <div style={styles.sectionTitle}>SOURCES</div>
      {catalog.sources.length === 0 ? (
        <div style={styles.empty} role="status">
          Nothing is defined yet — a template&rsquo;s live plate cannot be taken until it is
          assigned a source.
        </div>
      ) : (
        <div style={styles.list}>
          {catalog.sources.map((source, index) => (
            <div key={source.id} style={styles.entry} data-source-id={source.id}>
              <div style={styles.row}>
                <RequiredText
                  value={source.name}
                  label="Name"
                  ariaLabel={`Name of ${source.name}`}
                  onCommit={(name) => replaceSource(index, { ...source, name })}
                />
                <span style={styles.derived}>{describeProducer(source.producer)}</span>
                <Button
                  variant="danger"
                  aria-label={`Remove ${source.name}`}
                  onClick={() =>
                    commitCatalog({
                      ...catalog,
                      sources: catalog.sources.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Icon icon={Trash2} />
                </Button>
              </div>

              <div style={styles.row}>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Kind</span>
                  <select
                    className="cg-field"
                    style={{ width: 'auto' }}
                    aria-label={`Producer kind for ${source.name}`}
                    value={source.producer.kind}
                    onChange={(e) =>
                      replaceSource(index, {
                        ...source,
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
                    aria-label={`Signal format for ${source.name}`}
                    value={source.format ?? ''}
                    onChange={(e) => {
                      const format = e.target.value;
                      const { format: _drop, ...rest } = source;
                      replaceSource(
                        index,
                        format === '' ? rest : { ...rest, format: format as LiveSourceFormat },
                      );
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
                <span style={styles.derived}>{describeAspect(source)}</span>
              </div>

              <ProducerFields
                source={source}
                onChange={(producer) => replaceSource(index, { ...source, producer })}
              />
            </div>
          ))}
        </div>
      )}

      <div style={styles.row}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>New source name</span>
          <input
            className="cg-field"
            type="text"
            value={newName}
            aria-label="New source name"
            placeholder="Studio A"
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={addSource}>
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
        {/* The rule an operator needs BEFORE typing two numbers — that the band must
            clear the candidate bank and the playout range — stays. What went is the
            sentence promising that the bridge names both ranges on a clash: it does,
            and that refusal is now legible in the pinned region, so saying it in
            advance was one more grey paragraph competing with the thing it describes. */}
        <p style={styles.hint}>
          Placed below the template&rsquo;s own layer; must not overlap the candidate layer bank or
          the playout system&rsquo;s range.{' '}
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
  source,
  onChange,
}: {
  source: SourceDefinition;
  onChange: (producer: SourceProducer) => void;
}): JSX.Element {
  const p = source.producer;
  /**
   * ⚠ `min` IS THE SCHEMA'S OWN FLOOR, not decoration. A channel, a fill device
   * and a key device are all `z.number().int().positive()`, so committing a
   * typed `0` sends the bridge a catalog its own schema rejects — and the answer
   * the operator gets is the frame validator's, naming an IPC channel. The
   * control must not be able to produce a value the contract forbids.
   */
  const numeric = (
    label: string,
    aria: string,
    value: number | undefined,
    min: number,
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
        aria-label={`${aria} for ${source.name}`}
        value={value === undefined ? '' : String(value)}
        placeholder={optional ? '—' : '1'}
        onValueChange={(next) => {
          const trimmed = next.trim();
          if (trimmed === '') {
            apply(undefined);
            return;
          }
          const n = Number(trimmed);
          if (Number.isInteger(n) && n >= min) apply(n);
        }}
      />
    </div>
  );

  switch (p.kind) {
    case 'route':
      return (
        <div style={styles.row}>
          {numeric('Channel', 'Route channel', p.channel, 1, (n) =>
            onChange({ ...p, channel: n ?? 1 }),
          )}
          {numeric(
            'Layer (optional)',
            'Route layer',
            p.layer,
            0,
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
          {numeric('Fill device', 'Decklink fill device', p.device, 1, (n) =>
            onChange({ ...p, device: n ?? 1 }),
          )}
          {numeric(
            'Key device (optional)',
            'Decklink key device',
            p.keyDevice,
            1,
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
          <RequiredText
            value={p.source}
            label="NDI source name"
            ariaLabel={`NDI source name for ${source.name}`}
            placeholder="STUDIO (CAM 2)"
            onCommit={(next) => onChange({ ...p, source: next })}
          />
        </div>
      );
    case 'media':
      return (
        <div style={styles.row}>
          <RequiredText
            value={p.file}
            label="Media file"
            ariaLabel={`Media file for ${source.name}`}
            placeholder="AMB"
            onCommit={(next) => onChange({ ...p, file: next })}
          />
        </div>
      );
  }
}

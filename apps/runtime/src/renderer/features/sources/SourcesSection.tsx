import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  aspectForFormat,
  nextSourceId,
  sourceAspect,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  type SourceCatalog,
  type SourceDefinition,
  type TemplateInfo,
  type TemplateSourceAssignment,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { LiveSourceDialog } from './LiveSourceDialog.js';
import { KIND_BADGE, producerParts } from './sourceKinds.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
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
 * sources. A SECTION of Station setup since `STATION-SETUP-02`, reached from SETTINGS'
 * rail — the status bar's SOURCES button was a second door into the same dialog and
 * `STATION-CHROME-02` §1 removed it.
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
 * source existed. `STATION-SETUP-02` §6 restates it for the move into one dialog:
 * the CATALOG is installation-wide and the ASSIGNMENTS are per-template, and they
 * are two shapes on two channels (`sources.set-config` / `sources.set-assignments`)
 * in two files. This section touches the first and never the second —
 * `stationSetupScope.dom.test.ts` asserts it.
 *
 * ── TWO BEHAVIOURS SHARED WITH THE DELIMITERS SECTION, DELIBERATELY ──────────
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
  empty: { fontSize: '0.82rem', color: colors.textMuted },
  name: { fontWeight: 600, minWidth: 0 },
  kindCol: { width: '7rem' },
  /** The kind CHIP — a word, never a colour alone. */
  kind: {
    fontSize: '0.68rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.1rem 0.4rem',
    whiteSpace: 'nowrap' as const,
  },
  /** §5 — the LABELLED parts of "where it comes from". */
  parts: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.15rem 0.9rem',
    alignItems: 'baseline',
  },
  part: { display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline', minWidth: 0 },
  partLabel: { fontSize: '0.7rem', color: colors.textMuted },
  partValue: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.78rem',
    overflowWrap: 'anywhere' as const,
  },
  derived: { fontSize: '0.72rem', color: colors.textMuted },
  /** The band: two numbers and the button that puts them in force, on one line. */
  bandRow: { display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' as const },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.2rem' },
  fieldLabel: { fontSize: '0.72rem', color: colors.textMuted },
} as const;

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

export function SourcesSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const catalog = currentSourceCatalog();
  /*
    §6 — WHICH RECORD THE SECOND DIALOG IS SHOWING. `null` = closed; `{ source: null }` =
    Add; `{ source }` = Edit. One piece of state for both, because they ARE one dialog —
    that is the whole point of §6, and two flags would let them drift apart.
  */
  const [editing, setEditing] = useState<{ source: SourceDefinition | null } | null>(null);
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([]);

  // Pulled at OPEN, not subscribed: the catalogue is browser-local (B-085) and
  // the dialog is short-lived. It is read for ONE purpose — turning the
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
    report({ role: 'refusal', text });
  };

  const commitCatalog = (next: SourceCatalog): void => {
    void commitSourceCatalog(next).then(({ refusal, droppedAssignments }) => {
      if (refusal !== null) {
        report({ role: 'refusal', ...refusal });
        return;
      }
      report(droppedAssignments.length === 0 ? null : describeDropped(droppedAssignments));
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
    <>
      {/* `STATION-CHROME-02` §3 — the catalogue is a TABLE in a card, and its Add lives in
          the card's head where the block it adds to can be seen. */}
      <section className="cg-card" aria-label="Catalogue">
        <div className="cg-card__head">
          <span className="cg-card__title">Catalogue</span>
          <span className="cg-card__spacer" />
          <Button
            variant="add"
            aria-label="Add live source"
            onClick={() => setEditing({ source: null })}
          >
            Add source
          </Button>
        </div>
        {catalog.sources.length === 0 ? (
          <div className="cg-card__body">
            <span style={styles.empty} role="status">
              Nothing is defined yet — a template&rsquo;s live plate cannot be taken until it is
              assigned a source.
            </span>
          </div>
        ) : (
          <div className="cg-card__body cg-card__body--table">
            <div className="cg-table-scroll">
              <table className="cg-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col" style={styles.kindCol}>
                      Kind
                    </th>
                    <th scope="col">Where it comes from</th>
                    <th scope="col" className="cg-table__actions">
                      <span className="cg-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/*
                    🔴 §5 — THE COLUMNS DEPEND ON THE KIND.

                    The old row printed one derived string — `DECKLINK DEVICE 1`,
                    `NDI CG-INGEST`, `stream srt://…` — into an unlabelled column, forcing
                    three addressing schemes into one shape and naming none of them: an
                    operator reading `1` could not tell a device from a channel from a layer.
                    `producerParts` gives each kind the fields it actually has, each with its
                    own LABEL, and the row renders them.

                    ⚠ Every operator-visible string is isolated in its own `<bdi>`: a source
                    name may be Persian, a URL is Latin, and the labels between them are
                    neutrals whose placement bidi would otherwise decide (golden rule 11).
                  */}
                  {catalog.sources.map((source, index) => (
                    <tr key={source.id} data-source-id={source.id}>
                      <td>
                        <bdi style={styles.name}>{source.name}</bdi>
                      </td>
                      <td>
                        <span style={styles.kind} data-source-kind={source.producer.kind}>
                          {KIND_BADGE[source.producer.kind]}
                        </span>
                      </td>
                      <td>
                        <div style={styles.parts} data-source-parts="">
                          {producerParts(source.producer).map((part) => (
                            <span key={part.label} style={styles.part}>
                              <span style={styles.partLabel}>{part.label}</span>
                              <bdi style={styles.partValue}>{part.value}</bdi>
                            </span>
                          ))}
                          <span style={styles.part}>
                            <span style={styles.partLabel}>Format</span>
                            <bdi style={styles.partValue}>{source.format ?? '— not stated —'}</bdi>
                          </span>
                          <span style={styles.derived}>{describeAspect(source)}</span>
                        </div>
                      </td>
                      <td className="cg-table__actions">
                        <span className="cg-table__actions-group">
                          {/* §3 — the two row actions are QUIET icons in a fixed column;
                              only the destructive one reddens, and only on intent. */}
                          <Button
                            variant="quiet"
                            aria-label={`Edit ${source.name}`}
                            title="Edit this source"
                            onClick={() => setEditing({ source })}
                          >
                            <Icon icon={Pencil} size={15} />
                          </Button>
                          <Button
                            variant="quiet"
                            className="cg-list-remove"
                            aria-label={`Remove ${source.name}`}
                            title="Remove this source"
                            onClick={() =>
                              commitCatalog({
                                ...catalog,
                                sources: catalog.sources.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Icon icon={Trash2} size={15} />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/*
          §5's other half, and it is a decision rather than a caption: the CATALOGUE is
          installation-wide; WHICH PLATE uses which source is per-template, in the Inspector.
          Merging the two SURFACES was right; merging the two SHAPES would make an assignment
          installation-wide, which is the defect `LiveSourceSwapDialog`'s own intro exists to
          prevent.

          `STATION-CHROME-02` §3 — a muted NOTE under the body, not body text competing with
          the controls above it.
        */}
        <p className="cg-card__note">
          The station&rsquo;s catalogue of sources. Which plate uses which source is set per
          template in the Inspector — one catalogue here, the bindings there.
        </p>
      </section>

      {/*
        🔴 THE LAYER BAND — the one control on this tab that is APPLIED rather than saved as
        you go, which is why it carries its own button and why the tab's footer says so
        (`STATION-CHROME-02` §5: the footer used to claim there was nothing waiting to be
        applied, with this button six inches above it).
      */}
      <section className="cg-card" aria-label="Layer band">
        <div className="cg-card__head">
          <span className="cg-card__title">Layer band</span>
        </div>
        <div className="cg-card__body">
          <div style={styles.bandRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>From</span>
              <NumericInput
                className="cg-field"
                style={{ width: '6rem' }}
                aria-label="Live source band start layer"
                placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}
                value={bandStart === '' && band !== undefined ? String(band.start) : bandStart}
                onValueChange={setBandStart}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>To</span>
              <NumericInput
                className="cg-field"
                style={{ width: '6rem' }}
                aria-label="Live source band end layer"
                placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)}
                value={bandEnd === '' && band !== undefined ? String(band.end) : bandEnd}
                onValueChange={setBandEnd}
              />
            </label>
            <Button variant="primary" onClick={applyBand}>
              Apply band
            </Button>
          </div>
        </div>
        {/* The rule an operator needs BEFORE typing two numbers — that the band must
            clear the candidate bank and the playout range — stays. The bridge names both
            ranges on a clash, and that refusal is legible in the pinned region. */}
        <p className="cg-card__note">
          Placed below the template&rsquo;s own layer; must not overlap the candidate layer bank or
          the playout system&rsquo;s range.{' '}
          {band === undefined
            ? `Nothing is declared yet; ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}–${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)} is the usual choice.`
            : `Currently ${String(band.start)}–${String(band.end)}.`}
        </p>
      </section>

      {/*
        §6 — THE SAME SMALL SECOND DIALOG for Add and for Edit. It holds a DRAFT and reaches
        the catalogue only on the confirming press, which is a real change from the inline
        editors this replaced: those sent every keystroke to the bridge.
      */}
      {editing !== null && (
        <LiveSourceDialog
          source={editing.source}
          existingNames={catalog.sources
            .filter((s) => s.id !== editing.source?.id)
            .map((s) => s.name)}
          onCancel={() => setEditing(null)}
          onCommit={(draft) => {
            const current = editing.source;
            const next: SourceDefinition =
              current === null
                ? { id: nextSourceId(catalog.sources.map((s) => s.id)), ...draft }
                : {
                    ...current,
                    ...draft,
                    ...(draft.format === undefined ? { format: undefined } : {}),
                  };
            const cleaned =
              next.format === undefined ? (({ format: _drop, ...rest }) => rest)(next) : next;
            commitCatalog({
              ...catalog,
              sources:
                current === null
                  ? [...catalog.sources, cleaned as SourceDefinition]
                  : catalog.sources.map((s) =>
                      s.id === current.id ? (cleaned as SourceDefinition) : s,
                    ),
            });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

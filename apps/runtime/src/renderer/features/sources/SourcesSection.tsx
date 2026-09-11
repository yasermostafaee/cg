import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  aspectForFormat,
  nextSourceId,
  // `B-237` — the BRIDGE's own cascade function, run in advance on the bridge's own published
  // assignments, so the question names exactly what the act will do.
  pruneAssignmentsForCatalog,
  sourceAspect,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  type SourceCatalog,
  type SourceDefinition,
  type TemplateInfo,
  type TemplateSourceAssignment,
} from '@cg/shared-ipc';
import { STATION_SETUP_PX, colors } from '../../theme.js';
import { LiveSourceDialog } from './LiveSourceDialog.js';
import { KIND_BADGE, KIND_ICON, producerParts } from './sourceKinds.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { templateDisplayName } from '../library/templateName.js';
import { useConfirm } from '../../ui/useDialog.js';
import {
  commitSourceCatalog,
  currentSourceAssignments,
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
  /*
   * ⚠ `SETTINGS-MATCH-02` — `name`, `kindCol`, `kind`, `parts`, `partLabel`, `partValue`,
   * `derived`, `bandRow`, `field` and `fieldLabel` are GONE rather than unused. Every one of
   * them was a hand-set rank or a hand-set gap for the TABLE this section no longer draws, and
   * each now has a measured `.cg-resource-*` / `.cg-setup-band-*` rule behind it. Leaving them
   * would leave a second spelling of a row that has one.
   */
  /** The row's middle column — it takes the remaining width and may shrink to nothing. */
  rowText: { minWidth: 0 },
  /** One labelled part of "where it comes from", inline with its value. */
  part: { display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline', minWidth: 0 },
  /** The band sits its own distance below the catalogue — the reference's `.band-card`. */
  bandCard: { marginTop: 'var(--r-setup-band-gap-above)' },
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
  /** `B-237` — the question asked before a catalogue entry is dropped or re-pointed. */
  const { confirm, confirmDialog } = useConfirm();

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

  /**
   * 🔴 `B-237` — **WHAT WOULD BE LOST, WORKED OUT BEFORE THE ACT RATHER THAN READ BACK AFTER IT.**
   *
   * ── WHY THIS IS A CONFIRMATION AND NOT A REFUSAL ────────────────────────────
   *
   * Deleting a source that is bound is ALLOWED, and that is a written decision, not an
   * oversight: `@cg/shared-ipc`'s `sources.ts` records it verbatim — _"an installation must be
   * able to retire a live"_ — and the deletion CASCADES rather than dangling. The first
   * spelling of this fix added a bridge refusal for the on-air case and was withdrawn: a
   * published decision beats a re-derived one, and the fact settles it too, because the
   * cascade takes nothing off air. Level 2 is frozen at take, so what is up stays up; only the
   * NEXT take refuses, with `live-source-unassigned`.
   *
   * The real gap the decision never addressed is that the act was never ASKED. One press of a
   * bin dropped a catalogue entry and every plate binding to it, across every template, and
   * said so only afterwards.
   *
   * ── THE FALLOUT IS COMPUTED WITH THE BRIDGE'S OWN FUNCTION ──────────────────
   *
   * `pruneAssignmentsForCatalog` is the exact function the bridge runs on the way through, and
   * it is run here on the PUBLISHED assignments against the catalogue this press would send.
   * That is not the `B-228` mistake: both inputs are the bridge's own published values and the
   * function is the bridge's own, exported for this. What would have been the mistake is
   * hand-rolling a `some(a => a.sourceId === id)` beside it.
   *
   * ⚠ **AND WHAT IT CANNOT SAY, said plainly rather than guessed.** The confirmation names
   * every template and plate that WOULD BE DROPPED. It does NOT say which of them is on air at
   * this moment: that answer is the frozen-at-take level 2 (`assignmentInForce`) plus per-look
   * and per-row overrides, which live on the stack item and not in this store — so the
   * renderer cannot answer it without re-resolving the take, which is precisely the derivation
   * `B-228` forbids. It is a gap in the sentence, not a gap in the guard, and closing it means
   * the bridge publishing the answer.
   */
  const bindingsFor = (sourceId: string): readonly TemplateSourceAssignment[] => {
    const next: SourceCatalog = {
      ...catalog,
      sources: catalog.sources.filter((s) => s.id !== sourceId),
    };
    return pruneAssignmentsForCatalog(currentSourceAssignments(), next).dropped;
  };

  /** The templates and boxes a set of bindings covers, in the operator's words. */
  const describeBindings = (bound: readonly TemplateSourceAssignment[]): string => {
    const byTemplate = new Map<string, number>();
    for (const a of bound) byTemplate.set(a.templateId, (byTemplate.get(a.templateId) ?? 0) + 1);
    const named = [...byTemplate.entries()].map(([templateId, boxes]) => {
      const template = templates.find((t) => t.templateId === templateId);
      const label = template === undefined ? templateId : templateDisplayName(template);
      /*
        ⚠ §1 — HOW MANY BOXES, not just how many templates. A multi-box template may bind one
        source to several of its plates, and "used by 1 template" would understate what
        disappears from the screen by a factor of four.
      */
      return boxes === 1 ? label : `${label} (${String(boxes)} boxes)`;
    });
    return named.join(', ');
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

  /** `B-237` — ask, name the fallout, and only then send. */
  const removeSource = async (source: SourceDefinition, index: number): Promise<void> => {
    const bound = bindingsFor(source.id);
    const boxes = bound.length;
    const templateCount = new Set(bound.map((a) => a.templateId)).size;
    /*
      🔴🔴 `SETTINGS-MATCH-02` §8d — **THE ONE PLACE OURS MUST BEAT THE REFERENCE, AND IT IS A
      SAFETY DECISION RATHER THAN A LOOK.**

      The reference's remove says _"Check any template bindings that refer to this source."_ —
      it sends the operator away to look, at the moment he is deciding, and tells him nothing
      about what will actually happen. `B-237` settled the opposite for this product: deleting
      a bound source CASCADES, so the confirmation NAMES what it would drop — the plates, the
      templates, the count — computed with the bridge's own `pruneAssignmentsForCatalog` on the
      bridge's own published assignments.

      So the FRAME is the reference's (the emblem tile, the bold name, the calm consequence
      line) and the SENTENCE is ours. Nothing about the refusal CONDITION changes: the delete
      is allowed and always was, and the bridge cascades either way.
    */
    const confirmed = await confirm({
      title: `Remove “${source.name}”?`,
      destructive: true,
      // §8 — raised from INSIDE Station setup, so it takes that family's 480 frame and the
      // lighter scrim that keeps the dialog underneath visible.
      layer: 'sub',
      body: (
        <>
          <p className="cg-confirm-copy">
            Remove <strong>{source.name}</strong> from the source catalogue?
          </p>
          <p className="cg-confirm-copy">
            {boxes === 0
              ? `Nothing is bound to it, so no template changes. It cannot be picked again until it is re-defined.`
              : `${String(boxes)} ${boxes === 1 ? 'plate' : 'plates'} on ` +
                `${String(templateCount)} ${templateCount === 1 ? 'template' : 'templates'} ` +
                `${boxes === 1 ? 'is' : 'are'} bound to it — ${describeBindings(bound)}. Removing it ` +
                `unassigns ${boxes === 1 ? 'that plate' : 'those plates'}: anything already on air ` +
                `stays up, and the next take of ${templateCount === 1 ? 'that template' : 'those templates'} ` +
                `is refused until a new source is assigned in the Inspector.`}
          </p>
        </>
      ),
      confirmLabel: 'Remove source',
      tone: 'remove',
    });
    if (!confirmed) return;
    commitCatalog({ ...catalog, sources: catalog.sources.filter((_, i) => i !== index) });
  };

  return (
    <>
      {/*
        `SETTINGS-MATCH-02` — THE REFERENCE'S `.list-header` over a `.resource-list`.

        ⚠ **This replaces a TABLE, and the swap is the point rather than a preference.** A
        table is read DOWN A COLUMN — which of these is the pipe, which is the DeckLink — and
        that is the right shape for the delimiters, which have two short values per row. A
        source has a NAME, a KIND and a variable-length address whose fields differ per kind
        (a device index, an NDI name, a URL), so its "Where it comes from" column held a
        different shape on every row and the column below it could not be scanned. The
        reference draws a RECORD ROW for exactly that: a kind tile, a title line, and the
        address as one mono detail line under it.
      */}
      <div className="cg-setup-list-head">
        <h3>
          Source catalogue <span className="cg-setup-count">{String(catalog.sources.length)}</span>
        </h3>
        <Button
          variant="add"
          aria-label="Add live source"
          onClick={() => setEditing({ source: null })}
        >
          <Icon icon={Plus} size={STATION_SETUP_PX.btnIcon} />
          Add source
        </Button>
      </div>
      <section className="cg-card cg-resource-list" aria-label="Catalogue">
        {catalog.sources.length === 0 ? (
          <div className="cg-card__body">
            <span style={styles.empty} role="status">
              Nothing is defined yet — a template&rsquo;s live plate cannot be taken until it is
              assigned a source.
            </span>
          </div>
        ) : (
          /*
            🔴 §5 — THE DETAIL LINE'S FIELDS STILL DEPEND ON THE KIND, and that is the part of
            the old table worth keeping. The row used to print one derived string —
            `DECKLINK DEVICE 1`, `NDI CG-INGEST` — naming none of its parts, so an operator
            reading `1` could not tell a device from a channel from a layer. `producerParts`
            gives each kind the fields it actually has, each with its own LABEL; what changed
            is only that they are one line under the name rather than a column of their own.

            ⚠ Every operator-visible string is isolated in its own `<bdi>`: a source name may
            be Persian, a URL is Latin, and the labels between them are neutrals whose
            placement bidi would otherwise decide (golden rule 11).
          */
          catalog.sources.map((source, index) => (
            <div className="cg-resource" key={source.id} data-source-id={source.id}>
              <span className="cg-resource__icon" aria-hidden="true">
                <Icon icon={KIND_ICON[source.producer.kind]} size={20} />
              </span>
              <div style={styles.rowText}>
                <div className="cg-resource__title">
                  <bdi className="cg-resource__name">{source.name}</bdi>
                  <span className="cg-resource__type" data-source-kind={source.producer.kind}>
                    {KIND_BADGE[source.producer.kind]}
                  </span>
                </div>
                <div className="cg-resource__detail" data-source-parts="">
                  {producerParts(source.producer).map((part) => (
                    <span key={part.label} style={styles.part}>
                      <span>{part.label}</span>
                      <bdi className="cg-resource__value">{part.value}</bdi>
                    </span>
                  ))}
                  <span style={styles.part}>
                    <span>Format</span>
                    <bdi className="cg-resource__value">{source.format ?? '— not stated —'}</bdi>
                  </span>
                  <span>{describeAspect(source)}</span>
                </div>
              </div>
              <span className="cg-resource__actions">
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
                  onClick={() => void removeSource(source, index)}
                >
                  <Icon icon={Trash2} size={15} />
                </Button>
              </span>
            </div>
          ))
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
      <section className="cg-card" aria-label="Layer band" style={styles.bandCard}>
        <div className="cg-card__head">
          <span className="cg-card__title">Live source layer band</span>
          <span className="cg-card__spacer" />
          {/*
            ⭐ The reference's `Apply separately` tag, at the CARD level, and it is the one
            thing that makes this tab's two contracts legible at a glance: the catalogue above
            saves as you go and this does not. The footer already says so in words; the tag
            says it where the control is.
          */}
          <span className="cg-setup-card-tag">Apply separately</span>
        </div>
        <div className="cg-card__body">
          <p className="cg-setup-lede">
            Reserve the layer range live inputs use, below the graphic templates.
          </p>
          {/*
            `SETTINGS-MATCH-02` — the reference's `.band-fields`: two labelled fields with a
            range dash between them and the Apply at the row's end, capped so the pair reads
            as ONE range rather than as two unrelated numbers across an 806 px card.
          */}
          <div className="cg-setup-band-fields">
            {/*
              🔴 `SETTINGS-MATCH-02` §10.3/§10.5 — both are whole numbers, both are `ltr`, and
              Persian digits normalise before anything asks whether the character is a digit.
              ⚠ The band's OVERLAP refusal is untouched: the beds, the candidate bank and the
              playout system's reserved range are the bridge's to judge and it still does, on
              apply, naming both ranges. This only stops nonsense reaching that check.
            */}
            <div className="cg-setup-field">
              <span className="cg-setup-field__label">First layer</span>
              <NumericInput
                className="cg-field cg-field--mono"
                dir="ltr"
                allow="digits"
                aria-label="Live source band start layer"
                placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}
                value={bandStart === '' && band !== undefined ? String(band.start) : bandStart}
                onValueChange={setBandStart}
              />
            </div>
            <span className="cg-setup-band-dash" aria-hidden="true">
              —
            </span>
            <div className="cg-setup-field">
              <span className="cg-setup-field__label">Last layer</span>
              <NumericInput
                className="cg-field cg-field--mono"
                dir="ltr"
                allow="digits"
                aria-label="Live source band end layer"
                placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)}
                value={bandEnd === '' && band !== undefined ? String(band.end) : bandEnd}
                onValueChange={setBandEnd}
              />
            </div>
            <Button variant="primary" onClick={applyBand}>
              Apply band
            </Button>
          </div>
          {/* What is IN FORCE right now, under the two draft fields — the reference's
              `.band-summary`. Without it the fields show a draft that looks like a fact. */}
          <p className="cg-setup-band-summary">
            {band === undefined
              ? `Nothing is declared yet; ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}–${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)} is the usual choice.`
              : `Currently ${String(band.start)}–${String(band.end)} · ${String(band.end - band.start + 1)} layers.`}
          </p>
        </div>
        {/* The rule an operator needs BEFORE typing two numbers — that the band must
            clear the candidate bank and the playout range — stays. The bridge names both
            ranges on a clash, and that refusal is legible in the pinned region. */}
        <p className="cg-card__note">
          Placed below the template&rsquo;s own layer; must not overlap the candidate layer bank or
          the playout system&rsquo;s range. The bridge validates it and names both ranges on a
          clash.
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
            const send = (): void => {
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
            };
            /*
              🔴 `B-237` — **EDIT IS THE WORSE OF THE TWO, AND IT HAD NO GATE AT ALL.**

              A delete at least announced itself afterwards, through `describeDropped`. An edit
              REMOVES NOTHING, so that notice never fired — and re-pointing a bound source's
              device index, NDI name or URL silently redefines what every plate on it is
              showing, including the ones on air. The binding survives; what it resolves to
              does not.

              Same question, same computation, different verb: the bindings are the ones a
              DELETE would drop, which is exactly the set an edit re-points.

              ⚠ Only when it is BOUND, and only when it is an EDIT. Adding a source and
              editing an unbound one change nothing on screen and are not worth a question —
              a confirmation the operator meets for nothing is one he stops reading.
            */
            const bound = current === null ? [] : bindingsFor(current.id);
            if (bound.length === 0) {
              send();
              return;
            }
            const templateCount = new Set(bound.map((a) => a.templateId)).size;
            void confirm({
              title: `Change “${current?.name ?? ''}” while it is in use?`,
              body:
                `${String(bound.length)} ${bound.length === 1 ? 'plate' : 'plates'} on ` +
                `${String(templateCount)} ${templateCount === 1 ? 'template' : 'templates'} ` +
                `${bound.length === 1 ? 'is' : 'are'} bound to this source — ` +
                `${describeBindings(bound)}. They keep the binding and start showing whatever ` +
                `this now points at. Anything already on air keeps the picture it took; the ` +
                `change reaches it at the next take.`,
              confirmLabel: 'Change source',
            }).then((ok) => {
              if (ok) send();
            });
          }}
        />
      )}
      {/* `B-237` — the confirmation, portalled above this dialog. */}
      {confirmDialog}
    </>
  );
}

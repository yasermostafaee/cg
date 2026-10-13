import { useState, useSyncExternalStore } from 'react';
import { SUGGESTED_LIVE_SOURCE_LAYER_RANGE } from '@cg/shared-ipc';
import { KIND_ICON, KIND_WORD } from './sourceKinds.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Tag } from '../../ui/Tag.js';
import { useHoldsStationAdmin } from '../../hooks/useCanOperate.js';
import { colors } from '../../theme.js';
import {
  commitSourceBand,
  currentPlateBand,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from './sourceStore.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.C — **STATION SETUP ▸ LIVE SOURCES: THE PLAYOUT'S INPUTS, AS READ, AND
 * THE PLATE BAND.**
 *
 * The station's sources are the Playout's now (D10 inputs, D11 media — `PLAYOUT-SOURCES-01` §1), so
 * this section no longer DEFINES anything: the hand-made catalogue, its Add, Edit and Remove, and the
 * dialog behind them went with §1.F. What is left is what an operator setting a station up needs to
 * see and cannot see anywhere else:
 *
 *   - the Playout's INPUTS, read-only, in its own order — the NAME its operators gave each cable or
 *     feed, its KIND (`SDI`, `NDI`, `Stream` — the one place the kind is shown) and its format;
 *     `Unusable` marked, with the reason on hover; NEVER an address (§1.E);
 *   - WHEN the list was last read successfully — the list stays in force through an outage, so the
 *     time is what says how old it is;
 *   - the PLATE BAND, still editable, the one catalogue fact CG Control owns.
 *
 * Media are not listed here: a library is searched where a plate is bound (the picker), not read
 * through in settings.
 */

const styles = {
  empty: { fontSize: '0.82rem', color: colors.textMuted },
  /** The row's middle column — it takes the remaining width and may shrink to nothing. */
  rowText: { minWidth: 0 },
  /** One labelled part of the row's detail line, inline with its value. */
  part: { display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline', minWidth: 0 },
  /** The band sits its own distance below the list — the reference's `.band-card`. */
  bandCard: { marginTop: 'var(--r-setup-band-gap-above)' },
} as const;

/** The last good read, as a time an operator can check against the clock. */
const READ_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });

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
  // The Playout's list as it stands: its inputs, in its order. Media and the inputs it no longer
  // lists are not the list.
  const inputs = catalog.sources.filter((s) => s.origin !== 'media' && s.departed !== true);
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');
  /*
    🔴 `MULTI-CHANNEL-01` §2 I — the band is `sources.set-config`, a `station-admin` route. For
    anyone else it is the band IN FORCE, as a value: no fields and no Apply band — absent, not
    greyed.
  */
  const admin = useHoldsStationAdmin();

  const refuse = (text: string): void => {
    report({ role: 'refusal', text });
  };

  /*
    🔴 `PLATE-BAND-01` — THE BAND IN FORCE, not the declared one: a Playout-linked station with none
    declared seats its plates in the default band, so that is what this tab shows, and it says
    `default` when it is the computed one. The bridge decides (`plateBandInForce`); this only reads.
  */
  const inForce = currentPlateBand();
  const band = inForce?.range;

  /*
    🔴 **WHAT THE FIELD SHOWS AND WHAT `Apply band` READS ARE ONE VALUE, READ ONCE.** An untouched
    field is the operator accepting the band already in force, which is exactly what it shows — a
    default included: applying it untouched DECLARES it, by a station-admin's own press, and never
    on its own.
  */
  const bandStartText = bandStart === '' && band !== undefined ? String(band.start) : bandStart;
  const bandEndText = bandEnd === '' && band !== undefined ? String(band.end) : bandEnd;

  const applyBand = (): void => {
    const start = parseLayerNumber(bandStartText);
    const end = parseLayerNumber(bandEndText);
    if (start === null || end === null) {
      // `LAYER-BANDS-16` — the example is DERIVED from the suggested band, never restated.
      refuse(
        `The band is two layer numbers, e.g. ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)} and ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)}.`,
      );
      return;
    }
    if (end < start) {
      refuse('The band ends before it starts — swap the two numbers.');
      return;
    }
    void commitSourceBand({ start, end }).then((refusal) => {
      report(refusal === null ? null : { role: 'refusal', ...refusal });
    });
  };

  return (
    <>
      <div className="cg-setup-list-head">
        <h3>
          Inputs from the Playout <span className="cg-setup-count">{String(inputs.length)}</span>
        </h3>
        <span className="cg-setup-read" data-sources-read="">
          {catalog.inputsReadAt === undefined
            ? 'Not read yet'
            : `Last read ${READ_TIME.format(new Date(catalog.inputsReadAt))}`}
        </span>
      </div>
      <section className="cg-card cg-resource-list" aria-label="Inputs from the Playout">
        {inputs.length === 0 ? (
          <div className="cg-card__body">
            <span style={styles.empty} role="status" data-sources-empty="">
              No inputs from the Playout.
            </span>
          </div>
        ) : (
          inputs.map((source) => (
            <div
              className="cg-resource"
              key={source.id}
              data-source-input=""
              {...(source.status === 'unusable' ? { 'data-source-unusable': '' } : {})}
            >
              <span className="cg-resource__icon" aria-hidden="true">
                <Icon icon={KIND_ICON[source.producer.kind]} size={20} />
              </span>
              <div style={styles.rowText}>
                <div className="cg-resource__title">
                  {/* The Playout operators' NAME — data, isolated (golden rule 11). */}
                  <bdi className="cg-resource__name">{source.name}</bdi>
                  <span
                    className="cg-resource__type"
                    data-source-kind={KIND_WORD[source.producer.kind]}
                  >
                    {KIND_WORD[source.producer.kind]}
                  </span>
                  {source.status === 'unusable' && (
                    <Tag className="cg-source-tag" title={source.reason}>
                      Unusable
                    </Tag>
                  )}
                  {source.status === 'unavailable' && (
                    <Tag className="cg-source-tag cg-source-tag--unavailable" title={source.reason}>
                      Unavailable
                    </Tag>
                  )}
                </div>
                <div className="cg-resource__detail">
                  <span style={styles.part}>
                    <span>Format</span>
                    <bdi className="cg-resource__value">{source.format ?? 'AUTO'}</bdi>
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/*
        🔴 THE LAYER BAND — the one control on this tab that is APPLIED rather than read, which is
        why it carries its own button.
      */}
      <section className="cg-card" aria-label="Layer band" style={styles.bandCard}>
        <div className="cg-card__head">
          <span className="cg-card__title">Live source layer band</span>
          <span className="cg-card__spacer" />
          {admin && <Tag className="cg-setup-card-tag">Apply separately</Tag>}
        </div>
        <div className="cg-card__body">
          {admin && (
            <div className="cg-setup-band-fields">
              {/*
                🔴 `SETTINGS-MATCH-02` §10.3/§10.5 — both are whole numbers, both are `ltr`, and
                Persian digits normalise before anything asks whether the character is a digit.
                ⚠ The band's OVERLAP refusal is the bridge's to judge, on apply, naming both ranges.
              */}
              <div className="cg-setup-field">
                <span className="cg-setup-field__label">First layer</span>
                <NumericInput
                  className="cg-field cg-field--mono"
                  dir="ltr"
                  allow="digits"
                  aria-label="Live source band start layer"
                  placeholder={String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}
                  value={bandStartText}
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
                  value={bandEndText}
                  onValueChange={setBandEnd}
                />
              </div>
              <Button variant="primary" onClick={applyBand}>
                Apply band
              </Button>
            </div>
          )}
          {/* What is IN FORCE right now — for a principal who cannot apply a band, it IS the band. */}
          <p className="cg-setup-band-summary" data-plate-band={inForce?.origin ?? 'none'}>
            {inForce === null
              ? `Nothing is declared yet; ${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start)}–${String(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end)} is the usual choice.`
              : `Currently ${String(inForce.range.start)}–${String(inForce.range.end)}${inForce.origin === 'default' ? ' · default' : ''} · ${String(inForce.range.end - inForce.range.start + 1)} layers.`}
          </p>
        </div>
      </section>
    </>
  );
}

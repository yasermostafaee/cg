import { useState, useSyncExternalStore } from 'react';
import { assignedSourceId, type TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Notice } from '../../ui/Notice.js';
import {
  commitSourceAssignments,
  currentSourceAssignments,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';

/**
 * D-137 / C-015 — bind each of THIS template's live plates to one of the
 * installation's sources.
 *
 * ── WHY IT IS HERE AND NOT IN THE LIVE SOURCES MODAL ────────────────────────
 *
 * It was there first, and the cost showed immediately: that dialog then did two
 * unrelated jobs — DEFINING the station's sources and BINDING every plate of
 * every template — and an installation with two templates already scrolled past
 * six plates before the first source existed. The binding belongs beside the
 * thing being bound, and selecting a template shows that template's plates only.
 *
 * ── 🔴 THE ASSIGNMENT IS TEMPLATE-LEVEL, AND THE SECTION SAYS SO ────────────
 *
 * This is not a per-row setting. It is the DEFAULT for every use of this
 * template, so editing it from one row changes what every other row carrying the
 * same template will do. That is stated in the section, in a line, rather than
 * hidden in a tooltip: an operator must not discover it by surprise on air.
 *
 * `R-048`'s fast on-air swap is the PER-RUN OVERRIDE that sits on top of this,
 * and it deliberately does NOT write back — an emergency substitution must never
 * silently become the permanent configuration.
 *
 * ── ⚠ A TEMPLATE NOT ON A ROW CANNOT BE ASSIGNED. That is accepted ──────────
 *
 * Under R-028 every template that will be used is on a declared row, so loading
 * it is the natural first step, and a take of an unassigned plate refuses anyway.
 * Recorded as the decision rather than left as an omission.
 */

const styles = {
  row: {
    display: 'flex',
    gap: 'var(--r-space-3)',
    alignItems: 'center',
    marginBottom: 'var(--r-space-2)',
    flexWrap: 'wrap' as const,
  },
  plate: { fontFamily: 'monospace', fontSize: 'var(--r-text-sm)', minWidth: '6rem' },
  /**
   * An unassigned plate is AMBER — this palette's ATTENTION role, the one the
   * template picker row already uses for an unreadable carrier. Not red: nothing
   * is broken, the work is simply not done yet.
   */
  needs: { fontSize: '11px', color: colors.pending },
  scope: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: '0 0 var(--r-space-3)' },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
} as const;

export function LivePlatesSection({
  templateId,
  info,
}: {
  templateId: string;
  info: TemplateInfo | null;
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const [refusal, setRefusal] = useState<{ text: string; detail?: string } | null>(null);
  const catalog = currentSourceCatalog();
  const assignments = currentSourceAssignments();
  const plates = info?.liveSources?.sources ?? [];

  // A template with no live plates gets NO section. An empty heading is a
  // question the operator did not ask, on the panel they use most.
  if (plates.length === 0) return null;

  const assign = (plateId: string, sourceId: string): void => {
    const rest = assignments.assignments.filter(
      (a) => !(a.templateId === templateId && a.plateId === plateId),
    );
    const next = sourceId === '' ? rest : [...rest, { templateId, plateId, sourceId }];
    void commitSourceAssignments({ assignments: next }).then(setRefusal);
  };

  return (
    <div className="cg-inspector-section" aria-label="Live plates">
      <h2>LIVE PLATES</h2>
      {/* The scope, said once and in the section rather than in a tooltip. */}
      <p style={styles.scope}>
        Set for the template, not this row — every row using it takes the same sources.
      </p>
      {catalog.sources.length === 0 ? (
        <p style={styles.empty}>
          No sources are defined on this station yet — define them under Live sources first.
        </p>
      ) : null}
      {plates.map((plate) => {
        const assigned = assignedSourceId(assignments, templateId, plate.sourceId);
        return (
          <div key={plate.elementId} style={styles.row}>
            <span style={styles.plate}>{plate.sourceId}</span>
            <select
              className="cg-field"
              style={{ width: 'auto' }}
              aria-label={`Source for ${plate.sourceId}`}
              value={assigned ?? ''}
              onChange={(e) => assign(plate.sourceId, e.target.value)}
            >
              <option value="">— not assigned —</option>
              {catalog.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            {assigned === null && (
              <span style={styles.needs} data-plate-unassigned={plate.sourceId}>
                needs a source
              </span>
            )}
          </div>
        );
      })}
      {refusal !== null && (
        <Notice
          noticeRole="refusal"
          text={refusal.text}
          {...(refusal.detail !== undefined ? { detail: refusal.detail } : {})}
        />
      )}
    </div>
  );
}

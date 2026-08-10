import { useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from '../sources/sourceStore.js';
import {
  draftsVersion,
  effectivePlateSource,
  isPlateDirty,
  stagePlateSource,
  subscribeDrafts,
} from './draftStore.js';
import { appliedPlateSources } from './livePlates.js';

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
 * ── 🔴 IT STAGES A DRAFT, THROUGH THE INSPECTOR'S OWN MECHANISM ─────────────
 *
 * The picker writes to `draftStore` — the SAME module every other field on this
 * panel uses — and reaches the bridge only through `Update`. It is not
 * consistency for its own sake: **the assignment is TEMPLATE-level**, shared by
 * every row carrying this template, so a picker that committed on change would
 * let one stray click silently change what those other rows do, with no moment to
 * notice and nothing to undo. **The draft IS the confirmation step.**
 *
 * Everything that already guards an unapplied edit therefore guards this one,
 * because it is the same state: `Discard` drops it (`clearDraft`), the dirty
 * marker and the panel's unapplied-edits chip see it (`isItemDirty`), it SURVIVES
 * a selection switch and a panel/fullscreen round-trip (drafts are keyed by item,
 * and the prune that once destroyed them on remount fails closed —
 * `useStackHousekeeping`'s header), and `Update` writes it through `applyDraft`
 * alongside the field payload.
 *
 * ── 🔴 THE ASSIGNMENT IS TEMPLATE-LEVEL, AND THE SECTION SAYS SO ────────────
 *
 * It is the DEFAULT for every use of this template. That is stated in the
 * section, in a line, rather than hidden in a tooltip: an operator must not
 * discover it by surprise on air.
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
  timing: { color: colors.pending, fontSize: 'var(--r-text-sm)', margin: 'var(--r-space-2) 0 0' },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
} as const;

export function LivePlatesSection({
  item,
  info,
}: {
  item: StackItemState;
  info: TemplateInfo | null;
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  const catalog = currentSourceCatalog();
  const plates = info?.liveSources?.sources ?? [];

  // A template with no live plates gets NO section. An empty heading is a
  // question the operator did not ask, on the panel they use most.
  if (plates.length === 0) return null;

  const applied = appliedPlateSources(item.templateId, plates);
  const staged = plates.filter((p) =>
    isPlateDirty(item.itemId, p.sourceId, applied.get(p.sourceId) ?? null),
  );

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
        const appliedSource = applied.get(plate.sourceId) ?? null;
        const value = effectivePlateSource(item.itemId, plate.sourceId, appliedSource);
        const dirty = isPlateDirty(item.itemId, plate.sourceId, appliedSource);
        return (
          <div key={plate.elementId} style={styles.row}>
            <span style={styles.plate}>{plate.sourceId}</span>
            <select
              className={dirty ? 'cg-field is-dirty' : 'cg-field'}
              style={{ width: 'auto' }}
              aria-label={`Source for ${plate.sourceId}`}
              value={value}
              onChange={(e) => stagePlateSource(item.itemId, plate.sourceId, e.target.value)}
            >
              <option value="">— not assigned —</option>
              {catalog.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            {value === '' && (
              <span style={styles.needs} data-plate-unassigned={plate.sourceId}>
                needs a source
              </span>
            )}
            {dirty && <DraftChip label="unapplied" />}
          </div>
        );
      })}
      {/*
        WHEN it takes effect, said where the operator makes the change.

        A plate assignment is read when the item is TAKEN — it never re-composites
        the graphic already on the channel. An operator editing a live item is the
        normal case on this panel, not the edge case, so leaving this unsaid would
        let them press Update, see nothing change on air, and reasonably conclude
        it had not worked.
      */}
      {staged.length > 0 && (
        <p style={styles.timing} data-plate-timing="">
          {item.status === 'on-air'
            ? 'This item is ON AIR — Update saves the change, and it takes effect at its next take.'
            : 'Takes effect at the next take, not on the graphic currently composited.'}
        </p>
      )}
    </div>
  );
}

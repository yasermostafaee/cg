import { deriveLookSources, type Scene } from '@cg/shared-schema';
import { useDesignerSelector } from '../../state/store.js';
import { activeLookGroup } from '../../state/slices/looks.js';
import { liveSourceIssues } from '../../state/live-source-preflight.js';
import { CollapseSection } from './CollapseSection.js';
import * as cls from './LooksSection.css.js';

/**
 * ⭐ **LOOKS phase 2 (`design.md` §14, `D-152`) — the multi-frame group's section.**
 *
 * Sits in the RIGHT PANEL beside Playout, because the group is a property of the
 * COMPOSITION. The ACTIVE-look selector deliberately does NOT live here — the panel
 * switches to element properties the moment the author selects something, so the
 * selector sits in the canvas header (the `ArrangementPicker` precedent).
 *
 * ── SOURCES — DERIVED FROM THE PLATES, READ-ONLY HERE (`B-188`) ────────────
 *
 * 🔴 **This list used to be an EDITOR and is now a MIRROR, and that is the change.** A group
 * declared its sources here through a `+ Source` field, and every plate had to reference a
 * declared one or go red under `look-source-undeclared`. The list stored what the plates
 * already carried; the export had always reduced it to the used set before the bridge ever saw
 * it. So it is derived instead — the distinct `routeKey`s the plates carry, in document order
 * of first use — and a source now comes into existence by pointing a plate at a key in the
 * Inspector. Nothing here can be edited, because there is nothing here to edit.
 *
 * Two looks whose plates share a key still get the same DEFAULT input: they resolve to one
 * carrier entry, and the seat is decided at RUNTIME by the input each frame is bound to
 * (`live-look-bindings.ts`, which dedupes on the resolved wire argument and never saw the
 * declaration). The operator may still point either look's frame elsewhere.
 *
 * ⚠ The wording _"the same source in two looks is ONE seat held across the switch"_ was
 * corrected by session BM before `B-188` and stays corrected: a shared key promises the same
 * default, not the same seat.
 *
 * ── `DESIGNER-FIX-0905` — WHAT MOVED, AND WHERE ───────────────────────────
 *
 * Permanent teaching and empty-state prose no longer occupy this narrow panel. The section
 * exists only when it can report a used source or an actionable preflight issue; Look lifecycle
 * itself lives in the Compositions panel.
 */
export function LooksSection({ scene }: { scene: Scene }): JSX.Element | null {
  const group = activeLookGroup(scene);
  const projectScene = useDesignerSelector((st) => st.scene);
  const sources = projectScene === null ? [] : deriveLookSources(projectScene);
  const issues = looksIssues(scene);
  // The section renders only where the group LIVES — the toolbar's multi-frame button
  // creates it; a composition without one (a look's own sub-scene, say) gets no section
  // rather than a second place to create a second group.
  if (group === undefined) return null;
  // The Inspector is a state surface, not permanent onboarding prose. An empty group has
  // nothing actionable here; its lifecycle is managed from the Compositions panel.
  if (sources.length === 0 && issues.length === 0) return null;
  return (
    <CollapseSection title="Plates" defaultExpanded>
      <IssuesPart issues={issues} />
      <SourcesPart sources={sources} />
    </CollapseSection>
  );
}

/**
 * The derived source list — a MIRROR of the plates, in document order of first use.
 *
 * ⚠ **Derived from the PROJECT scene, not from the section's `scene` prop.** The prop is the
 * edit projection of the ACTIVE composition; a look's plates live inside that look's own
 * composition and are reachable only by walking from the project root, which is what
 * `deriveLookSources` does — the same walk, in the same order, the exported carrier is built
 * from, so this list and the operator's list can never disagree.
 */
function SourcesPart({ sources }: { sources: readonly string[] }): JSX.Element | null {
  if (sources.length === 0) return null;
  return (
    <>
      <p className={cls.groupLabel}>Sources — used by the plates</p>
      {sources.map((routeKey) => (
        <div key={routeKey} className={cls.row}>
          <div className={cls.rowHead}>
            <span className={cls.rowName}>{routeKey}</span>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The LOOKS refusal family, surfaced WHERE THE AUTHOR WORKS — the same preflight the
 * export runs (`liveSourceIssues`), filtered to this family, so a refusal is met while
 * authoring rather than at the export dialog (the wrong end of the process). FIRST in
 * the section: guidance that scrolls off under the fields is present and unreadable
 * (the AX lesson).
 */
function looksIssues(scene: Scene): ReturnType<typeof liveSourceIssues> {
  return liveSourceIssues(scene).filter(
    (i) =>
      /*
        ⭐ `B-183` — LISTED HERE BECAUSE THE SPLIT WOULD OTHERWISE SHRINK THIS PANEL.

        A plate pointed at nothing used to arrive as `look-source-undeclared` (its absent
        routeKey read as `""`, which no group declared) and so appeared in this list.
        `B-183` gives that state its own truthful code, and without this line the very
        plate a fresh draw produces would have vanished from the panel the author works in
        — a surface regression hidden inside a message fix.

        ⭐ `B-188` — `look-source-undeclared` is DELETED and no longer listed; the near-miss
        WARNING joins in its place, under its own heading below.
      */
      i.code === 'live-source-unset' ||
      i.code === 'live-source-near-miss' ||
      i.code === 'look-source-duplicate' ||
      i.code === 'look-second-group' ||
      (i.code === 'live-source-overlap' && i.message.includes('Preset "')),
  );
}

function IssuesPart({
  issues,
}: {
  issues: ReturnType<typeof liveSourceIssues>;
}): JSX.Element | null {
  /*
    🔴 `B-188` — **ERRORS AND WARNINGS ARE COUNTED AND HEADED SEPARATELY.**

    One list under one "export will refuse" heading would state a falsehood about the near-miss
    nudge, which never blocks anything. A heading that overstates its own severity is how a
    warning gets treated as an error by everyone reading the screen — including whoever later
    "fixes" it by making it one.
  */
  const errors = [...new Set(issues.filter((i) => i.severity === 'error').map((i) => i.message))];
  const warnings = [...new Set(issues.filter((i) => i.severity !== 'error').map((i) => i.message))];
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div role="alert" aria-label="Preset issues">
      {errors.length > 0 && (
        <>
          {/* `B-184` — `issueSummary`, not `groupLabel`: this heading states an export REFUSAL and
              is drawn in `danger`, matching the status bar's red count for the same facts. */}
          <p className={cls.issueSummary}>
            {errors.length} issue{errors.length === 1 ? '' : 's'} — export will refuse
          </p>
          {errors.slice(0, 6).map((m) => (
            <p key={m} className={cls.issue}>
              {m}
            </p>
          ))}
          {errors.length > 6 && (
            <p className={cls.hint}>…and {errors.length - 6} more, in the export preflight.</p>
          )}
        </>
      )}
      {warnings.length > 0 && (
        <>
          <p className={cls.groupLabel}>{warnings.length} to check — export is not blocked</p>
          {warnings.slice(0, 6).map((m) => (
            <p key={m} className={cls.hint}>
              {m}
            </p>
          ))}
          {warnings.length > 6 && (
            <p className={cls.hint}>…and {warnings.length - 6} more, in the export preflight.</p>
          )}
        </>
      )}
    </div>
  );
}

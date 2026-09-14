import { useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { SourceDefaultsLink } from './SourceDefaultsLink.js';
import {
  assignmentsWereCarriedOver,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import { draftsVersion, subscribeDrafts } from './draftStore.js';
import { appliedPlateSources, frozenPlateSource, onAirPlateSource } from './livePlates.js';
import { isOnAir } from '../stack/onAir.js';

/**
 * D-137 / C-015 — bind each of THIS template's live plates to one of the
 * installation's sources.
 *
 * ── WHY IT IS HERE AND NOT IN THE LIVE SOURCES SECTION OF STATION SETUP ─────
 *
 * It was there first, and the cost showed immediately: that dialog then did two
 * unrelated jobs — DEFINING the station's sources and BINDING every plate of
 * every template — and an installation with two templates already scrolled past
 * six plates before the first source existed. The binding belongs beside the
 * thing being bound, and selecting a template shows that template's plates only.
 *
 * ── 🔴 THE EDITOR LEFT THIS SECTION — `SOURCE-DEFAULTS-20` ───────────────────
 *
 * ⚠ **THE PARAGRAPH THAT STOOD HERE IS REPLACED, NOT ANNOTATED, because every sentence in
 * it is now false.** It read that the picker writes to `draftStore`, reaches the bridge only
 * through `Update`, and that _"the draft IS the confirmation step"_ — with `Discard`
 * dropping it and `isItemDirty` seeing it.
 *
 * The per-plate selects are in a DIALOG now (`TemplateDefaultsDialog`), opened by a link in
 * a section caption, and it commits through its own `Save defaults`. The old argument's
 * PREMISE survives and is the reason the new shape is better rather than merely different:
 * the assignment is TEMPLATE-level, so it needs a confirmation step — and a row's `Update`
 * was always the wrong one to be, because an installation-wide value rode one ROW's commit.
 *
 * ⚠ **CONSEQUENCE, RECORDED SO IT IS A KNOWN STATE RATHER THAN A TRAP:** nothing in the
 * product stages a PLATE draft any more. `stagePlateSource`, `snapshotPlateDraft` and
 * `applyDraft`'s `sendPlateAssignments` are intact and unreachable from the UI — inert, not
 * wrong (an empty staged map makes that half a no-op). Removing them is owed and is not this
 * change.
 *
 * ── WHAT STAYED, AND WHY IT IS NOT A SUMMARY BLOCK ──────────────────────────
 *
 * The two lines that say THIS ROW is not resolving the default: an emergency patch, and an
 * assignment frozen at take. They are facts about the selected row, meaningless in a
 * template-wide dialog that may be open for a template five rows are using — and both are
 * gated on the row being ON AIR and diverging, so the ordinary case renders nothing at all.
 * When there is nothing to say the section does not render, heading included.
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
  /**
   * A9 — the carried-over notice. MUTED, not amber: nothing needs attention,
   * something merely happened that the operator did not do. Amber here would
   * compete with the plates that genuinely still need a source.
   */
  carried: {
    color: colors.textMuted,
    fontSize: 'var(--r-text-sm)',
    margin: '0 0 var(--r-space-3)',
  },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
  /**
   * The ON-AIR line for a plate the operator has patched on THIS row.
   *
   * `pending` (amber), whose documented meaning in this palette is ATTENTION —
   * "OCCUPIED, UNKNOWN, UNCONFIRMED". A row running on an emergency patch is exactly
   * something to go and look at: it diverges from the template every other row uses,
   * and nothing else on this panel says so. NOT green — green is the layer table’s ON
   * AIR mark and this is a statement about WHICH source, not about being on air.
   */
  patched: { color: colors.pending, fontSize: '0.72rem', fontWeight: 700 },
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
  /*
    🔴 …AND THE SAME RULE NOW APPLIES ONE LEVEL UP. With the editor behind a link and the
    link in `LOOK INPUTS` for a looks template, this section can have literally nothing to
    say: no door (that section holds it) and no divergence line (the common case). An empty
    heading is exactly what the guard above refuses, so it is refused here too rather than
    left to be noticed later.

    ⚠ Computed from what the section WILL render, not from the template's shape: the
    divergence lines are gated on the row being on air AND diverging, so a looks template on
    air with a patched plate still gets its section.
  */
  const hasLooks = (info?.liveSources?.looks?.length ?? 0) > 0;
  /*
    🔴 **AND THE HEADING GOES WITH THE CONTENT** — the owner, 2026-09-14: «کلمه Live plates
    و فضایی که اشغال کرده رو هم حذف کن.»

    With the editor behind a link, and the link in `LOOK INPUTS` for a looks template, this
    section can have literally nothing left to say: no door, and no divergence line (which is
    the common case — both are gated on the row being ON AIR and diverging). A heading with
    nothing under it is the same defect the `plates.length === 0` guard above refuses, so it
    is refused on the same terms rather than left to be noticed later.

    ⚠ Computed from what the section WILL RENDER, not from the template's shape: a looks
    template on air with a patched plate still gets its section, because it has something to
    say. The two divergence predicates are evaluated once, here, and the map below reads the
    same answers — a second derivation is how a heading comes back without its content.
  */
  /*
    🔴 **DECLARED BEFORE `divergences`, AND THAT ORDER IS LOAD-BEARING — TYPESCRIPT WILL NOT
    CATCH IT FOR YOU.**

    `divergences` reads both of these inside a `plates.filter(…)` callback. TypeScript treats
    an arrow body as DEFERRED, so a reference to a `const` declared further down compiles
    without complaint — but `filter` invokes the callback IMMEDIATELY, so at runtime it is a
    temporal-dead-zone throw on the first render of any template with a plate. It typechecked
    clean in exactly that state before being moved.
  */
  const rowIsOnAir = isOnAir(item);
  const applied = appliedPlateSources(item.templateId, plates);
  const divergences = plates.filter((plate) => {
    const appliedSource = applied.get(plate.sourceId) ?? null;
    const onAir = onAirPlateSource(item, plate.sourceId, appliedSource);
    const frozen = frozenPlateSource(item, plate.sourceId, appliedSource);
    return (onAir.overridden && rowIsOnAir) || (!onAir.patched && frozen.diverged && rowIsOnAir);
  });
  const carried = assignmentsWereCarriedOver(item.templateId);
  if (hasLooks && divergences.length === 0 && !carried) return null;

  /*
    🔴 **SESSION BP — WHY THIS EDITOR IS STILL HERE, AND WHY THAT IS NOW SAFE.**

    ⚠ **SESSION BO's note here said the opposite conclusion was pending, and it is REPLACED
    rather than left standing.** BO built the owner's then-decision — that the Inspector must
    stop staging template-assignment edits for a looks template — and reverted it under its
    stop rule, because a sweep found this section is the ONLY surface in the product that binds
    a plate to a source (the Live sources section of Station setup — `SourcesSection`, once
    `SourcesModal` — DEFINES the station's sources and merely lists which plates reference
    one; it has no picker). Removing the editor left the template-level default
    with no door at all, and every FRESH row would start unbound with its take refused
    (`live-source-unassigned`). That finding stands. What changed is that it is no longer the
    thing holding `B-155` open.

    **The cause was removed one level down instead: a row FREEZES its template assignment at
    TAKE** (`caspar-runtime.ts` `#frozenAssignments`). An edit made here while a row is on air
    reaches that row at its NEXT TAKE and never inside a switch — and, crucially, that is true
    whoever makes the edit. Disabling this control would only have narrowed WHO can reach the
    mechanism: the assignment is template-wide and installation-wide, so another row on the
    same template, or another station's Runtime against the same bridge, could still write it.

    ⭐ So WHERE this control lives stopped being a correctness question and became a question of
    where an operator expects to find it. The direction is recorded in `tasks.md` 7.16b — the
    template's own entry, NOT the Live sources section, which is about defining the INPUTS and
    has nothing to do with any particular template — and it is deliberately not this session's
    work.

    🔴 **What this section DOES owe the freeze is honesty**, and that is the per-plate line
    below: the picker keeps showing the LIVE assignment (it is the control for that value, and
    the baseline a staged draft is dirty against), so on a frozen row it shows something the row
    is not resolving. Unsaid, that is a surface that is confidently wrong.
  */
  /*
    🔴 “ON AIR” IS ONLY SAID OF A ROW THAT IS. The patch line below states what is
    composited, which is not a claim an idle or loaded row can back — and an unbacked air
    claim on the panel the operator reads most is the one thing this surface must not do.
    The override still EXISTS on such a row and still takes effect at its next take; that is
    what the timing sentence at the bottom is for.
  */

  return (
    <div className="cg-inspector-section" aria-label="Live plates">
      {/*
        ⚠ **THE DOOR IS HERE ONLY WHEN `LOOK INPUTS` IS NOT.** The owner's call is that the
        link sits above the frames (gh2) and not in a section of its own — so for a template
        that declares LOOKS it lives there, and this section does not draw a second one.

        🔴 But `LooksBindingsSection` renders nothing for a template WITHOUT looks, and this
        is the only surface in the product that binds a plate to a source. Without the
        fallback such a template would have no door at all and every fresh row of it would
        start unbound with its take refused (`live-source-unassigned`) — the trap session BO
        fell into and reverted. Exactly one of the two hosts draws it, never both.
      */}
      <div className="cg-section-caption">
        <h2>Live plates</h2>
        {!hasLooks && (
          <SourceDefaultsLink templateId={item.templateId} info={info} plates={plates} />
        )}
      </div>
      {/*
        A9 — a re-import KEEPS the bindings, and it has to SAY so. The owner met it as a
        silent restore: the plates came back bound with no action and no notice, which is
        indistinguishable from the product having invented them.
      */}
      {carried && (
        <p style={styles.carried} data-plates-carried-over="">
          These bindings were carried over from this template&rsquo;s previous import.
        </p>
      )}
      {/*
        🔴 **`SOURCE-DEFAULTS-20` — THE SELECTS LEFT; THESE TWO LINES DID NOT, AND THE
        DIFFERENCE IS WHAT EACH ONE IS ABOUT.**

        What moved into the dialog is the TEMPLATE's default — one value per plate, shared by
        every row using the template. What stays is the pair of lines that say THIS ROW is not
        resolving that default: an emergency patch, and an assignment frozen at take. Those are
        facts about the selected row, they have no meaning in a template-wide dialog that may
        be open for a template five rows are using, and they are the reason the old block could
        not simply be deleted.

        ⚠ **THIS IS NOT THE SUMMARY BLOCK §4 FORBIDS.** It is not a list of the defaults — it
        renders NOTHING in the ordinary case. Both lines are gated on the row being on air AND
        on a divergence, so a row that is resolving its default costs exactly zero pixels here,
        which is the space the move was for. They appear only when the panel would otherwise be
        confidently wrong.
      */}
      {divergences.map((plate) => {
        const appliedSource = applied.get(plate.sourceId) ?? null;
        // R-048 — the per-ROW patch, folded in through the ONE join that reads it.
        const onAir = onAirPlateSource(item, plate.sourceId, appliedSource);
        const onAirName =
          catalog.sources.find((src) => src.id === onAir.sourceId)?.name ??
          onAir.sourceId ??
          'nothing';
        // SESSION BP — what LEVEL 2 resolves to on this row, which for a row on air is the
        // snapshot its take froze rather than the value the dialog now edits.
        const frozen = frozenPlateSource(item, plate.sourceId, appliedSource);
        const frozenName =
          catalog.sources.find((src) => src.id === frozen.sourceId)?.name ??
          frozen.sourceId ??
          'nothing';
        const patched = onAir.overridden && rowIsOnAir;
        const isFrozen = !onAir.patched && frozen.diverged && rowIsOnAir;
        if (!patched && !isFrozen) return null;
        return (
          <div key={plate.elementId} style={styles.row}>
            <span style={styles.plate}>
              <IsolatedName>{plate.sourceId}</IsolatedName>
            </span>
            {/*
              🔴 §12.5 / `tasks.md` 7.8 — WHAT IS ACTUALLY ON AIR, when it is not the default.

              The dialog shows the TEMPLATE ASSIGNMENT. If this ROW has been patched with
              `swapLiveSource`, that assignment is not what is composited — and without this
              line the panel says nothing, so the operator reads the default as the truth.
              §12.5 refused to ship its "takes effect at the next take" wording without this,
              because telling someone when a change lands while showing them the wrong current
              value is a half-repair.
            */}
            {patched && (
              <span
                style={styles.patched}
                data-plate-overridden={plate.sourceId}
                title={
                  `This row is patched onto "${onAirName}" and ignores the template default. ` +
                  `Change it with the row’s SOURCE verb; the default is what a fresh take ` +
                  `would use.`
                }
              >
                on air: {onAirName} (patched on this row)
              </span>
            )}
            {/*
              🔴 **SESSION BP — THE ROW HAS FROZEN THIS ASSIGNMENT.**

              A row freezes level 2 at its take, so an edit made in the dialog while it is on
              air changes the default and changes NOTHING the row resolves. Left unsaid, that
              is the confidently-wrong surface: the operator edits the default, the dialog
              agrees, air does not move, and there is nothing anywhere to explain the gap.

              ⚠ It speaks about the ASSIGNMENT, never about air — levels 3 and 4 are not frozen
              and can still change what this plate shows. The patch line above is the one
              entitled to say "on air", and it wins here: an emergency patch outranks level 2
              entirely, so naming a frozen value beside it would be two answers to one question.

              🔴 **GATED ON `patched`, NOT ON `overridden`, and the difference is a false
              sentence.** `overridden` means the patch DIVERGES FROM THE DEFAULT — it reads
              false for a patch that happens to equal it. Such a patch is still in force and
              still outranks the pin. See {@link onAirPlateSource}.
            */}
            {isFrozen && (
              <span
                style={styles.patched}
                data-plate-frozen={plate.sourceId}
                title={
                  `This row froze the template assignment when it was taken, so it is on ` +
                  `"${frozenName}" and an edit to the default does not reach it. Take the row ` +
                  `again to adopt it, or set this look’s input below to change it now.`
                }
              >
                this row: {frozenName} (frozen at take)
              </span>
            )}
          </div>
        );
      })}
      {/*
        ⚠ **THE TIMING SENTENCE WENT WITH THE EDITOR** (`SOURCE-DEFAULTS-20`). It read
        _"Takes effect at the next take, not on the graphic currently composited."_ and was
        gated on a STAGED edit — there are no staged edits here any more, because the value is
        committed by the dialog's own button rather than by the row's Update. The same fact is
        said in the dialog's footer, where the change is now made; saying WHEN a change lands
        on a surface that can no longer make one would be a sentence with no subject.
      */}
    </div>
  );
}

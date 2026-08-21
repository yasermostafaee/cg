import { useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { DraftChip } from '../../ui/DraftChip.js';
import {
  assignmentsWereCarriedOver,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import {
  draftsVersion,
  effectivePlateSource,
  isPlateDirty,
  stagePlateSource,
  subscribeDrafts,
} from './draftStore.js';
import { appliedPlateSources, frozenPlateSource, onAirPlateSource } from './livePlates.js';
import { isOnAir } from '../stack/onAir.js';

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
    🔴 **SESSION BP — WHY THIS EDITOR IS STILL HERE, AND WHY THAT IS NOW SAFE.**

    ⚠ **SESSION BO's note here said the opposite conclusion was pending, and it is REPLACED
    rather than left standing.** BO built the owner's then-decision — that the Inspector must
    stop staging template-assignment edits for a looks template — and reverted it under its
    stop rule, because a sweep found this section is the ONLY surface in the product that binds
    a plate to a source (`SourcesModal` DEFINES the station's sources and merely lists which
    plates reference one; it has no picker). Removing the editor left the template-level default
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
    template's own entry, NOT the Live sources modal, which is about defining the INPUTS and
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
  const rowIsOnAir = isOnAir(item);
  const applied = appliedPlateSources(item.templateId, plates);
  const staged = plates.filter((p) =>
    isPlateDirty(item.itemId, p.sourceId, applied.get(p.sourceId) ?? null),
  );

  return (
    <div className="cg-inspector-section" aria-label="Live plates">
      <h2>LIVE PLATES</h2>
      {/*
        🔴 **BM-2 §3.4 — THE SCOPE, NARROWED TO THE LEVEL THIS SECTION IS ACTUALLY ON.**

        It read _"Set for the template, not this row — every row using it takes the same
        sources."_ That was true of a flat map and is a LIE about a four-level one: it says
        "not this row" while two of the four levels ARE this row's, and an operator reading it
        would conclude the panel cannot express what it plainly can.

        §3.4 also requires the levels to read WITHOUT a paragraph. So neither this line nor
        the one in LOOK INPUTS explains the model: each says only what ITS OWN control does,
        and the two sit in resolution order down the panel. A patch, being the level that
        overrides the others, announces itself on the rows it masks rather than in a legend
        nobody reads under pressure.
      */}
      <p style={styles.scope}>
        The DEFAULT every row using this template starts from. A row can show something else per
        look, below.
      </p>
      {/*
        A9 — a re-import KEEPS the bindings, and it has to SAY so. The owner met
        it as a silent restore: the plates came back bound with no action and no
        notice, which is indistinguishable from the product having invented them.
      */}
      {assignmentsWereCarriedOver(item.templateId) && (
        <p style={styles.carried} data-plates-carried-over="">
          These bindings were carried over from this template&rsquo;s previous import.
        </p>
      )}
      {catalog.sources.length === 0 ? (
        <p style={styles.empty}>
          No sources are defined on this station yet — define them under Live sources first.
        </p>
      ) : null}
      {plates.map((plate) => {
        const appliedSource = applied.get(plate.sourceId) ?? null;
        const value = effectivePlateSource(item.itemId, plate.sourceId, appliedSource);
        const dirty = isPlateDirty(item.itemId, plate.sourceId, appliedSource);
        // R-048 — the per-ROW patch, folded in through the ONE join that reads it.
        const onAir = onAirPlateSource(item, plate.sourceId, appliedSource);
        const onAirName =
          catalog.sources.find((src) => src.id === onAir.sourceId)?.name ??
          onAir.sourceId ??
          'nothing';
        // SESSION BP — what LEVEL 2 resolves to on this row, which for a row on air is the
        // snapshot its take froze rather than the value in the picker above.
        const frozen = frozenPlateSource(item, plate.sourceId, appliedSource);
        const frozenName =
          catalog.sources.find((src) => src.id === frozen.sourceId)?.name ??
          frozen.sourceId ??
          'nothing';
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
            {/*
              🔴 §12.5 / `tasks.md` 7.8 — WHAT IS ACTUALLY ON AIR, when it is not this.

              The picker above shows the TEMPLATE ASSIGNMENT (draft-or-applied). If this
              ROW has been patched with `swapLiveSource`, that assignment is not what is
              composited — and until this line existed the panel said nothing, so the
              operator read the assignment as the truth. §12.5 refused to ship its
              "takes effect at the next take" wording without this, because telling
              someone when a change lands while showing them the wrong current value is
              a half-repair.
            */}
            {onAir.overridden && rowIsOnAir && (
              <span
                style={styles.patched}
                data-plate-overridden={plate.sourceId}
                title={
                  `This row is patched onto "${onAirName}" and ignores the assignment ` +
                  `above. Change it with the row’s SOURCE verb; the assignment here is ` +
                  `what a fresh take would use.`
                }
              >
                on air: {onAirName} (patched on this row)
              </span>
            )}
            {/*
              🔴 **SESSION BP — THE ROW HAS FROZEN THIS ASSIGNMENT, AND THE PICKER ABOVE
              WOULD OTHERWISE LIE ABOUT IT.**

              A row freezes level 2 at its take, so an edit made while it is on air changes
              the value in this picker and changes NOTHING the row resolves. Left unsaid,
              that is the confidently-wrong surface: the operator edits the default, the
              panel agrees, air does not move, and there is nothing anywhere to explain the
              gap. The timing line at the bottom says WHEN it lands; this says what the row
              is on until then, per plate, because only the divergent plates need saying.

              ⚠ It speaks about the ASSIGNMENT, never about air — levels 3 and 4 are not
              frozen and can still change what this plate shows. The patch line above is the
              one entitled to say "on air", and it wins here: an emergency patch outranks
              level 2 entirely, so naming a frozen value beside it would be two answers to
              one question.

              🔴 **GATED ON `patched`, NOT ON `overridden`, and the difference is a false
              sentence.** `overridden` means the patch DIVERGES FROM THE PICKER — it reads
              false for a patch that happens to equal the live default. Such a patch is still
              in force and still outranks the pin, so gating on `overridden` would let this
              line announce the frozen source as what the row is on while the patch had it
              somewhere else. See {@link onAirPlateSource}.
            */}
            {!onAir.patched && frozen.diverged && rowIsOnAir && (
              <span
                style={styles.patched}
                data-plate-frozen={plate.sourceId}
                title={
                  `This row froze the template assignment when it was taken, so it is on ` +
                  `"${frozenName}" and the edit above does not reach it. Take the row again ` +
                  `to adopt it, or set this look's input below to change it now.`
                }
              >
                this row: {frozenName} (frozen at take)
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
            ? 'This item is ON AIR — Update saves the change, and it takes effect at its next take. To change what this row is showing NOW, use the row’s SOURCE verb: it patches this row only, and leaves the assignment here alone.'
            : 'Takes effect at the next take, not on the graphic currently composited.'}
        </p>
      )}
    </div>
  );
}

/**
 * `STATION-CHROME-01` §2 — THE ONE TABLE of Station setup's tabs, in rail order.
 *
 * ── TABS, AND THE ARGUMENT AGAINST THEM, ANSWERED RATHER THAN OVERRULED ─────
 *
 * `STATION-SETUP-02` shipped one long scroll and gave a real reason: _"a tab hides the
 * section a refusal came from"_. That reasoning is sound and it is kept here. What it did
 * NOT notice is that the scroll has the same defect in a worse form — the shipped build put
 * `Apply is blocked for Servers…` in a region pinned above the footer, so an operator
 * editing DELIMITERS read a refusal about a section he was not in, could not see, and had
 * not touched. The scroll did not show him the refusal where it happened; it showed him
 * every refusal everywhere, all the time.
 *
 * The answer keeps what the argument was protecting and drops what it assumed:
 *
 *   1. **Each section owns its own footer and its own refusal.** A refusal is rendered by
 *      the section that raised it, in that section's footer. It is never in front of
 *      another section's work.
 *   2. **A blocked section marks itself IN THE RAIL** — an amber dot — and a section with
 *      unapplied changes marks itself too, in blue. So nothing is hidden: from any tab you
 *      can see which section is blocked, and one press takes you to the sentence that says
 *      why.
 *
 * That is strictly MORE than the scroll gave, because the scroll only showed the refusal
 * you happened to be standing next to; the rail shows every blocked section at once.
 *
 * ── THE COMMIT CONTRACT IS STILL PART OF THE ROW ────────────────────────────
 *
 * `R-054`'s recon found the footer split across the old dialogs was DELIBERATE: a dialog
 * that edits a DRAFT of connected state applies atomically, a dialog that edits a LIST of
 * independent records commits per record. One dialog hosts both kinds, so each section SAYS
 * which it is — in its heading, and now in its own footer, which is where the operator is
 * looking when he wants to know what pressing something will do.
 */

export type StationSetupSection =
  | 'channel'
  | 'servers'
  | 'sources'
  | 'delimiters'
  | 'candidate-layers';

/**
 * How a section's edits reach the bridge.
 *
 * - `apply-servers` — this section's FOOTER action, and only this section.
 * - `immediate` — every control commits on its own (the delimiter list, the source catalog).
 * - `section` — a draft applied by this section's own footer action (the bank).
 * - `read-only` — nothing here is a control, so the footer carries no commit at all.
 */
export type SectionCommit = 'apply-servers' | 'immediate' | 'section' | 'read-only';

/**
 * The rail's headings. Three groups, in the order the owner set.
 *
 * ⭐ `SETTINGS-MATCH-02` — the third is `Workspace`, which is the reference's own word and is
 * what the owner asked for when he asked for the rail as drawn. It was `Layers`, and that was
 * the one group word naming exactly one item, spelled exactly like it: a heading that repeats
 * its only child's name tells the operator nothing and reads as a duplicate row.
 */
export type SectionGroup = 'Playout' | 'Content' | 'Workspace';

export interface StationSetupSectionSpec {
  readonly id: StationSetupSection;
  /** The heading the operator reads, and the rail's label. Sentence case. */
  readonly title: string;
  readonly commit: SectionCommit;
  readonly group: SectionGroup;
  /** The one-line statement of the commit contract, shown beside the heading. */
  readonly legend: string;
  /**
   * What this section's FOOTER says when it has nothing else to say. A read-only
   * section states that there is nothing to apply — an empty footer beside a Close
   * button reads as "something might be missing".
   */
  readonly footerRest: string;
  /**
   * 🔴 `SETTINGS-MATCH-02` §9c — **WHAT THE FOOTER SAYS WHILE THIS SECTION'S COMMIT IS
   * REFUSED**, when that is a different clause from the standing one.
   *
   * ── IT IS STILL A LABEL, NOT AN EVENT ───────────────────────────────────────
   *
   * `B-239`'s rule is that this sentence must not be mistaken for a REPORT of something that
   * happened. A second clause does not break it, and the distinction is worth stating because
   * the next reader will ask: both clauses describe a STANDING CONDITION of the section (one
   * while anything is on air, one while nothing is), neither appears or disappears in response
   * to a press, and the EVENT still lands in the pinned region above. `removeRowRefusal`
   * measures exactly that — it reads the footer before and after a refusal arrives.
   *
   * ⚠ **Only Servers has one**, and only because its commit genuinely has two standing states.
   * A section whose footer changed with every refusal WOULD be an event, which is why this is
   * a per-section record rather than a general "show the block here" rule.
   */
  readonly footerBlocked?: string;
  /**
   * 🔴 `SETTINGS-MATCH-02` — **DOES THIS SECTION HAVE ANYTHING TO COMMIT?**
   *
   * ── `B-240` IS AMENDED HERE, AND THIS FLAG IS THE AMENDMENT ─────────────────
   *
   * `B-240` decided (2026-09-07) that a section with nothing to commit carries **no footer
   * buttons at all**, on the ground that the ✕, Escape and the backdrop already dismiss and a
   * per-section `Close` made leaving look like a property of whichever tab you stood on. The
   * reference draws a `Close` on exactly those three panes, and **the owner has now looked at
   * it and asked for it (2026-09-11)**, so the rule is amended rather than re-argued:
   *
   *   · a section WITH a commit keeps `Revert` + `Apply <section>` and carries no `Close`;
   *   · a section with NOTHING to commit gets a single `Close`, which **dismisses the dialog
   *     and commits nothing** — the same act the ✕ performs, on the same path, through the
   *     same unapplied-draft guard.
   *
   * ⭐ **Everything else in `B-240` stands**, and this is the half worth saying out loud
   * because it is what the original defect actually was: there is still ONE name for discard
   * (`Revert`, never `Cancel`), still ONE name for commit (`Apply <section>`, sentence case),
   * and the ✕ still asks before dropping a draft. What was wrong in the audited build was
   * three answers for one job and two names for one act; a `Close` that is the dialog's own
   * dismissal, worn only by the panes with no commit of their own, is neither.
   */
  readonly commits: boolean;
  /**
   * The glyph beside the footer's standing sentence — the reference's `.foot-message` svg.
   * Named here rather than at the footer so the sentence and its mark come from ONE record.
   */
  readonly footerIcon: 'info' | 'saved';
}

export const STATION_SETUP_SECTIONS: readonly StationSetupSectionSpec[] = [
  {
    id: 'channel',
    title: 'Channel',
    commit: 'read-only',
    group: 'Playout',
    legend: 'Read-only — reported by the server, not set here.',
    footerRest: 'Nothing to apply — this section reports, it does not set.',
    commits: false,
    footerIcon: 'info',
  },
  {
    id: 'servers',
    title: 'Servers',
    commit: 'apply-servers',
    group: 'Playout',
    /* §3 — the legend NAMES the button, so it moved to sentence case with it. */
    legend: 'Applied together by Apply servers below. Refused while anything is on air.',
    footerRest: 'Applied together. Refused while anything is on air.',
    /*
      §9c — FOUR WORDS while the block is in force, because the BANNER above is already
      explaining at length and naming the remedy. That division is the design: the banner says
      why and what to do, the footer says whether the press is available.
    */
    footerBlocked: 'Unavailable while on air',
    commits: true,
    footerIcon: 'info',
  },
  {
    id: 'sources',
    title: 'Live sources',
    commit: 'immediate',
    group: 'Content',
    /* §5 again, one line up: the legend cannot say "saves as you go" flat either. */
    legend: 'The catalogue saves as you go; the layer band is applied.',
    /*
     * 🔴 `STATION-CHROME-02` §5 — THE SENTENCE THAT WAS UNTRUE.
     *
     * It read `Saved as you go — there is nothing waiting to be applied.` while the LAYER
     * BAND, six inches above it in the same tab, carried an `Apply band` button. One of the
     * two was lying and it was the footer: the band genuinely is applied, and typing two
     * numbers without pressing it changes nothing.
     *
     * A signal must not say what it does not mean — the same rule that decided the dismiss
     * buttons. The footer now states BOTH contracts, because this tab genuinely has two, and
     * says where the second one's control is rather than pretending it is absent.
     */
    /*
      🔴 `STATION-CHROME-02` §5 — THE SENTENCE THAT WAS UNTRUE, AND WHY IT IS STILL TWO CLAUSES.

      It read `Saved as you go — there is nothing waiting to be applied.` while the LAYER BAND,
      six inches above it in the same tab, carried an `Apply band` button. One of the two was
      lying and it was the footer.

      ⭐ `SETTINGS-MATCH-02` §9c asks for ONE SHORT CLAUSE, and this is the one place that rule
      and §5's meet. The reference's own wording here — `Catalogue changes save automatically` —
      is not untrue, but it is SILENT about the band, and silence is what §5 was about. So the
      clause is shortened and BOTH contracts survive: the band's own card now carries an
      `Apply separately` tag, so the footer can name it in three words instead of a sentence.
    */
    footerRest: 'The catalogue saves as you go; the layer band is applied separately.',
    /*
      ⚠ FALSE, and it is the one row of this column that has to be read rather than skimmed.
      The LAYER BAND in this tab is applied — by its OWN button, in its own card, which is
      what the sentence above says. What this column decides is whether the SECTION carries a
      commit in the FOOTER, and this one does not; a footer `Apply live sources` here would
      claim to commit a catalogue that is already saved.
    */
    commits: false,
    footerIcon: 'saved',
  },
  {
    id: 'delimiters',
    title: 'Text file delimiters',
    commit: 'immediate',
    group: 'Content',
    legend: 'Saves as you go.',
    footerRest: 'Saved as you go — there is nothing waiting to be applied.',
    commits: false,
    footerIcon: 'saved',
  },
  {
    /*
     * RENAMED from "Candidate layers" at the owner's direction. The id is unchanged
     * because it is the deep link the Layers panel's Configure sends, and an id is not
     * an operator-facing name (golden rule 11).
     */
    id: 'candidate-layers',
    title: 'Layers',
    commit: 'section',
    group: 'Workspace',
    legend: 'Applied by this section. Not gated on air — the bridge refuses per row.',
    footerRest: 'The bridge refuses any row it cannot free.',
    commits: true,
    footerIcon: 'info',
  },
];

/**
 * `RUNTIME-REDESIGN-01` Phase 7 — the commit contract as the reference's section TAG
 * (`Read only` · `Apply together` · `Auto-save`), shown at the end of the section head beside the
 * legend that spells it out. ONE mapping from the contract, so the tag and the legend cannot say
 * different things: `immediate` is the reference's `Auto-save`; both draft contracts are its
 * `Apply together`, because each is applied by one button for the whole section.
 */
export function contractTag(commit: SectionCommit): string {
  switch (commit) {
    case 'read-only':
      return 'Read only';
    case 'immediate':
      return 'Auto-save';
    case 'apply-servers':
    case 'section':
      return 'Apply together';
  }
}

/** The rail's groups, in order, each with its sections. */
export const STATION_SETUP_GROUPS: readonly {
  readonly group: SectionGroup;
  readonly sections: readonly StationSetupSectionSpec[];
}[] = (['Playout', 'Content', 'Workspace'] as const).map((group) => ({
  group,
  sections: STATION_SETUP_SECTIONS.filter((s) => s.group === group),
}));

/** The tab a bare "open settings" lands on. Channel, because it asks for nothing. */
export const DEFAULT_STATION_SETUP_SECTION: StationSetupSection = 'channel';

export function sectionSpec(id: StationSetupSection): StationSetupSectionSpec {
  const spec = STATION_SETUP_SECTIONS.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`unknown Station setup section: ${id}`);
  return spec;
}

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

/** The rail's headings. Three groups, in the order the owner set. */
export type SectionGroup = 'Playout' | 'Content' | 'Layers';

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
}

export const STATION_SETUP_SECTIONS: readonly StationSetupSectionSpec[] = [
  {
    id: 'channel',
    title: 'Channel',
    commit: 'read-only',
    group: 'Playout',
    legend: 'Read-only — reported by the server, not set here.',
    footerRest: 'Nothing to apply — this section reports, it does not set.',
  },
  {
    id: 'servers',
    title: 'Servers',
    commit: 'apply-servers',
    group: 'Playout',
    /* §3 — the legend NAMES the button, so it moved to sentence case with it. */
    legend: 'Applied together by Apply servers below. Refused while anything is on air.',
    footerRest: 'Applied together. Refused while anything is on air.',
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
    footerRest:
      'The catalogue saves as you go. The layer band is applied by the button in its own section.',
  },
  {
    id: 'delimiters',
    title: 'Text file delimiters',
    commit: 'immediate',
    group: 'Content',
    legend: 'Saves as you go.',
    footerRest: 'Saved as you go — there is nothing waiting to be applied.',
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
    group: 'Layers',
    legend: 'Applied by this section. Not gated on air — the bridge refuses per row.',
    footerRest: 'The bridge refuses any row it cannot free.',
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
}[] = (['Playout', 'Content', 'Layers'] as const).map((group) => ({
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

/**
 * `STATION-SETUP-02` — THE ONE TABLE of Station setup's sections, in the order they render.
 *
 * ── WHY SECTIONS AND NOT TABS ────────────────────────────────────────────────
 *
 * `R-054` imagined a tabbed shell. A tab hides every section but one, and a refusal raised
 * by a hidden section — the raster refusing while something is on air, the candidate
 * layers refusing to untick an occupied row — would land in the pinned message region
 * while the section that raised it was out of sight. Sections stay rendered, the region
 * names the section in every message, and a jump row at the top gets the operator to the
 * one he came for. Nothing is hidden, so nothing has to be hunted for.
 *
 * ── THE COMMIT CONTRACT IS PART OF THE ROW ───────────────────────────────────
 *
 * `R-054`'s recon found the footer split across the old dialogs was DELIBERATE, not drift:
 * a dialog that edits a DRAFT of connected state applies atomically, a dialog that edits a
 * LIST of independent records commits per record. One dialog now hosts both kinds, so each
 * section SAYS which it is, in its heading, from this table — a pane that commits on change
 * must say so, and the footer's APPLY must not read as covering sections it does not.
 */

export type StationSetupSection =
  | 'servers'
  | 'outputs'
  | 'raster'
  | 'sources'
  | 'delimiters'
  | 'candidate-layers'
  | 'station-layers';

/**
 * How a section's edits reach the bridge.
 *
 * - `apply-servers` — the dialog's FOOTER action, and only this section.
 * - `immediate` — every control commits on its own (the delimiter list, the source catalog).
 * - `section` — a draft applied by a control INSIDE the section (the raster, the bank).
 * - `read-only` — nothing here is a control.
 */
export type SectionCommit = 'apply-servers' | 'immediate' | 'section' | 'read-only';

export interface StationSetupSectionSpec {
  readonly id: StationSetupSection;
  /** The heading the operator reads. Sentence case, as every dialog title is. */
  readonly title: string;
  readonly commit: SectionCommit;
  /** The one-line statement of the commit contract, shown beside the heading. */
  readonly legend: string;
}

export const STATION_SETUP_SECTIONS: readonly StationSetupSectionSpec[] = [
  {
    id: 'servers',
    title: 'Servers',
    commit: 'apply-servers',
    legend: 'Applied together by APPLY SERVERS below. Refused while anything is on air.',
  },
  { id: 'outputs', title: 'Outputs', commit: 'read-only', legend: 'Read-only.' },
  {
    id: 'raster',
    title: 'Channel raster',
    commit: 'section',
    legend: 'Set per channel from its own button. The bridge refuses it while anything is on air.',
  },
  { id: 'sources', title: 'Live sources', commit: 'immediate', legend: 'Saves as you go.' },
  {
    id: 'delimiters',
    title: 'Text file delimiters',
    commit: 'immediate',
    legend: 'Saves as you go.',
  },
  {
    id: 'candidate-layers',
    title: 'Candidate layers',
    commit: 'section',
    legend: 'Applied by the button in this section. Not gated on air — the bridge refuses per row.',
  },
  {
    id: 'station-layers',
    title: 'Station layers',
    commit: 'read-only',
    legend: 'Read-only — declared at bridge start.',
  },
];

export function sectionSpec(id: StationSetupSection): StationSetupSectionSpec {
  const spec = STATION_SETUP_SECTIONS.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`unknown Station setup section: ${id}`);
  return spec;
}

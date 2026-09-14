import { useState, useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { activeLookOf } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from '../sources/sourceStore.js';
import {
  draftsVersion,
  effectiveLookBinding,
  isLookBindingDirty,
  stageLookBinding,
  subscribeDrafts,
} from './draftStore.js';
import { appliedPlateSources } from './livePlates.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { SourceDefaultsLink } from './SourceDefaultsLink.js';
import { isOnAir } from '../stack/onAir.js';

/**
 * ⭐ **SESSION BM-2 (`design.md` §12.9.1b) — WHAT THIS ROW SHOWS IN EACH LOOK.**
 *
 * The template's flat `{plate → source}` list above answers a different question — the
 * DEFAULT every row starts from — and it kept answering it while the operator needed a second
 * one: _"2-box shows studio-1 and studio-2; what will SOLO show?"_ A single flat list cannot
 * hold two answers for one hole, so this section holds the LOOKS and their inputs.
 *
 * ── 🔴 THE FOUR LEVELS, AND WHY THIS SURFACE HAS TO MAKE THEM LEGIBLE ───────
 *
 *   1. the installation's CATALOG · 2. the template's ASSIGNMENT (the section above — every
 *   row) · 3. **THIS ROW's per-look binding (here)** · 4. the row's EMERGENCY patch
 *   (`R-048`), in force in EVERY look and outranking 3.
 *
 * §3.4's requirement is that they read WITHOUT a paragraph — _"if the surface needs a
 * paragraph to be safe, the surface is wrong"_ — so each level is where the operator already
 * is: the default sits in the section that owns it and says so in one line; a look's own
 * choice sits under that look's name; and a patch announces itself ON the rows it masks
 * rather than in a legend.
 *
 * ── 🔴 §2 — THE HAZARD THIS SECTION EXISTS TO NOT SHIP ──────────────────────
 *
 * Level 4 MASKS level 3. So a list of per-look inputs can show `solo → studio-3` in perfect
 * good faith while an emergency patch puts studio-5 on air in every look — a surface that is
 * confidently wrong, which is the worst class of defect this product has.
 *
 * Three things answer it, and all three are asserted in tests rather than left to the layout:
 *
 *   - the patch is **named on every row it masks**, in amber, saying what is actually on air;
 *   - the masked value is **struck through and labelled "not in force"** — never merely
 *     greyed, because grey reads as "disabled" and invites the operator to conclude the
 *     control is broken rather than overridden;
 *   - **CLEAR PATCH sits on the row that shows the patch.** An emergency that cannot be
 *     ended from where it is seen becomes permanent by accident, which is exactly how a 20:59
 *     substitution turns into tomorrow's configuration.
 */

const styles = {
  scope: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: '0 0 var(--r-space-3)' },
  look: { margin: '0 0 var(--r-space-3)' },
  lookHead: {
    display: 'flex',
    gap: 'var(--r-space-2)',
    alignItems: 'baseline',
    marginBottom: 'var(--r-space-1)',
  },
  /*
   * 🔴 THE LOOK TABS — `INSPECTOR-DELTA` §4, and this IS what the reference draws.
   *
   * Read out of `05-row-inspector.html` rather than taken from prose: the per-row section is
   * `<div class="look-tabs" aria-label="Look to edit">` holding one `<button aria-pressed>`
   * per authored look, then a `#look-mappings` list showing ONLY the selected look's frames.
   * Ours rendered EVERY look stacked, each with its own heading and its own full list of
   * plates — in a 396 px panel that is the whole section scrolling past, and it is what the
   * owner meant by "does not read like the drawing".
   *
   * ⚠ A TAB IS PRESSABLE, so it is a real `<button>` with a focus ring and `aria-pressed`,
   * NOT a `Tag`. The rule is a MATCH, not a ban (`TAG-NOT-BUTTON-07` §3): a shape that
   * cannot be pressed must not look like a control, and a shape that CAN must stay one.
   */
  lookTabs: {
    display: 'flex',
    gap: 'var(--r-space-1)',
    flexWrap: 'wrap' as const,
    marginBottom: 'var(--r-space-2)',
  },
  lookName: { fontWeight: 700, fontSize: 'var(--r-text-sm)' },
  /**
   * 🔴 **SESSION BP — THE BADGE WEARS THE STATE'S OWN COLOUR, and the argument that said it
   * must not is now FALSE and has been REPLACED rather than left standing.**
   *
   * ── WHAT THE OLD COMMENT ARGUED, AND WHY IT STOPPED BEING TRUE ──────────────
   *
   * It read: _"NOT GREEN. Green is the layer table's ON AIR mark and means 'this row is
   * playing'; this says 'of this row's looks, THIS is the one composited'. Borrowing green
   * would put a second meaning on the one colour an operator reads fastest."_
   *
   * **That was correct while the badge lied.** It was gated on `activeLookOf` — *which look
   * this ROW is set to* — which is true the moment a row is loaded, so the badge genuinely
   * did mean something other than "playing", and green would have been a second meaning on
   * the sacred hue. `B-156` rewired it to {@link isOnAir}, the layer table's OWN predicate,
   * and the two meanings MERGED: when this badge says `ON AIR NOW` it is the same claim the
   * row's green mark is making, from the same derivation.
   *
   * 🔴 **The comment is replaced, not merely overridden, because a warning that outlives its
   * premise is how amber gets "restored" by a later reader citing a fact that is no longer
   * true.** This repo has been bitten by that shape before. If the badge is ever ungated from
   * `isOnAir` again, the green must go with it.
   *
   * ── THE THREE HUES ARE THE THREE STATES' OWN, TAKEN AS TOKENS ───────────────
   *
   * Owner's decision, 2026-08-21: green for on air, violet for PVW, blue for the normal
   * state. Every one of them already exists and already means exactly that — `colors.onAir`
   * is the sacred ON AIR green, `colors.rehearsing` is `R-022`'s violet as worn by the row's
   * own REHEARSING mark, and `colors.ready` is the READY sky, which is precisely the row
   * state the third badge describes.
   *
   * 🔴 **TOKENS, NEVER THE HEX.** Same discipline `B-156` applied to the predicate: the badge
   * and the row's marks must be INCAPABLE of disagreeing, so they read one token as well as
   * one predicate. ⚠ `colors.ready` and `--r-accent` are the same value (`#74cdf6`) and are
   * NOT interchangeable — the accent's own comment says it is not a state colour and must not
   * become one. Taking the wrong one compiles, looks identical today, and drifts the day
   * either is retuned.
   *
   * ⚠ **THE WORDS STAY.** Colour here is redundant reinforcement, not the channel: each badge
   * says what it means in text, so an operator who cannot separate the hues loses nothing.
   * Do not shorten the labels to lean on the colour.
   */
  live: { color: colors.onAir, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em' },
  /** The same badge while the row is REHEARSING — `R-022`'s violet, as worn by its own mark. */
  rehearsing: {
    color: colors.rehearsing,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  /** …and for a row merely SELECTED — the READY sky, which is the state it is describing. */
  selected: {
    color: colors.ready,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  /*
   * 🔴 **LABEL BEFORE THE BOX, ON ONE LINE — owner, 2026-09-14:** «لیبل اینپوتها در خط
   * جدا نباشه قبلش باشه بهتره.»
   *
   * A two-column grid rather than a stack, and it is the shape that satisfies BOTH of the
   * owner's calls at once: the label LEADS on the same line, and `1fr` gives the box every
   * pixel the label does not take — which is what «تمام صفحه کن مثل gh2» asked for. A
   * label stacked above (the drawing's `.field.full`) spends a whole line per field, and in a
   * panel this tall that is the space the move was made to reclaim.
   *
   * ⚠ The label column is `auto`: it takes the widest label and no more, so every box in the
   * section starts on the SAME vertical without anyone choosing a number.
   */
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: 'var(--r-space-2)',
    alignItems: 'center',
    marginBottom: 'var(--r-space-1)',
    flexWrap: 'wrap' as const,
    paddingLeft: 'var(--r-space-3)',
  },
  /** The field's label, leading its box on the same line. */
  plate: {
    color: colors.textSecondary,
    fontSize: 'var(--r-text-sm)',
    fontWeight: 'var(--r-weight-medium)',
    whiteSpace: 'nowrap' as const,
  },
  /** A per-look value an emergency patch has taken out of force — see the header's §2. */
  masked: { color: colors.pending, fontSize: '0.72rem', fontWeight: 700 },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
} as const;

/**
 * 🔴 **`B-156` — WHAT THE BADGE MAY SAY, DECIDED FROM PREDICATES THIS FILE DOES NOT OWN.**
 *
 * Three row states, three truthful words. The badge always marks the SAME look — the one
 * `activeLookOf` resolves — because which look is selected is one question; what that
 * selection MEANS for air is a different one, and only the second varies:
 *
 * | row state | what is true of this look |
 * | --- | --- |
 * | on air | it is what the programme is showing |
 * | rehearsing | it is what PVW is showing — `R-022` keeps the row off air |
 * | loaded / idle | it is what a TAKE would show. Not air. |
 *
 * ⚠ **Both predicates are IMPORTED.** `isOnAir` is the layer table's own (the section above
 * already calls it); `isRehearsing` is `@cg/shared-ipc`'s, the one `LayersPanel` reads for the
 * row picker's `PVW LOOK` / `LOOK` label. Session BL shipped that distinction on the row and
 * this section never learned it — the `B-151` shape, one surface knowing a state and its
 * neighbour not. Re-deriving either here would be the defect, not the fix.
 *
 * ⚠ **REHEARSING is checked FIRST, and the order is safe rather than lucky.** A row cannot be
 * rehearsing AND on air: `R-022`'s interlock refuses a rehearse for an on-air row and a take
 * for a rehearsing one, which `live-look-reconcile.integration.test.ts` pins on the wire
 * rather than assuming. If that interlock ever went, this order would decide an ambiguity
 * instead of reporting one — so the interlock is asserted beside this, not trusted.
 *
 * 🔴 **SESSION BP — IT NOW RETURNS THE COLOUR TOO, and that is the point of returning it at
 * all.** The words, the machine-readable `tone` and the hue are three readings of ONE
 * decision, produced together. They were a `live: boolean` fanned out into two ternaries at
 * the render site — which is two places for the badge to describe a different state from the
 * one this function chose, on a surface whose entire job is to not do that. The colours are
 * `theme.ts` TOKENS (see `styles` above for why never the hex).
 */
export function badgeFor(
  onAir: boolean,
  rehearsing: boolean,
): { text: string; tone: 'on-air' | 'rehearsing' | 'not-on-air'; color: string } {
  if (rehearsing)
    return { text: 'SHOWING IN PVW', tone: 'rehearsing', color: styles.rehearsing.color };
  if (onAir) return { text: 'ON AIR NOW', tone: 'on-air', color: styles.live.color };
  return { text: 'SELECTED — A TAKE SHOWS THIS', tone: 'not-on-air', color: styles.selected.color };
}

/**
 * The name this station shows for a catalog id, or the id when it names nothing.
 *
 * 🔴 **IT TAKES A NON-EMPTY `string`, AND THE EMPTY CASE IS GONE RATHER THAN REWORDED.**
 *
 * It used to accept `string | undefined` and answer `'the template default'` for the empty
 * case — old vocabulary from before the blank option named its own default, and by the time
 * the option was renamed to `Default (…)` that fallback had become actively wrong: interpolated
 * at the one call site below it produced **`Default (the template default)`**, self-referential
 * nonsense an operator would read as a data fault rather than a copy fault.
 *
 * ⚠ **The dead branch is DELETED, not re-worded, because it fed TWO call sites.** Rewording it
 * would have left one string doing duty in two roles — the blank option's label and the
 * "not in force — patched to X" note — with only one of them ever exercised, which is precisely
 * the shape that let the old wording rot unnoticed. Narrowing the parameter makes the state
 * unrepresentable instead: each caller now proves its id is real where it can actually see the
 * evidence.
 *
 * (It was never reachable — `SourceDefinitionIdSchema` is `.min(1)` plus a leading-alphanumeric
 * regex, enforced at every boundary an assignment crosses, and `applyDraft` turns an empty
 * staged value into a DELETION rather than a blank entry. Unreachability is why nothing was
 * red; it is not why this changed.)
 */
function sourceName(id: string): string {
  return currentSourceCatalog().sources.find((s) => s.id === id)?.name ?? id;
}

export function LooksBindingsSection({
  item,
  info,
  rehearsing = false,
}: {
  item: StackItemState;
  info: TemplateInfo | null;
  /**
   * 🔴 A PROP, not a subscription — and that is deliberate (`B-156`).
   *
   * The caller already reads the canonical `isRehearsing(rehearsals, itemId)` from
   * `@cg/shared-ipc`, exactly as `LayersPanel` does for the row picker's `PVW LOOK` label.
   * Subscribing again HERE would put a second reader of the same fact in a leaf component —
   * the re-derivation golden rule 6 forbids — and would couple a presentational section to
   * the bridge, which is what made it untestable the first time this was tried.
   */
  rehearsing?: boolean | undefined;
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  /*
    🔴 WHICH LOOK THE OPERATOR IS EDITING — `INSPECTOR-DELTA` §4.

    `null` means "whichever one is live", which is what a freshly opened Inspector should
    show and what it should keep showing when a take changes the live look under it. Only an
    explicit tab press pins it, and it stays pinned until the row is deselected (the section
    is keyed by item upstream, so switching rows re-seeds it).

    ⚠ ABOVE THE EARLY RETURN, and it has to be: hooks may not sit behind a conditional, and
    the `carrier === undefined` bail below is exactly that. Declaring it here costs nothing
    on a template with no looks — the component returns before anything reads it.
  */
  const [pinnedLookId, setPinnedLookId] = useState<string | null>(null);
  const carrier = info?.liveSources;
  const looks = carrier?.looks ?? [];
  // A template with no LOOKS gets no section — its plates have one answer, and the flat list
  // above already is it. An empty heading is a question the operator did not ask.
  if (carrier === undefined || looks.length === 0) return null;

  const liveLookId = activeLookOf(carrier, item.activeLookId)?.id;
  const badge = badgeFor(isOnAir(item), rehearsing);
  const defaults = appliedPlateSources(item.templateId, carrier.sources ?? []);
  const patches = item.sourceOverride ?? {};
  const bound = item.lookSourceOverride ?? {};
  /*
    WHICH LOOK IS BEING EDITED. The operator's pin if there is one and it still names a look
    this template has; otherwise the LIVE look; otherwise the first. The fallback chain is
    total, so `activeLook` is never undefined and the section can never render tabs with no
    body — a template that was re-imported with different looks is exactly how a pinned id
    comes to name nothing.
  */
  const activeLook =
    looks.find((l) => l.id === pinnedLookId) ??
    looks.find((l) => l.id === liveLookId) ??
    (looks[0] as (typeof looks)[number]);
  /*
    Which looks hold an unapplied edit — asked of EVERY look, not just the visible one,
    because that is the whole point: the tabs hide the others and a hidden draft that says
    nothing is a draft the operator will lose. Read through the same `isLookBindingDirty`
    the rows below use, so a tab's dot and a row's chip cannot disagree.
  */
  const dirtyLooks = new Set(
    looks
      .filter((look) =>
        (carrier.sources ?? [])
          .filter((p) => look.rects[p.sourceId] !== undefined)
          .some((p) =>
            isLookBindingDirty(item.itemId, look.id, p.sourceId, bound[look.id]?.[p.sourceId]),
          ),
      )
      .map((look) => look.id),
  );

  return (
    <div className="cg-inspector-section" aria-label="Look inputs">
      {/*
        🔴 **THE DEFAULTS LINK LIVES HERE — owner, 2026-09-14 (gh2):** «لینک مودال هم بالای
        فریمها باشه مثل gh2 نیاز نیست توی دو بخش جدا باشن.» The reference puts it in this
        section's caption, above the frame selects it configures — not in a section of its own.

        `.section-caption` is the drawing's shape: the heading at one end, a `link-btn` at the
        other. Sentence case in the source; the CAPS are the stylesheet's (`Inspector.tsx`).
      */}
      <div className="cg-section-caption">
        <h2>Look inputs</h2>
        <SourceDefaultsLink
          templateId={item.templateId}
          info={info}
          plates={carrier.sources ?? []}
        />
      </div>
      {/*
        🔴 **§3d — "above" USED TO POINT AT THE LIVE PLATES SECTION, WHICH IS NOW GONE HERE.**

        This read _"Blank takes the template default above."_ Once the template-assignment
        editor stops rendering for a looks template (§1's collapse), "above" points at
        nothing — on a control whose entire semantics are *blank = the default*. A default the
        operator cannot see is a value they cannot reason about, so the default moved INTO the
        control: each blank option names the value it inherits.
      */}
      {/*
        ⚠ **CUT TO ONE SENTENCE — owner, 2026-09-14:** «نیاز به اون همه توضیحات هم نیست.»
        It carried three clauses — the level, what blank means, and the timing. The first two
        are now said by the surface itself: the link names the level, and each list's blank
        option NAMES the default it inherits (`Default (sdi)`).

        🔴 **WHAT SURVIVES IS THE GOLDEN-RULE-10 CLAUSE, and it survives on purpose.** It is
        the reference's own sentence, and it is the one fact the surface cannot show: pressing
        a look tab LOOKS like switching what is on air, and it is not — it changes which look
        you are EDITING.
      */}
      <p style={styles.scope}>Editing a look does not take it on air.</p>
      {/*
        THE TABS. One per authored look, the live one marked, and a dot on any look holding
        an unapplied edit — see `dirtyLooks`.
      */}
      <div style={styles.lookTabs} role="group" aria-label="Look to edit">
        {looks.map((look) => {
          const isLive = look.id === liveLookId;
          const isActive = look.id === activeLook.id;
          return (
            <Button
              key={look.id}
              variant={isActive ? 'secondary' : 'neutral'}
              active={isActive}
              aria-pressed={isActive}
              data-look-tab={look.id}
              {...(isActive ? { 'data-look-tab-active': '' } : {})}
              onClick={() => setPinnedLookId(look.id)}
            >
              {/* The look's name is the TEMPLATE AUTHOR'S string — isolated, never bare. */}
              <IsolatedName>{look.name}</IsolatedName>
              {isLive && (
                <span
                  /*
                    SESSION BP — ONE decision, read three ways. `badgeFor` returns the words,
                    the machine-readable tone and the token colour together, so the style, the
                    attribute and the text cannot describe different states. They were a
                    boolean and two ternaries, which is two chances to disagree with the
                    predicate they both claim to be reporting.
                  */
                  style={{ ...styles.selected, color: badge.color }}
                  data-look-live={look.id}
                  data-look-badge={badge.tone}
                >
                  {' '}
                  {badge.text}
                </span>
              )}
              {/*
                🔴 NOTHING STAGED MAY BECOME INVISIBLE. Stacking every look meant a draft was
                always on screen; tabs hide all but one, so a look with unapplied edits that
                is not the selected tab would silently stop reporting itself. The dot is the
                same mark a dirty field carries, so "not applied yet" looks identical
                wherever it appears in this panel.
              */}
              {dirtyLooks.has(look.id) && (
                <span
                  className="cg-dirty-dot"
                  data-look-tab-dirty={look.id}
                  aria-label={`${look.name} has unapplied edits`}
                >
                  ●
                </span>
              )}
            </Button>
          );
        })}
      </div>
      {[activeLook].map((look) => {
        const rects = look.rects;
        const plates = (carrier.sources ?? []).filter((p) => rects[p.sourceId] !== undefined);
        return (
          <div key={look.id} style={styles.look} data-look-row={look.id}>
            {/*
              🔴 THE PER-LOOK HEADING IS GONE — `INSPECTOR-DELTA` §4. It named the look and
              carried the live badge, which was right while every look was stacked on screen
              and each block needed to say which one it was. With ONE look showing behind a
              row of tabs, the tab already names it and already carries the badge, and a
              heading repeating the pressed tab directly beneath it is the surface saying the
              same thing twice — the reference's `#look-mappings` has no heading either.

              ⚠ `data-look-live` / `data-look-badge` MOVED to the tab rather than being
              duplicated. Two of them would be two claims about one fact, and
              `lookBindings.dom.test.ts` pins that exactly one exists.
            */}
            {plates.length === 0 && <p style={styles.empty}>No frames in this look.</p>}
            {plates.map((plate, plateIndex) => {
              const applied = bound[look.id]?.[plate.sourceId];
              /*
                §3d — THE DEFAULT, NAMED IN THE CONTROL THAT INHERITS IT. `appliedPlateSources`
                is the SAME join the LIVE PLATES section uses for a no-looks template, so the
                two surfaces cannot disagree about what "the default" is.
              */
              /*
                ⚠ **`?? null` IS NOT ENOUGH HERE, and the difference is one falsy value wide.**
                Nullish coalescing catches `null`/`undefined` and lets an EMPTY STRING through —
                so an empty id would have survived as `''`, failed the `=== null` test below,
                and taken the NAMED branch. The collapse is explicit for that reason.

                It answers `Default (none set)`, which is the honest reading: an id that names
                nothing IS no default set, and it is already the wording of the other branch.
              */
              const assigned = defaults.get(plate.sourceId);
              const templateDefault = assigned === undefined || assigned === '' ? null : assigned;
              const defaultLabel =
                templateDefault === null
                  ? 'Default (none set)'
                  : `Default (${sourceName(templateDefault)})`;
              const value = effectiveLookBinding(item.itemId, look.id, plate.sourceId, applied);
              const dirty = isLookBindingDirty(item.itemId, look.id, plate.sourceId, applied);
              // §2 — level 4 masks level 3, for THIS plate, in EVERY look.
              const patch = patches[plate.sourceId];
              const masked = patch !== undefined && patch !== '';
              return (
                <div key={`${look.id}:${plate.sourceId}`} style={styles.row}>
                  {/*
                    🔴 **gh2 — THE LABEL LEADS ITS BOX** (owner, 2026-09-14:
                    «اینپوتهای داخل اینسپکتور رو هم تمام صفحه کن مثل gh2»). It was a label
                    BESIDE an auto-width select, which in a 396 px panel gave the box whatever
                    was left after the longest plate id — so two rows of one look could carry
                    two different box widths.

                    ⚠ **`Frame N` IS THE LABEL AND THE PLATE ID IS ON THE `title`** — golden
                    rule 11, and the drawing agrees. `plate.sourceId` is the template AUTHOR's
                    identifier for a hole in a layout (`guest-1`); the operator reads a
                    position. The id is RELOCATED, not deleted: the `aria-label` still carries
                    it, so every existing finder and every screen reader still names the plate.
                  */}
                  <span style={styles.plate} title={plate.sourceId}>
                    Plate {plateIndex + 1}
                  </span>
                  <select
                    className={dirty ? 'cg-field is-dirty' : 'cg-field'}
                    style={{
                      width: '100%',
                      // §2.1 — STRUCK THROUGH, not greyed. The control stays enabled because
                      // §2.3 accepts the edit; what is communicated is "this value is not in
                      // force", which is a statement about the VALUE and not about the control.
                      ...(masked && { textDecoration: 'line-through' }),
                    }}
                    aria-label={`Input for ${plate.sourceId} in look ${look.name}`}
                    data-look-binding={`${look.id}:${plate.sourceId}`}
                    {...(masked && { 'data-look-binding-masked': '' })}
                    value={value}
                    onChange={(e) =>
                      stageLookBinding(item.itemId, look.id, plate.sourceId, e.target.value)
                    }
                  >
                    <option value="">{defaultLabel}</option>
                    {currentSourceCatalog().sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                  {masked && (
                    <>
                      <span style={styles.masked} data-look-binding-patched={plate.sourceId}>
                        not in force — patched to {sourceName(patch)}
                      </span>
                      {/*
                        §2.2 — ENDING THE PATCH IS REACHABLE FROM WHERE IT IS SEEN. It applies
                        IMMEDIATELY rather than staging, and that is deliberate: the patch it
                        undoes was applied immediately too (`R-048` is an on-air emergency, not
                        a draft), so making its removal wait for UPDATE would leave the two
                        halves of one operator decision on different clocks.
                      */}
                      <Button
                        variant="ghost"
                        data-clear-patch={plate.sourceId}
                        title={`Stop patching "${plate.sourceId}" and put this row's per-look inputs back in force`}
                        onClick={() => {
                          void window.cg.stack
                            .swapLiveSource({
                              itemId: item.itemId,
                              plateId: plate.sourceId,
                              sourceId: null,
                            })
                            .then((res) => {
                              if (!res.ok)
                                reportCommandError(res.message ?? 'Could not clear the patch.');
                            });
                        }}
                      >
                        Clear patch
                      </Button>
                    </>
                  )}
                  {dirty && <DraftChip label="unapplied" />}
                  {/*
                    🔴 §2.3 — VISIBLE, not an `aria-label`. `DraftChip` renders the fixed text
                    "● draft" and carries its `label` as an accessible name only, so putting
                    the explanation there would have made it reachable by screen reader and
                    invisible to the operator reading the panel — which is the half §2.3 is
                    actually about. An edit staged under a patch has to SAY what it is waiting
                    for, or it reads as an edit that silently did nothing.
                  */}
                  {dirty && masked && (
                    <span style={styles.masked} data-look-binding-waiting={plate.sourceId}>
                      takes effect when the patch is cleared
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

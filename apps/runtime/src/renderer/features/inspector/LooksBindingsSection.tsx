import { useSyncExternalStore } from 'react';
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
   * one predicate. ⚠ `colors.ready` and `--r-accent` are the same value (`#38BDF8`) and are
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
  row: {
    display: 'flex',
    gap: 'var(--r-space-2)',
    alignItems: 'center',
    marginBottom: 'var(--r-space-1)',
    flexWrap: 'wrap' as const,
    paddingLeft: 'var(--r-space-3)',
  },
  plate: { fontFamily: 'monospace', fontSize: 'var(--r-text-sm)', minWidth: '5rem' },
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

  return (
    <div className="cg-inspector-section" aria-label="Look inputs">
      <h2>LOOK INPUTS</h2>
      {/*
        🔴 **§3d — "above" USED TO POINT AT THE LIVE PLATES SECTION, WHICH IS NOW GONE HERE.**

        This read _"Blank takes the template default above."_ Once the template-assignment
        editor stops rendering for a looks template (§1's collapse), "above" points at
        nothing — on a control whose entire semantics are *blank = the default*. A default the
        operator cannot see is a value they cannot reason about, so the default moved INTO the
        control: each blank option names the value it inherits.
      */}
      <p style={styles.scope}>
        Set for THIS row — each look can show a different input. Blank takes the template&rsquo;s
        own default, named in each list.
      </p>
      {looks.map((look) => {
        const rects = look.rects;
        const plates = (carrier.sources ?? []).filter((p) => rects[p.sourceId] !== undefined);
        const isLive = look.id === liveLookId;
        return (
          <div key={look.id} style={styles.look} data-look-row={look.id}>
            <div style={styles.lookHead}>
              <span style={styles.lookName}>{look.name}</span>
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
                  {badge.text}
                </span>
              )}
            </div>
            {plates.length === 0 && <p style={styles.empty}>No frames in this look.</p>}
            {plates.map((plate) => {
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
                  <span style={styles.plate}>{plate.sourceId}</span>
                  <select
                    className={dirty ? 'cg-field is-dirty' : 'cg-field'}
                    style={{
                      width: 'auto',
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

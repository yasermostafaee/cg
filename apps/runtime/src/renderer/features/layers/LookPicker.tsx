import type { TemplateLiveSources } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { colors, cssVars, LOOK_STRIP_PX } from '../../theme.js';

/**
 * 🔴 **§14.5 / `tasks.md` 7.1 — THE LOOK PICKER. It IS the on-air readout AND the switch.**
 *
 * ── WHY A PICKER AND NOT A MENU ─────────────────────────────────────────────
 *
 * §12.8 decided this underneath two separate reversals and it survived both:
 * **always visible, state-carrying, no menu.** A menu hides the current state behind
 * a click, and the client's requirement is that the operator cannot be mistaken about
 * what is on air. So the control that SAYS which look is live is the same object that
 * CHANGES it — one glance, one action, and no third state where the readout and the
 * switch could disagree because there is only one of them.
 *
 * ── ONE-OF-N BY CONSTRUCTION ────────────────────────────────────────────────
 *
 * The picker offers only AUTHORED looks and exactly one is always marked, so the whole
 * old refusal family is not defended against — it is **unrepresentable**. Over-lit,
 * absent-count and all-off cannot be expressed here, which is what let §12.9.1's
 * count-shaped triggers retire rather than move (§14.5). ⚠ There is deliberately **no
 * "none" entry**: taking the row off air is the STOP/CLEAR verbs' job and always was,
 * and an all-off entry here would be a second, quieter way to do it.
 *
 * ── THE SWITCH IS THE CUT ───────────────────────────────────────────────────
 *
 * v1 is cut-only (§14.4 parks the other transition modes), so pressing a look IS the
 * immediate action — there is no mode to choose, nothing to wait for, and therefore
 * nothing to escape from. `tasks.md` 7.6 retired D3's escape for exactly this reason.
 *
 * ── COLOUR ─────────────────────────────────────────────────────────────────
 *
 * The selected segment wears `--r-accent-fill` with an inset ring, copied from the
 * anchor-cell grid (`controls.css`) — the repo's other one-of-N picker — because the
 * problem is identical: a fill alone reads as hover, and hover and selection are one
 * hue apart. **Not green:** green is the sacred ON AIR mark of the layer table's state
 * cell, and a look segment borrowing it would put a second, unrelated air claim on the
 * same row. Which look is selected is a SELECTION fact, and `--r-accent-fill`'s own
 * doc reserves it for exactly that.
 *
 * `aria-pressed` is what the CSS keys on, so the painting and the announcement can
 * never disagree about which look is live — the anchor cell's rule, inherited.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 4 — WHERE THE LOOKS COME FROM, AND WHAT A SEGMENT SHOWS ──
 *
 * 🔴 **The looks are the TEMPLATE'S OWN DECLARATION and nothing else.** The Designer authors a
 * `LookGroup` (`@cg/shared-schema` `looks.ts`); the `.vcg` export reduces it to the carrier
 * (`collectLookCarrier` → `TemplateLiveSources.looks`, one `TemplateLook` per authored look,
 * in authored order, each with the RECTS of the frames it places); the bridge and this picker
 * read that carrier. The prototype's `authoredLooks(t) = t.layouts` is its own invention and
 * enters nothing here (`PROMPT.md` §0).
 *
 * ⭐⭐ **Frame count, look count and look id are THREE DIFFERENT THINGS.** A six-frame template
 * may declare looks of 1, 2, 3, 4 and 6 frames and no 5-frame look at all; a look called
 * `pair` may place frames 2 and 5. Nothing here counts the template's sources to invent a look,
 * numbers looks by position, or reads a frame count out of an id: the SET is `looks[]`, the
 * ORDER is authored order, the NAME is `look.name`, and the FRAMES drawn in a segment's
 * thumbnail are that look's own `rects` (`lookOptionsOf`). A template with an irregular look
 * set renders exactly its own looks — `lookPicker.dom.test.ts` pins the shape and
 * `look-set-and-switch.spec.ts` drives it on the surface.
 */

/** One frame of one look, as a FRACTION of the scene — where the thumbnail draws its cell. */
export interface LookFrame {
  plateId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A look, as the picker needs it: an id, something to call it, and the frames it places. */
export interface LookOption {
  id: string;
  label: string;
  /**
   * THIS look's frames, in the carrier's order, normalised to the scene — read from
   * `TemplateLook.rects` over `TemplateLiveSources.resolution`. `frames.length` is the look's
   * frame count, which is NOT the template's frame count and NOT anything about the id.
   */
  frames: readonly LookFrame[];
}

/**
 * The authored looks of a template, or `null` when there is no picker to show.
 *
 * 🔴 **THE ABSENT-VS-EMPTY DISTINCTION IS LOAD-BEARING AND IT IS REAL.**
 * `buildTemplateLiveSources` spreads `looks` **only when the scene has a look group**
 * (`collectLookCarrier` returns `null` otherwise), so:
 *
 * - `looks === undefined` — no look group at all. A pre-LOOKS template, including
 *   every multi-box template authored against the arrangement carrier. It has nothing
 *   to pick and **must not be refused anything**; refusing it would take a station's
 *   whole pre-carrier rundown off air on upgrade.
 * - `looks === []` — a look group that authors ZERO looks. That is a broken template
 *   and `tasks.md` 7.5's single refusal trigger.
 * - `looks.length > 0` — the picker, with one segment per look.
 *
 * Returning `null` for the first two collapses them HERE, once, so no call site has to
 * remember which emptiness is which.
 */
export function lookOptionsOf(live: TemplateLiveSources | undefined): LookOption[] | null {
  const looks = live?.looks;
  if (live === undefined || looks === undefined || looks.length === 0) return null;
  // A raster is positive by schema; the guard keeps a malformed carrier from producing
  // `Infinity` fractions rather than a blank thumbnail.
  const sceneW = live.resolution.width > 0 ? live.resolution.width : 1;
  const sceneH = live.resolution.height > 0 ? live.resolution.height : 1;
  return looks.map((l) => ({
    id: l.id,
    /*
      🔴 THE AUTHORED NAME. An earlier version labelled these by ORDINAL on the stated
      premise that “the carrier holds ids, not display names” — **which is false**:
      `TemplateLookSchema.name` is `z.string().min(1)`, REQUIRED, and it is what the author
      typed in the Designer. Numbering them threw away the one label that already means
      something to the operator (“WIDE”, “SOLO”) and replaced it with a position they would
      have to learn. The id still rides the tooltip and the accessible name for anyone who
      needs the authored handle.

      A long name widens the strip rather than the row: the line scrolls inside itself.
    */
    label: l.name,
    // THIS LOOK's rects, and only this look's — a source absent from a look has no entry
    // (`TemplateLiveSourcesSchema.looks`), so a look's frame count is the size of its map.
    frames: Object.entries(l.rects).map(([plateId, r]) => ({
      plateId,
      x: r.x / sceneW,
      y: r.y / sceneH,
      w: r.width / sceneW,
      h: r.height / sceneH,
    })),
  }));
}

/** The operator's word for a look's frame count — the reference's `· N frames` tooltip. */
export function frameCountLabel(n: number): string {
  return n === 1 ? '1 frame' : `${String(n)} frames`;
}

const styles = {
  line: {
    // 🔴 SPANS EVERY COLUMN, and `1 / -1` rather than a number: the column COUNT changes
    // with density (the template column drops at compact/tight), so a numeric end line
    // would point at a different place on a narrow panel. This is also why the second
    // line costs the width model nothing — `minWidthFor` sums columns, and a spanning
    // child adds no column.
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    // The reference's `.look-switch{gap:10px}` between the context label and the strip.
    gap: cssVars['--r-look-ctx-gap'],
    // Never widens the row: if the looks outgrow the panel the STRIP scrolls, rather
    // than the grid growing and pushing the verb block off the edge — the failure the
    // fixed-px column model exists to prevent.
    minWidth: 0,
    overflowX: 'auto' as const,
  },
  /**
   * The context label — the reference's `.look-context`: 11 px 600 in the SECOND rank of
   * ink, on a 79 px column so the strips of two rows start at one x. Phase 2's
   * `--r-text-secondary` is the palette's value for the literal the reference paints.
   */
  label: {
    fontSize: cssVars['--r-look-ctx-text'],
    fontWeight: 600,
    color: colors.textSecondary,
    minWidth: cssVars['--r-look-ctx-min-w'],
    flex: '0 0 auto',
  },
  /**
   * The button strip — the reference's `.look-button-strip{gap:8px;padding:3px}`. The 3 px
   * is what keeps a segment's focus ring inside the line's own scroll box.
   */
  strip: {
    display: 'flex',
    gap: cssVars['--r-look-strip-gap'],
    padding: '3px',
    flex: '0 0 auto',
  },
  /**
   * `B-168` — the immediacy mark. Dimmer than the label it follows, because it is a QUALIFIER
   * on that word rather than a second signal competing with it: the operator reads `LOOK` and
   * then, if they are asking "does this wait for UPDATE?", finds the answer already there.
   * No new hue — this row's colour vocabulary belongs to air state.
   */
  now: { opacity: 0.65, fontWeight: 600 },
} as const;

/**
 * `B-168` — what the label's tooltip says, in one sentence and naming the contrast that makes
 * it worth saying: the fields beside it wait, this does not.
 */
const IMMEDIATE_TITLE =
  'Pressing a look applies it IMMEDIATELY — on an on-air row that is a cut. It does not wait ' +
  'for UPDATE, unlike the per-look inputs in the Inspector.';

/** Half the thumbnail's seam, so two adjacent frames read as two cells and not one box. */
const FRAME_SEAM_PX = LOOK_STRIP_PX.thumbGap / 2;

const pct = (f: number): string => `${String(Math.round(f * 10000) / 100)}%`;

/**
 * The look's frame thumbnail. `aria-hidden`: the accessible name and the tooltip already say
 * how many frames, and a screen reader has no use for a picture of where they sit.
 */
function LookThumb({ frames }: { frames: readonly LookFrame[] }): JSX.Element {
  return (
    <span className="cg-look-thumb" aria-hidden="true" data-look-thumb="">
      {frames.map((f) => (
        <span
          key={f.plateId}
          className="cg-look-frame"
          data-look-frame={f.plateId}
          style={{
            left: `calc(${pct(f.x)} + ${String(FRAME_SEAM_PX)}px)`,
            top: `calc(${pct(f.y)} + ${String(FRAME_SEAM_PX)}px)`,
            width: `calc(${pct(f.w)} - ${String(2 * FRAME_SEAM_PX)}px)`,
            height: `calc(${pct(f.h)} - ${String(2 * FRAME_SEAM_PX)}px)`,
          }}
        />
      ))}
    </span>
  );
}

interface Props {
  looks: readonly LookOption[];
  /** The look the row is SHOWING, resolved by the bridge. */
  activeId: string | undefined;
  /** Disabled reason, or `undefined` when the switch can be sent. */
  refusal: string | undefined;
  onPick: (lookId: string) => void;
  /** For the accessible name — the operator's word for this row. */
  rowName: string;
  /**
   * 🔴 `CONSOLE-LOOK-06` DELTA 11 — **IS THE ROW ON AIR RIGHT NOW, as the STATE CELL says it?**
   *
   * Not `item.status` and not `isOnAir`: the row's own rendered TONE, passed down, so the
   * selected segment's green and the state cell's green are ONE fact rather than two readings
   * that agree today. §4's masking travels with it for free — a row whose air claim cannot be
   * confirmed renders `attention`, not `onair`, so the segment stops wearing the air colour at
   * exactly the moment the state cell does. Two derivations of "on air" on one row is the
   * defect `B-213` is about, one surface over.
   */
  onAir: boolean;
  /**
   * 🔴 **WHAT THIS PRESS CHANGES — the PREVIEW, or AIR.** (`B-151`, owner patch 2026-08-21.)
   *
   * There is ONE control and one call: `stack.set-active-look`, whose effect follows the
   * ROW's state — a rehearsing row is off air, so the bridge records the look and sends
   * nothing; an on-air row gets the cut. A duplicate picker above PVW was built and removed
   * on the owner's correction, because _"the same LOOK buttons on the row already worked for
   * PVW too"_ and two controls for one operation is this repo's two-spellings defect.
   *
   * ⚠ But a control whose effect depends on state is only safe if the operator can READ that
   * state, and the client's requirement is that they cannot be mistaken. The row's state cell
   * already says REHEARSING or ON AIR; this makes the picker say the same thing about
   * ITSELF, at the point of action, so the answer is in the control the hand is on rather
   * than in a cell three columns away.
   *
   * ⚠ These two are MUTUALLY EXCLUSIVE by the R-022 interlock — rehearse is refused for an
   * on-air row and a take is refused for a rehearsing one — so there is no third state where
   * the label would have to hedge.
   */
  target: 'air' | 'preview';
}

export function LookPicker({
  looks,
  activeId,
  refusal,
  onPick,
  rowName,
  target,
  onAir,
}: Props): JSX.Element {
  const preview = target === 'preview';
  return (
    <div
      style={styles.line}
      data-look-picker=""
      data-look-target={target}
      role="group"
      aria-label={preview ? `Preview look for ${rowName}` : `Look for ${rowName}`}
    >
      {/*
        The label IS the target statement. `PVW LOOK` rather than a badge or a colour: this
        row already spends its colour vocabulary on air state, and a new hue here would be a
        second thing to learn. The word the operator already reads on the PVW panel is the
        word that appears on the control that drives it.

        ⚠ `RUNTIME-REDESIGN-01` Phase 4 — the reference's context label reads `ON AIR LOOK` on
        an on-air row. NOT adopted, on purpose: the picker says which LOOK is selected and the
        state cell alone says whether the row is on air (the "never a second air claim on the
        same row" rule the segments' colour is built on, pinned in `lookPicker.dom.test.ts`).
        The reference's second line — `Cut · now` / `Apply · now` — is `B-168`'s `· NOW`
        qualifier, which the console already spells; nothing is reworded (`PROMPT.md` §0).
      */}
      {/*
        🔴 **`B-168` — THE LABEL SAYS THIS CONTROL COMMITS IMMEDIATELY.**

        Owner's decision 2026-08-25 (option b): the look pick STAYS immediate — it is not staged
        and `UPDATE` is not involved. The decisive reason is that a STAGED look is the
        confidently-wrong-surface class this product fears most: the operator stages a look,
        forgets UPDATE, and the row SHOWS one look while the picker CLAIMS another. Immediacy
        makes that disagreement unrepresentable.

        ⚠ **But everything else on this panel waits for UPDATE**, so an operator had no way to
        know this one control had already changed air. That was the whole of `B-168` once the
        lying refusal (`B-166`) was fixed — and the fix is a WORD, not a behaviour change.

        `· NOW` rather than a second colour: this row already spends its colour vocabulary on
        air state, and a new hue here would be a second thing to learn (the same argument the
        `PVW LOOK` label is built on). `LooksBindingsSection`'s CLEAR PATCH is the precedent for
        an immediate control living beside staged ones and saying so.
      */}
      <span style={styles.label} title={IMMEDIATE_TITLE}>
        {preview ? 'PVW LOOK' : 'LOOK'} <span style={styles.now}>· NOW</span>
      </span>
      <span style={styles.strip} data-look-strip="">
        {looks.map((look) => {
          const live = look.id === activeId;
          return (
            <Button
              key={look.id}
              /*
                🔴 `neutral`, NOT `verb`. `.cg-btn--verb` sets `width: 100%` — COLUMN geometry,
                sized by the header so a verb’s word sits over its glyph — and the `icon`
                variant exists precisely because that “stretches anything that is not in a
                sized column”. These segments are in a flex strip, not a column. `neutral` is
                the documented contract for a TEXT button and carries no accent, which is what
                the row wants: the row’s STATE owns colour, and selection is painted by
                `.cg-look-cell[aria-pressed]` instead.
              */
              variant="neutral"
              className="cg-look-cell"
              // The CSS keys on this, so the paint and the announcement are one fact.
              aria-pressed={live}
              /*
                🔴 DELTA 11 — THE SELECTED LOOK ON AN ON-AIR ROW IS GREEN.

                In this console green means ON AIR and nothing else (`design.md` §29). Until now
                the selected segment was the same blue on an on-air row as on a ready one, so
                the console had no way to tell "this look is on air right now" from "this look
                is merely chosen".

                ⚠ IT DOES NOT REOPEN "the segments do not wear green", which this file argues
                twice — read it again and it is about an UNBACKED claim: *"an off-air row's
                picker announcing on air would be a second, unbacked air claim on the same
                row"*. On an ON-AIR row the claim is backed by the state cell beside it, and it
                is the same `--r-onair` the state cell uses. The rule stands and this is the
                case it does not cover; an off-air row's selected segment is blue, exactly as
                before.

                ⚠ And colour is never the sole signal: the segment is already the selected one
                by its FILL and its inset frame, and `aria-pressed` announces it. Green is
                reinforcement laid over a marker that already worked without it.
              */
              {...(live && onAir ? { 'data-look-onair': '' } : {})}
              disabled={refusal !== undefined}
              /*
                The tooltip: this look's OWN frame count (the reference's `· N frames`) and the
                authored id — the technical handle, relocated here and out of the sentence
                (golden rule 11). The immediacy clause the reference appends is already on the
                label's tooltip and is not spelled twice. A refusal replaces it wholesale.
              */
              {...(refusal !== undefined
                ? { title: refusal }
                : { title: `${frameCountLabel(look.frames.length)} · ${look.id}` })}
              /*
                🔴 “CURRENT”, never “on air”. The picker says which LOOK is selected; whether
                the row is on air is the state cell’s claim and its alone. An off-air row’s
                picker announcing “on air” would be a second, unbacked air claim on the same
                row — the same reason the segments do not wear green.
              */
              // `B-151` — and the TARGET, so a screen reader gets the same answer the label
              // gives sighted operators: this press changes the preview, or it changes air.
              aria-label={
                `${preview ? 'Preview look' : 'Look'} ${look.label} (${look.id})` +
                `${live ? ' — current' : ''}`
              }
              data-look-id={look.id}
              data-look-frames={String(look.frames.length)}
              onClick={() => {
                /*
                  🔴 **A RE-PRESS IS SENT, and an earlier version of this dropped it.**

                  The tempting guard is `if (!live)`: re-issuing the look already showing
                  would run a reconcile and a CG UPDATE for an unchanged picture. It is
                  refused for one reason, and `tasks.md` 7.9 SHARPENED that reason rather than
                  retiring it.

                  A marked segment now means the page was genuinely told this look (7.9 fused
                  the bridge’s record to the successful telling), so it can no longer be
                  marked while nothing moved. What it CAN be is marked while the FILLS sat
                  elsewhere: a switch whose reconcile landed and whose `CG UPDATE` did not
                  leaves the producers on the new geometry and the row recorded on the look
                  the page is still punching. The bridge’s own refusal says exactly that —
                  *“its holes are still on the previous look… Re-issue the switch”* — and the
                  segment it points the operator at is the one already marked live.

                  So a re-press is not a redundant re-assert. It is the repair: it reconciles
                  the fills back onto the look the holes are on. A guard would have made the
                  one remedy the bridge names unreachable, on the control it names it about.
                */
                onPick(look.id);
              }}
            >
              <LookThumb frames={look.frames} />
              {look.label}
            </Button>
          );
        })}
      </span>
    </div>
  );
}

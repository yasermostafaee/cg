/**
 * Centralized design tokens for the Runtime renderer.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 2 — THE PAGE CHROME IS NO LONGER `@cg/ui`'s ──
 *
 * It used to be: `chrome.*` came from `@cg/ui`, "kept in lockstep with the
 * Designer". The owner's approved reference
 * (`docs/ui-reference/runtime-redesign/`) is a palette for THIS console, and
 * `@cg/ui` is shared with the Designer and is tokens-only by the design-system
 * rule — so adopting the reference through `@cg/ui` would have repainted the
 * Designer from a reference drawn of the Runtime. The chrome therefore moved
 * HERE, where every other Runtime role already lives, and the lockstep with the
 * Designer is deliberately broken. `@cg/ui` is untouched.
 *
 * ⚠ ONE RESIDUE, NAMED SO IT IS NOT MISTAKEN FOR AN OVERSIGHT: `@cg/ui`'s
 * `theme.css` still paints `body` and the scrollbars from its own `--cg-*`
 * values. The app shell covers the body ground completely (`layout.ts`
 * `appShell.page` is `100vh` and paints `colors.background`), so nothing of the
 * old ground is visible; the SCROLLBAR thumb is still `--cg-border`. Moving that
 * is a `@cg/ui` change and is not this phase's to make.
 *
 * ON AIR IS GREEN, AND RED MEANS ERROR OR DANGER — NOTHING ELSE.
 *
 * Owner decision, taken deliberately over the tally convention (where red means
 * live), because it follows the Cinegy reference the client already reads. It
 * changes what the codebase's oldest colour rule is anchored to, so read this
 * before touching either hue:
 *
 *  - The **air-state colour is still sacred**. It is used by the layer rows and
 *    the status bar's on-air indicator and NOWHERE else. What changed is only
 *    WHICH colour that is: decorative GREEN is now forbidden across the UI, for
 *    exactly the reason decorative red was — nothing may imply "on air" but air.
 *  - **Red is now single-purpose**: errors and destructive confirmations. That is
 *    the payoff for moving on-air off it, and it is worth protecting — a red that
 *    means two things means neither.
 *
 * `R-006` and `B-087` are written as "a simulation may never wear the broadcast
 * RED" and "a frozen air claim is demoted [from red]". Those sentences protect
 * nothing until they are re-anchored to green, and the tests will NOT catch the
 * gap because they assert the badge's ROLE (`data-row-state`, `cg-badge--onair`)
 * rather than a hex value — which is the more durable form, and precisely why the
 * wording has to be updated by hand. Recorded in `DEBT.md` as a PRD edit owed.
 */

import type { StackItemStatus } from '@cg/shared-schema';

/*
 * ── `RUNTIME-REDESIGN-01` PHASE 2 — THE REFERENCE PALETTE ────────────────────
 *
 * The nineteen values the owner's approved reference declares in its own `:root`
 * (`docs/ui-reference/runtime-redesign/04-playout-layers.html`), transcribed once.
 * Module-private, like every other base constant in this file: NOTHING outside
 * `theme.ts` may name them, and no component reads one. A component reads a ROLE.
 *
 * They are named for the reference's own role words rather than for their hue,
 * because that is what makes the mapping below checkable against the source: a
 * reader can put this block beside the reference's `:root` and see nineteen
 * values, one for one, with nothing invented in between.
 *
 * 🔴 THE RULE THAT DECIDED WHICH APP ROLE ADOPTS WHICH VALUE, stated here because
 * the next phase will have to apply it again: **a role adopts a reference value
 * IFF the reference declares a value for THAT role** — either one of these
 * nineteen, or a value the reference's own CSS spells for that exact role (its
 * `.btn:hover`, its `input` border, its `.btn.primary:hover`). Where the
 * reference declares nothing for a role, the role KEEPS its value. The one
 * extension is a value DERIVED from a role that moved (an alpha wash of the
 * accent, a shared base constant), where the derivation is re-applied so a
 * family stays one hue instead of splitting into two.
 *
 * What that rule deliberately did NOT move is listed at `--r-onair`, `--r-caution`
 * and the alarm family below. Each says why in its own place.
 */
/** The page ground — the deepest surface, behind every panel. */
const REF_BG = '#0b1017';
/** A PANEL's ground. */
const REF_SURFACE = '#141b25';
/** One notch up from a panel: a bar, a header, a row that stands proud. */
const REF_RAISED = '#1b2532';
/** A WELL SUNK INTO a surface — every input in the app. */
const REF_INSET = '#0e151e';
/** The line around a surface. */
const REF_LINE = '#2d3a49';
/** The QUIETER line: the rule between two rows of one table, repeated a dozen times. */
const REF_SOFT = '#24303d';
/** Primary ink. */
const REF_TEXT = '#eef3f9';
/** The second rank of ink — present, but not the sentence's subject. */
const REF_SECONDARY = '#bbc8d7';
/** The third rank: a coordinate, a unit, a label beside a value. */
const REF_MUTED = '#8e9eaf';
/** INTERACTIVE, and READY. The reference spends one blue on both (see `--r-ready`). */
const REF_BLUE = '#74cdf6';
/** …and the ground that blue sits on when it fills something. */
const REF_BLUE_BG = '#173243';
/** OK / healthy / acknowledged. NOT on air — see `--r-onair`. */
const REF_MINT = '#85e4b6';
const REF_MINT_BG = '#18372d';
/** PVW / rehearse. */
const REF_PURPLE = '#c3acff';
const REF_PURPLE_BG = '#302645';
/** ATTENTION, as INK. The reference's amber is never a fill — `REF_AMBER_BG` is. */
const REF_AMBER = '#f3cd88';
const REF_AMBER_BG = '#352d1e';
/** DANGER / failed, as INK. */
const REF_RED = '#ffaaa7';
const REF_RED_BG = '#3a242a';

/*
 * ── 🔴 `AUDIT-CLOSE-01` C2 — THE REFERENCE'S LAYER TABLE IS DRAWN ON LITERALS ──────────
 *
 * The three constants below are NOT from the reference's variable block. They are what its
 * layer table PAINTS, read off the rendered elements in Chromium at 1280 × 800:
 *
 *   `.layer-table thead th`  background rgb(45, 55, 69)   color rgb(156, 163, 175)
 *   `.layer-table thead th`  border-bottom 1px solid rgb(55, 65, 81)
 *   `.layer-table tbody td`  border-bottom 1px solid rgb(55, 65, 81)
 *
 * …while that same document declares `--line: #2d3a49`, `--soft: #24303d`, `--muted: #8e9eaf`
 * — which are, exactly, the values Phase 2 took for `--r-border`, `--r-border-soft` and
 * `--r-text-muted`. **The prototype declares this console's palette and then paints its table
 * with different literals**, and `PROMPT.md` §0 says the approved thing is what it RENDERS.
 *
 * 🔴 THIS IS WHY "ARGUED: palette" WAS NOT A REASON. `design.md` §10.2 disposed of six colour
 * deltas with that one word, on the understanding that the reference's literal and the app's
 * token were the same ROLE at two values. On this surface they are not the same role at all:
 * the reference deliberately does not use its own `--soft` / `--line` here. Two of the six —
 * the row rule and the header ground — are the ones an operator sees at a glance, and they are
 * the two the audit measured as making the table read FLAT where the drawing has a lid over
 * the rows. They are adopted here; the other four are a later item and are not touched.
 *
 * ⚠ THE INK COMES WITH THE GROUND, and that is not a re-tune of `--r-text-muted`. Owner answer
 * A6 forbade moving the muted ink, and this does not move it: the layer table's header gets its
 * OWN ink role at the reference's own literal, so nothing else in the app changes. Taking the
 * ground without the ink would have put the shared muted ink at 4.39:1 — the accepted fail A6
 * closed — which is precisely the trap A6's note predicted. The measured ratios are in
 * `layer-table-geometry.spec.ts` §3 and in this change's report.
 */
/** The rule the reference's layer table paints — under its header AND between its rows. */
const REF_LAYER_RULE = '#374151';
/** …the ground its sticky header sits on. */
const REF_LAYER_HEAD_BG = '#2d3745';
/** …and the ink it puts on that ground. 4.74:1, above the 4.5 AA text floor. */
const REF_LAYER_HEAD_INK = '#9ca3af';

export const colors = {
  // Page chrome — the reference's own, since Phase 2 (see the header).
  background: REF_BG,
  panel: REF_SURFACE,
  panelMuted: REF_RAISED,
  border: REF_LINE,
  text: REF_TEXT,
  /**
   * THE SECOND RANK OF INK, and it is new in Phase 2 rather than a rename.
   *
   * The app had exactly two ranks — `text` and `textMuted` — so anything that was
   * neither the subject of a line nor a footnote had to pick one and be slightly
   * wrong. The reference declares three. Nothing reads this yet; the surfaces that
   * want it are dressed in Phases 3–9.
   */
  textSecondary: REF_SECONDARY,
  textMuted: REF_MUTED,

  // Air-state contract (Phase 6 §1)
  idle: '#3F3F46',
  /**
   * READY. The reference's blue — the same value as `--r-accent`, exactly as the
   * reference itself spends it (`.badge.ready` is `var(--blue)`, and so is every
   * interactive affordance). The two names stay separate for the reason
   * `--r-ready` gives at length: they are identical in value and opposite in rule.
   */
  ready: REF_BLUE,
  /**
   * ATTENTION, as INK — TAKING, UNCONFIRMED, OCCUPIED, EXIT, the status bar's OSC-silent
   * word, the unassigned-plate mark. `color:` and a line, never a ground.
   *
   * 🔴 HELD AT `#F59E0B` IN PHASE 2 because this ONE token was doing two jobs: an INK on a
   * dark surface here, and a FILL with dark ink on top in `BridgeSkewBanner`'s band. The
   * reference splits those — `REF_AMBER` is an ink that appears only as `color:`,
   * `REF_AMBER_BG` is the ground under it — so no single value could serve both.
   *
   * ⭐ SPLIT IN PHASE 9 (`design.md` §16), the phase that dressed the band: the skew banner
   * now takes the caution PAIR the reference draws (`--r-caution-text` on `--r-caution-bg`,
   * ruled by `--r-notice-line`), and the one remaining amber FILL — the CLEAR verb — reads
   * its own role, `--r-caution-fill`. Nothing reads `pending` / `--r-caution` as a ground
   * any more, which is what makes the value below a decision about an INK alone.
   */
  pending: '#F59E0B',
  /**
   * ON AIR. Green, per the owner's decision above — the ONE colour that may say a
   * graphic is on the output, and forbidden everywhere else.
   *
   * The exact value the owner specified, and deliberately the most saturated thing
   * in the palette: this is the mark an operator has to find from across a gallery,
   * so it is the one place allowed to be loud. Nothing else may approach it —
   * `--r-success` stays a softer green precisely so an ack flash on a button
   * cannot be misread as an air claim.
   *
   * 🔴 **PHASE 2 — THE ONE PLACE THE REFERENCE AND THIS PALETTE DISAGREE, AND IT IS
   * HELD RATHER THAN RESOLVED.** The reference has ONE green, `REF_MINT`, and spends
   * it on `.badge.live` AND on `.badge.success` AND on the footer's `healthy` — that
   * is, it uses the same colour for "this is on air" and for "this connection is
   * fine". This palette does not, and the split is the older decision: `--r-onair`
   * and `--r-success` are two greens on purpose so an ack flash cannot be read as an
   * air claim. Adopting `REF_MINT` here would collapse them into one. So `REF_MINT`
   * went to the OK/healthy role, where it means what the reference means by it, and
   * this value did not move. **That is a difference from the approved design and the
   * owner is the one to settle it** — not something to tidy away in a later phase.
   */
  onAir: 'rgb(44 255 122)',
  /** EXIT. Shares `pending`'s amber, and is held for the same reason — see there. */
  exit: '#F59E0B',
  /**
   * ERROR. Red, which now means only this and destructive intent.
   *
   * ⚠ A BACKGROUND colour: the alarm banners, the command toast and the refusal
   * `Notice` paint it behind white text. As TEXT on this palette's dark surfaces it
   * measures 2.08:1 — illegible — which `Modal`, `Notice` and the Server settings
   * panel each discovered separately. Error TEXT on a dark background takes
   * `errorText` below.
   *
   * HELD in Phase 2: the reference draws no dark red FILL at all — its danger
   * treatment is `REF_RED` ink on `REF_RED_BG`, which is a different treatment
   * rather than a different value for this one. Re-dressing the alarm surfaces is
   * Phase 9's, where each of them is brought into the new design as a whole.
   */
  /*
   * 🔴 RENAMED FROM `error` BY `CONSOLE-LOOK-06` DELTA R ADDENDUM B §B3, AND THE RENAME IS THE FIX.
   *
   * THREE components independently set `color: colors.error` — `SourcesModal`,
   * `DelimitersModal` and `ServerSettingsPanel` — and all three measured **2.08:1** on the modal
   * surface, below even the 3:1 large-text floor. Three independent misuses of one token is not
   * three careless authors: it is a token whose NAME does not say what it is for. A severity
   * value called plainly "error" reads like an ink, and three people used it as one.
   *
   * `alarmFill` says the job: it is the GROUND under the air alarms — the connection banner, the
   * raster banner, the output-missing banner, the failover slab — each of which puts
   * `--r-ink-on-fill` on top of it. The FOREGROUND counterparts already exist and are named for
   * their floors: `errorText` against 4.5 and `errorMark` against 3.0.
   *
   * ⚠ NO NEW RED, and no value moved: this is one identifier. Red's home in this console is
   * recorded beside the palette grammar — CONTROLS THAT DESTROY, and nothing else. A message is
   * never red, because a red message competes with the only red the operator must never misread.
   */
  alarmFill: '#991B1B',
  /*
   * ── PHASE 2A — ONE ERROR RED BECAME TWO, BECAUSE IT WAS DOING TWO JOBS ──────
   *
   * 🔴 **THE OWNER'S READING, and it is the thing to carry forward: a token whose
   * sites answer to TWO DIFFERENT FLOORS is a token that has to split.** Phase 2
   * measured `rgb(255 28 28)` below the 4.5 AA TEXT floor on four grounds
   * (`--r-surface` 4.48, `--r-surface-raised` 4.00, the row 3.94, the table header
   * 3.12) — and against the 3.0 GRAPHIC floor the very same ink passes on all six,
   * worst case 3.12. So the ink was never wrong; it was being asked two questions.
   * The answer is a SPLIT, not a re-tune, and neither half is a new colour:
   * `errorMark` keeps the owner's value byte for byte and `errorText` takes the
   * approved reference's own red, which the palette already carries.
   *
   * ⚠ WHICH ONE A SITE TAKES IS DECIDED BY WHAT IT RENDERS, NEVER BY ITS NAME.
   * A glyph, an LED, an icon → `errorMark`. A word, a sentence, a number →
   * `errorText`. **A site that renders BOTH takes BOTH** — the row's state cell,
   * the header's in-error tally, the status bar's health pill and the link
   * indicator each paint a mark and a word beside it, and each now passes two
   * colours rather than picking a winner.
   */
  /**
   * ERROR, as a MARK — a glyph, an icon, an LED. **The exact value the owner
   * specified** (2026-09-04, `RUNTIME-FIX-0904`) and it is not lifted, not
   * darkened and not derived: `rgb(255 28 28)`, byte for byte.
   *
   * Saturated on purpose, like `onAir`: it is the mark an operator has to find from
   * across a gallery. It is judged against the **3.0 graphic floor** and clears it
   * on every ground the app puts it on — worst case 3.12 on `--r-table-head-bg`.
   *
   * Worn by: the row's 25 px ERROR ✕ (`airStateVisual`), the header tally's
   * `TriangleAlert`, the status bar's ●/○ health LED when a server is down, and the
   * link indicator's ● when the bridge is gone.
   */
  errorMark: 'rgb(255 28 28)',
  /**
   * ERROR, as a WORD on a dark background — the reference's own red, already in
   * this palette (`REF_RED`) and not invented for this.
   *
   * Judged against the **4.5 AA text floor** and clears it everywhere: page 10.50 ·
   * panel 9.53 · raised 8.52 · inset 10.10 · row 8.38 · head 6.63.
   *
   * Worn by: the header's in-error count, the status bar's hard failure and its
   * `NO SERVER — SIMULATED` line, the link indicator's `DISCONNECTED` sentence, the
   * lock overlay's refusal, the Inspector's file error, the audit log's `failed`
   * outcome, the raster `MISMATCH` verdict and the outputs `AIR —` line.
   *
   * ⚠ SAME VALUE AS `--r-danger-text`, DIFFERENT NAME AND DIFFERENT ROLE. Danger is
   * destructive INTENT (the outlined Remove); error is something that FAILED. They
   * point at one base constant so neither can be retuned by accident through the
   * other, which is this file's standing rule for two roles that agree today.
   */
  errorText: REF_RED,
  offline: '#94A3B8',
  /**
   * An EMPTY layer row — its mark and all of its text. Exact value from the owner.
   *
   * Dimmer than `textMuted`, deliberately: a row with nothing on it should recede so
   * the rows that can actually do something own the attention. It is still a
   * legible grey rather than a near-black, because the row's NAME is its identity and
   * an operator has to be able to read which slot is free.
   */
  emptyRow: 'rgb(91 93 96)',
  /**
   * `B-232` / `STATION-SETUP-02` §R2 — the ink the MUTED texts take on a row the
   * emptied-air notice has MARKED.
   *
   * The mark's fill is the owner's opaque amber, `rgb(145 93 5)` (`controls.css`,
   * `.cg-row.is-emptied-air`), and on it `textMuted` measures 2.03:1 — below even the
   * 3:1 large-text floor — so the bank number and the "(not in this browser)" marker
   * were unreadable on exactly the rows the notice is pointing at. This is one weight
   * lighter, 5.06:1 on the fill, and it is spent ONLY on a marked row: everywhere else
   * the muted role keeps its grey. Moving the FILL is not the remedy — the value is
   * the owner's — so the ink moves.
   * `emptiedAirRowContrast.dom.test.ts` asserts the ratio against the real fill.
   *
   * ⚠ PHASE 2 RE-MEASURED THIS PAIR AND ONLY THE CONTROL MOVED. Both values here are
   * unchanged, so **5.06:1 is unchanged**. What moved is `textMuted` (`#9CA3AF` →
   * `#8e9eaf`), which took the positive control from 2.19:1 to **2.03:1** — still far
   * below 3:1, so the remedy is still needed and still works. And `text` on the fill
   * went from 4.498:1 to **4.99:1**: the primary ink now clears AA there on its own,
   * which is a bonus and NOT a reason to withdraw this ink, whose job is the MUTED
   * texts.
   */
  markedRowInk: '#F3F4F6',
  /**
   * R-022 — REHEARSING. Violet, and every other candidate in the palette was
   * ruled out for a specific reason rather than on taste:
   *
   *   - GREEN is out absolutely. It is the sacred ON AIR hue, and rehearse is the
   *     one state that most needs to not be confusable with air — it is precisely
   *     "this graphic CANNOT reach air".
   *   - SKY (`ready`) is out because READY is the state a row was in immediately
   *     before rehearse, so sharing the hue would make the mode change invisible
   *     at exactly the glance that matters.
   *   - AMBER (`pending`) is out because it means ATTENTION here (OCCUPIED,
   *     UNKNOWN, UNCONFIRMED). Rehearse is a deliberate, safe operator choice,
   *     not something to go and look at.
   *   - RED is out: error and destructive intent only.
   *
   * Violet is new to the state vocabulary, which is the point — a mode nobody has
   * seen before should not arrive wearing a colour that already means something.
   * And per the rule this whole module is built on, the hue is never alone: the
   * state carries its own SHAPE (a monitor, unique among a set of circles) and its
   * own WORD as well.
   *
   * PHASE 2 — moved to the reference's own violet, which it spends on exactly this:
   * `.badge.pvw`, `.pvw-active`, `.pvw-label`, `.pvw-text`. The four reasons above
   * are reasons about the HUE and every one of them still holds; the value is one
   * weight lighter and reads 8.79:1 on the panel where `#A78BFA` read 6.52:1.
   */
  rehearsing: REF_PURPLE,
} as const;

/**
 * R-007 design-system tokens. `cssVars` is the SINGLE SOURCE OF TRUTH for the
 * `--r-*` custom properties declared in `controls.css` (a parity test asserts
 * they match). TS consumers (primitives, `airStateVisual`) read the same values
 * here so the stylesheet and the components never drift.
 *
 * The sacred air-state colour above is reused here (`--r-onair` stays ON AIR only)
 * alongside the interactive accent, the caution/danger/success/dirty roles, and
 * the spacing / radius / type / motion scales. The look stays a calm dark
 * broadcast console.
 *
 * `--r-onair` and `--r-success` are both greens now, deliberately DIFFERENT ones:
 * on-air is the vivid green of the mock-up because it is the mark an operator has
 * to find from across a gallery, while success stays the softer mint of an ack
 * flash. Same family, different jobs — and they keep separate names so a tweak to
 * one cannot silently move the other. ⚠ The reference does NOT keep them apart —
 * see `colors.onAir` for the disagreement and who has to settle it.
 */
/*
 * ── SHARED BASE VALUES ──────────────────────────────────────────────────────
 *
 * Module-private, and never referenced by a component: a component reads a ROLE.
 * These exist only so two roles that genuinely share a value today share one
 * declaration — the indirection the naming rule explicitly allows. Adding a role
 * here does not make it a palette: nothing outside this file can name them.
 */
/** White, as the ink on any saturated fill dark enough to take it. */
const INK_LIGHT = '#FFFFFF';
/** The near-black ink a BRIGHT fill takes — the verb hovers, the file chip. */
const INK_DEEP = '#10151F';
/** The interactive sky. `--r-accent`'s value, shared with the Add role. */
const ACCENT_SKY = REF_BLUE;
/** The sky's LIFT — what a lit control rises to under the pointer (`.btn.primary:hover`). */
const ACCENT_LIFT = '#a7e2fc';
/** Amber as TEXT on a dark ground. */
const CAUTION_TEXT = REF_AMBER;
/** The sky at a tenth — what a SELECTED surface is washed with on this ground. */
const SELECTED_WASH = 'rgba(116, 205, 246, 0.1)';

/*
 * ── `RUNTIME-REDESIGN-01` PHASE 3 — THE LAYER ROW'S GEOMETRY, AS THE REFERENCE RENDERS IT ──
 *
 * The numbers behind the `--r-row-*` tokens below, exported as NUMBERS because the
 * table's column model (`features/layers/layerTable.ts`) does arithmetic on them —
 * `minWidthFor`, `gridTemplateColumns` — and a CSS string cannot be added up. ONE
 * declaration, two readers: the stylesheet reads the token, the model reads the
 * number, and neither may spell the value again.
 *
 * 🔴 **MEASURED IN CHROMIUM, NOT READ OFF THE STYLESHEET.** Phase 2 transcribed these
 * from the FIRST `.layer-table` rules in `04-playout-layers.html` — `td{padding:16px
 * 17px}`, `.row-actions .icon-btn{width:32px;height:34px}`, a `.destructive-group` —
 * and Phase 3 found that stylesheet appended to in four waves, the last of which
 * overrides every one of those (`…>td{height:67px;padding:15px 12px}`,
 * `.row-verb{width:48px;height:36px}`), while `.destructive-group` and `.row-title`
 * match NO element the prototype's own renderer emits. The values here are what a
 * browser paints for that file, measured at 1280 × 800 (`design.md` §10). If a number
 * is wrong it is wrong in ONE place, and the reference is one measurement away.
 */
export const LAYER_ROW_PX = {
  /**
   * A row's vertical and horizontal padding — `…tr>td{padding:15px 12px}`.
   *
   * The vertical 15 is what makes a row roughly twice its button's height. The first
   * version had effectively none (content plus a 10px allowance), so the list read as
   * a dense ledger rather than a set of separate rows. Padding is what makes a row a
   * target the eye can land on and the hand can hit, which matters more on this
   * surface than fitting a 31st row on screen — the list scrolls, and a mis-click
   * does not.
   */
  padY: 15,
  padX: 12,
  /** One row verb's box — `.row-verb{width:48px;height:36px;min-height:36px}`. */
  verbW: 48,
  verbH: 36,
  /** Between two verbs — `.row-actions{gap:12px}`. */
  verbGap: 12,
  /** The verb's glyph — `.row-verb svg{width:20px;height:20px}`. */
  verbGlyph: 20,
  /** The Graphics-beds divider band — `.layer-table .bed-divider>td{height:25px}`. */
  bedDividerH: 25,
  /**
   * …and its TYPE — `10px`, `700`, `letter-spacing: normal` (`MONITORS-01`, audit row 12).
   *
   * The weight and the tracking are spelled at the use site because they are not numbers
   * anything else reads; the SIZE is here because it is the one a reader will want to check
   * against the drawing beside `bedDividerH`. Phase 3 had 9.92 px tracked `.06em`, borrowed
   * from the sticky header — see `LayersPanel`'s `bedGroupHead` for why that argument did not
   * survive being measured.
   */
  bedDividerText: 10,
} as const;

/*
 * ── 🔴 `AUDIT-CLOSE-01` B — THE SHELL CHROME, MEASURED FOR THE FIRST TIME ──────────────
 *
 * Every number here is read off `04-playout-layers.html` in Chromium at 1280 × 800. They are
 * new because these two surfaces had never been measured at all: `design.md` §1.1 recorded the
 * app header as "no equivalent" and the layers sub-bar as ALREADY BUILT (it was not), so
 * neither ever reached a property table. The audit's bucket D is exactly this class.
 *
 * What they buy is the number the audit made the acceptance: 166 px of chrome above the first
 * data row in the reference against 481 px in the app, ten rows against four.
 */
export const APP_HEAD_PX = {
  /** `header.app-head{min-height:48px;padding:6px 12px;gap:10px}`, ruled below. */
  h: 48,
  padY: 6,
  padX: 12,
  gap: 10,
  /** `.brand{gap:8px}`, 29 px tall. */
  brandGap: 8,
  /** A door in this bar — `.btn.quiet{min-height:32px;padding:5px 9px;gap:7px;font-size:12px}`. */
  btnH: 32,
  btnPadY: 5,
  btnPadX: 9,
  btnGap: 7,
  btnText: 12,
  /** `.app-head .btn{border-radius:5px}`, confirmed in Chromium — a step above the toolbar's 4. */
  btnRadius: 5,
} as const;

/*
 * ── 🔴 `CONSOLE-MATCH-03` §2 — THE BULK GROUP'S SCOPE LABEL, ITS RULE, AND THE CARD'S FOOT ──
 *
 * Measured in Chromium at 1280 × 800 on `04-playout-layers.html`, never read off the
 * stylesheet: that file appends its rules in FOUR waves restating the same selectors and a
 * browser paints the LAST (`PROMPT.md` §0, added because Phase 2 transcribed a dead wave into
 * tokens and Phase 3 had to correct every one).
 *
 *   `.channel-target`     35.72 × 18   12 px, `padding: 0 9px 0 0`, no ground
 *   `.divider-vertical`        1 × 17   the line colour
 *   `.layer-footer`         1262 × 24   `padding: 3px 10px`, `gap: 9px`, 10 px muted
 */
export const LAYER_BULK_PX = {
  /** The `CH N` scope label ahead of the three bulk verbs. */
  targetText: 12,
  /** The well AFTER it — the reference pads the label rather than gapping the group. */
  targetWell: 9,
  /** The rule that splits the irreversible verb off from the two remedies. */
  dividerH: 17,
} as const;

export const LAYER_FOOTHINT_PX = {
  h: 24,
  padY: 3,
  padX: 10,
  gap: 9,
  text: 10,
} as const;

/*
 * ── 🔴 `CONSOLE-MATCH-03` §1 — THE MONITOR HEADS AND THE PGM SIGNAL STRIP ──
 *
 * Measured in Chromium at 1280 × 800 on `04-playout-layers.html` with `data-start="monitors"`,
 * never read off the stylesheet (`PROMPT.md` §0 — four waves, only the last one paints):
 *
 *   `.pvw-label` / `.pgm-label`   11 px / 650 / `letter-spacing: .825px`
 *   `.pvw-count`                  11 px / 400
 *   `.monitor-controls`           626 × 31   `padding: 3px 7px`, `gap: 7px`
 *
 * The label's WEIGHT is the one place this rounds: the reference paints 650, and Exo 2 ships
 * five static faces so a half step renders as a whole one — 650 IS 700 on screen. Declaring
 * 600 rather than 700 keeps the head from out-shouting the panel titles beside it, which the
 * reference gets for free from a variable face we do not load.
 */
export const MONITOR_HEAD_PX = {
  labelText: 11,
  /** `.825px` at 11 px — kept in px, as measured, rather than converted to a guessed em. */
  labelTrack: 0.825,
  /** Between the output's word and its channel. */
  labelGap: 7,
  chText: 10,
  factText: 11,
  stripH: 31,
  stripPadY: 3,
  stripPadX: 7,
  stripGap: 7,
} as const;

/*
 * ── 🔴 `CONSOLE-MATCH-03` §1 — THE STAGE'S "THIS IS NOT AIR" STAMP ─────────
 *
 * `.pvw-illustration-note`, measured in Chromium at 1280 × 800: 157.11 × 17.5 at 6 px from
 * the leading edge and 5 px from the bottom, `padding: 2px 4px`, radius 2, 9 px / 400 with
 * `letter-spacing: .36px`, in `rgb(137 154 175)` on `rgba(7 12 19 / .62)`.
 *
 * The GROUND is the load-bearing part: the stamp sits over an arbitrary graphic, so a
 * translucent plate under it is what keeps it readable against a white lower-third. The ink
 * is our own muted text rather than the reference's near-identical grey — one token, not two
 * greys three units apart.
 */
export const STAGE_NOTE_PX = {
  inset: 6,
  padY: 2,
  padX: 4,
  text: 9,
  track: 0.36,
} as const;

/*
 * ── 🔴 `CONSOLE-LOOK-06` §2 — THE COMPACT MONITOR HEAD, AND WHY IT IS ITS OWN BAR ──
 *
 * `CONSOLE-MATCH-03` matched the head's CONTENTS and left it in `--r-panel-bar-h`'s 52 px
 * box, so the two monitor panes each spent **53 px** of chrome on a bar the reference draws
 * in **32**. Measured in Chromium at 1280 × 800 on `04-playout-layers.html`
 * (`data-start="monitors"`), reading what PAINTS — the prompt's own candidate list is a list
 * of declarations to look FOR, not of values that win, and three of these were restated in a
 * later wave:
 *
 *   `.monitor`                      radius **5**, not the listed 10
 *   `.pvw-transport .btn`           **25 px / 11 px / 550**, not the listed 24 px / 9 px
 *   `.pvw-count`                    **11 px**, not the listed 10 — the COLOUR listed is right
 *
 * ⚠ AND THE TWO `display:none` RULES ARE `@media`-ONLY, exactly as the prompt warned.
 * `.pgm-air-count` and `.pgm-return-label` both paint `display: block` at 1280 — 99.17 × 16.5
 * and 62.86 × 16.5. Nothing the owner can see today was hidden.
 *
 * 🔴 WHY A MODIFIER AND NOT A NEW `--r-panel-bar-h`. That token is a FLOOR, and its own
 * comment says why: _"a height that belongs to being a footer cannot be a function of what a
 * section puts in it."_ The same holds here in reverse — the LAYERS bar carries bulk verbs
 * with a 36 px floor and must stay 52; the monitor heads carry an 11 px label and a count.
 * One bar, two jobs, so the compact head is a MODIFIER on the shared primitive rather than a
 * second primitive or a lowered floor.
 */
export const MONITOR_COMPACT_PX = {
  /** `.pvw-compact .monitor-head{padding:3px 9px;gap:8px;min-height:0}` → 32 px as painted. */
  headH: 32,
  headPadY: 3,
  headPadX: 9,
  headGap: 8,
  /** `.pvw-compact .monitor-head .icon-btn{width:25px;height:25px;padding:4px;border-radius:3px}` */
  headBtn: 25,
  headBtnPad: 4,
  headBtnRadius: 3,
  /** The panel's own corner — 5, not the 10 the candidate list carried. */
  cardRadius: 5,
  /** `h2 span`: `margin-left:5px; font-weight:500; opacity:.7`, inheriting the label's hue. */
  chIndent: 5,
  chOpacity: 0.7,
  /** `.pgm-signal > span{width:6px;height:6px;border-radius:50%}` — a FILLED dot, not a glyph. */
  signalDot: 6,
  /** `.pgm-signal{gap:6px}` — its own, one below the strip's 7. */
  signalGap: 6,
  /*
   * 🔴 THE TRANSPORT, as CONFIRMED rather than as listed. The candidate list carried
   * `min-height:24px; font-size:9px`, and a later wave restates both — what the browser paints
   * at 1280 is **25 px tall, 11 px, weight 550**, `padding: 2px 7px`, radius 3, gap 4, with a
   * 12 px glyph. The listed 9 px would have been unreadable and is not what the owner approved.
   */
  transportH: 25,
  transportPadY: 2,
  transportPadX: 7,
  transportGap: 4,
  transportRadius: 3,
  transportText: 11,
  /** `.pvw-scope` — 9 px, tracked .36px, the quietest thing on the row. */
  scopeText: 9,
  scopeTrack: 0.36,
} as const;

export const LAYER_SUBBAR_PX = {
  /** `.layer-subbar{height:40px;padding:5px 10px;gap:12px}`, ruled below. */
  h: 40,
  padY: 5,
  padX: 10,
  gap: 12,
  /** `.search{width:270px;height:29px}` with the glyph inset — `input{padding:4px 8px 4px 30px}`. */
  searchW: 270,
  searchH: 29,
  searchPadTop: 4,
  searchPadRight: 8,
  searchPadLeft: 30,
  /** The glyph itself, 14 px, 10 px in from the field's left edge. */
  searchGlyph: 14,
  searchGlyphInset: 10,
  /** `.check{gap:8px;font-size:12px}` and the `.hint` tally at 12 px. */
  checkGap: 8,
  text: 12,
  /*
   * 🔴 `CONSOLE-LOOK-06` §3 — the sub-bar has TWO type sizes, not one.
   *
   * `.pill-count` is 10 px, borderless and unpadded; `.badge` is 11 px at `2px 6px`. Both
   * confirmed in Chromium. `CONSOLE-MATCH-03` argued the pill up to 12 on the reasoning that
   * three sizes in one line read as a mistake — there are two, and the smaller one IS the
   * hierarchy.
   */
  pillText: 10,
  badgeText: 11,
  badgePadY: 2,
  badgePadX: 6,
} as const;

/*
 * ── `RUNTIME-REDESIGN-01` PHASE 4 — THE LOOK STRIP'S GEOMETRY, AS THE REFERENCE RENDERS IT ──
 *
 * Measured in Chromium at 1280 × 800 on `04-playout-layers.html` (`design.md` §11.2), never
 * read off the stylesheet — the look strip is restated FIVE times in that file and only the
 * last restatement paints (`PROMPT.md` §0, rendered-not-authored). The rendered strip: a
 * `.look-switch` flex line gapped 10 with a 79 px two-line context label, then a
 * `.look-button-strip` gapped 8 whose buttons are `38 px` tall, `min-width 100`, padded
 * `5px 12px`, radius 5, `13px` text, each carrying a `27 × 19` frame thumbnail.
 *
 * The thumbnail's cells are the LOOK's OWN rects (`TemplateLook.rects`, scene px over the
 * carrier's `resolution`), not the prototype's `columns` grid — the prototype invents a column
 * count per look; the schema has the real geometry, and it wins (`PROMPT.md` §0).
 */
export const LOOK_STRIP_PX = {
  /** One look button — `.look-switch button{height:38px;min-height:38px}`. */
  btnH: 38,
  /** …its floor width — `min-width:100px`: a large target, above the verb's 48. */
  btnMinW: 100,
  /** …its padding — `padding:5px 12px`. */
  btnPadY: 5,
  btnPadX: 12,
  /** …its corner — `border-radius:5px` (between the scale's 4 and 6; the drawing's own). */
  btnRadius: 5,
  /** …its word — `font-size:13px`. */
  btnText: 13,
  /** Between the thumbnail and the word inside a button — `gap:8px`. */
  btnGap: 8,
  /** Between two look buttons — `.look-button-strip{gap:8px}`. */
  stripGap: 8,
  /** Between the context label and the strip — `.look-switch{gap:10px}`. */
  ctxGap: 10,
  /** The context label's column — `.look-context{min-width:79px}`, 11 px 600. */
  ctxMinW: 79,
  ctxText: 11,
  /** The frame thumbnail — `.look-thumb{width:27px;height:19px;gap:2px}`. */
  thumbW: 27,
  thumbH: 19,
  thumbGap: 2,
} as const;
/*
 * ── `RUNTIME-REDESIGN-01` PHASE 9 — THE SURFACES THE REFERENCE DOES NOT DRAW ──────────
 *
 * Three of them borrow geometry the reference DOES draw, measured in Chromium at
 * 1280 × 800 (`design.md` §16.3): its `.notice` (one wave — the only single-wave rule this
 * programme has met), its `.global-toast` (three waves; the last paints `bottom:42px`), and
 * the `unlock-dialog` inside the Station-setup shadow root. Numbers, not rules.
 */
export const NOTICE_PX = {
  /** `.notice{padding:13px 15px;border-radius:8px}`. */
  padY: 13,
  padX: 15,
  radius: 8,
  /** `font-size:.8125rem;line-height:1.6` — 13 px on a 20.8 px line. */
  text: 13,
  line: 1.6,
  /** `gap:10px` between the 18 px icon and the text. */
  gap: 10,
  icon: 18,
} as const;
export const TOAST_PX = {
  /** `.global-toast{bottom:42px}` — the LAST of three restatements, and the one that paints. */
  bottom: 42,
  /** `padding:12px 17px;border-radius:9px;font-size:.875rem`. */
  padY: 12,
  padX: 17,
  radius: 9,
  text: 14,
} as const;
export const LOCK_PX = {
  /** The dialog box — 480 wide; `.sub-body{padding:32px 24px 23px}`. */
  cardW: 480,
  padTop: 32,
  padX: 24,
  padBottom: 23,
  /** `.unlock-icon{width:56px;height:56px;border-radius:14px}` around a 20 px glyph. */
  iconBox: 56,
  iconRadius: 14,
  iconGlyph: 20,
  /** `.unlock-title` 24 px / 650, centred; `.unlock-copy` 14 px muted. */
  titleText: 24,
  copyText: 14,
  /** `.pin-input` — 16 px mono, tracked `.3em`, a 44 px field. */
  pinText: 16,
  pinH: 44,
  /** The full-width `Unlock console` — `.btn.primary` at 40 px. */
  submitH: 40,
} as const;
/*
 * ── `RUNTIME-REDESIGN-01` PHASE 5 — THE INSPECTOR'S GEOMETRY, AS THE REFERENCE RENDERS IT ──
 *
 * Measured in Chromium at 1280 × 800 on `05-row-inspector.html` (`design.md` §12.3), never
 * read off the stylesheet: `.inspector` is restated THIRTY-THREE times in that file (26 of
 * them unconditional), `.inspector-foot` eight, `.position-controls` ten, and only the last
 * restatement paints (`PROMPT.md` §0). What paints: a `12px` body pad; section headings at
 * `12px` semibold, tracked `.03em`, in the second ink; field inputs `31 px` tall (`5px 8px`
 * pad, `13px` text) and the two position inputs `32 px`, filling a `66px 1fr 1fr auto` grid
 * with `12px`/500 labels on an `18px` line; a footer padded `9px 12px` carrying a top rule
 * and an upward shadow, its two `32 px` buttons on a `104 px` floor at `13px`, gapped 10, and
 * an `11px` hint line under them.
 *
 * ⚠ NOT here, deliberately: the anchor grid's `20 px` cells (the app keeps `30` — a hit
 * target under the 24 px floor is the `A8` shape again), the field NAME's `13px` (owner
 * decision, kept), and the reference's monitor head height (one `--r-panel-bar-h` for all
 * four panels). Each is argued in `design.md` §12.3 rather than transcribed.
 */
export const INSPECTOR_PX = {
  /** A section heading — `.inspector-section h3{font-size:12px;letter-spacing:.03em}`. */
  sectionText: 12,
  sectionTracking: '0.03em',
  /** A control's label — `.inspector .field>label{font-size:12px}` on an 18 px line. */
  labelText: 12,
  labelLine: 18,
  /** A field input — `.inspector input{height:31px;padding:5px 8px;font-size:13px}`. */
  fieldText: 13,
  fieldPadY: 5,
  fieldPadX: 8,
  fieldH: 31,
  /** The two position inputs — `.inspector .position-controls input{height:32px}`. */
  positionFieldH: 32,
  /** …and the floor each takes in the `minmax(48px,1fr)` columns they fill. */
  offsetMinW: 48,
  /** The footer — `.inspector-foot{padding:9px 12px}`, its buttons and their gap. */
  footPadY: 9,
  footPadX: 12,
  footGap: 10,
  footBtnMinW: 104,
  footBtnText: 13,
  /** The hint under the buttons — `.inspector-foot .target-hint{font-size:11px}`. */
  hintText: 11,
} as const;
/*
 * ── `RUNTIME-REDESIGN-01` PHASE 6 — LIVE PLATES AND THE AUDIO DIALOG, AS THE REFERENCE RENDERS ──
 *
 * Measured in Chromium at 1280 × 800 on `07-live-plates.html` and `08-live-audio.html`
 * (`design.md` §13.3), never read off the stylesheet: `.plate-table` is restated TWENTY times
 * in that file, `.plate-toolbar` eleven, `.audio-modal` ten, and only the last unconditional
 * wave paints (`PROMPT.md` §0). What paints for the plates pane: a 40 px toolbar (`4px 12px`,
 * 12 px text); a 30 px table head at 11 px on the raised ground; 42 px rows with `4px 10px`
 * cells at 13 px (the coordinate 12 px, the plate handle 11 px muted); a 5 px audio dot on a
 * 12 px word; a 140 × 26 fader with an 11 px readout; `ON · OFF` at 40 × 32 and `SOLO` at
 * 46 × 32, 11 px, gapped 5. For the dialog: a 13 px subtitle; a context line padded `11px`;
 * a three-column body (`1fr · 269 · 190`, gapped 18) whose rows are 85 px (`12px 0`); a 29 px
 * index chip; 14 px name over a 12 px seat line; a 28 px fader with a 43 px readout and a 12 px
 * state word; `ON · OFF · SOLO` at 58 × 36, gapped 8; a 12 px footer sentence.
 *
 * ⚠ NOT here, deliberately: the reference's per-verb hover hues (the app's Button primitive
 * owns its variants' hovers), its owner-filter select and help icon (argued in §13.3), and its
 * `On air` context badge (A12). Each is argued rather than transcribed.
 */
export const PLATES_PX = {
  /** The toolbar — `.plate-toolbar{min-height:40px;padding:4px 12px;gap:10px;font-size:12px}`. */
  toolbarH: 40,
  toolbarPadY: 4,
  toolbarPadX: 12,
  toolbarGap: 10,
  toolbarText: 12,
  /** The table head — `th{height:30px;padding:4px 10px;font-size:11px}`. */
  headH: 30,
  headText: 11,
  /** A row and its cells — `tr{height:42px}`, `td{padding:4px 10px;font-size:13px}`. */
  rowMinH: 42,
  cellPadY: 4,
  cellPadX: 10,
  cellText: 13,
  /** The coordinate cell — 65 px wide, 12 px, nowrap. */
  coordW: 65,
  coordText: 12,
  /** The plate handle beside the producer — `.plate-slot{font-size:11px}`. */
  slotText: 11,
  /** The owner link — `.plate-owner-link{min-height:30px;font-size:12px}`. */
  ownerBtnH: 30,
  ownerText: 12,
  /** The picture and audio words — 12 px; the audio dot 5 px, gapped 6. */
  wordText: 12,
  pillDot: 5,
  pillGap: 6,
  /** The fader — `.plate-gain input{min-width:140px;min-height:26px}`, its readout 34 px / 11 px. */
  gainW: 140,
  gainH: 26,
  gainGap: 9,
  /**
   * …and its CORNER — order-radius: 7px (MONITORS-01, audit row 58). NOT a step on
   * the radius scale and deliberately not folded into one: it is this control's own
   * dimension, measured off the drawing, the same way gainW and gainH are.
   */
  gainRadius: 7,
  readoutW: 34,
  readoutText: 11,
  /** The verbs — `ON`/`OFF` 40 × 32, `SOLO` 46 × 32, 11 px, gapped 5. */
  verbW: 40,
  soloW: 46,
  verbH: 32,
  verbText: 11,
  verbGap: 5,
  /** The panic button — `.plate-panic{min-height:30px}`. */
  panicH: 30,
  /** The remaining columns as rendered: owner 95, picture 90, audio 140, gain 207, controls 157. */
  colOwner: 95,
  colPicture: 90,
  colAudio: 140,
  colGain: 207,
  colControls: 157,
} as const;
export const AUDIO_DIALOG_PX = {
  /** The subtitle under the title — `#audio-subtitle{font-size:13px;margin-top:3px}`. */
  subtitleText: 13,
  /** The context line — `.audio-context{padding:11px 20px;font-size:13px}`, its hint 12 px. */
  contextPadY: 11,
  contextText: 13,
  hintText: 12,
  /** The column head — `.audio-head{padding:10px 0;font-size:12px}`. */
  headPadY: 10,
  headText: 12,
  /** The three columns — `minmax(0,1fr) 269px 190px`, gapped 18. */
  colGain: 269,
  colVerbs: 190,
  colGap: 18,
  /** One mixer row — `padding:12px 0;min-height:83px` (85 rendered with its rule). */
  rowPadY: 12,
  rowMinH: 83,
  /** The frame index chip — 29 × 29, radius 4, 13 px. */
  indexBox: 29,
  indexText: 13,
  /** The name and the seat line — `strong{font-size:14px}`, `small{font-size:12px;margin-top:3px}`. */
  nameText: 14,
  seatText: 12,
  /** The fader — `input{min-height:28px}`, the readout 43 px / 13 px, the state word 12 px. */
  sliderH: 28,
  sliderGap: 10,
  readoutW: 43,
  readoutText: 13,
  stateText: 12,
  /** The verbs — 58 × 36, 12 px, gapped 8. */
  verbW: 58,
  verbH: 36,
  verbGap: 8,
  verbText: 12,
  /** The footer sentence — `.foot-info{font-size:12px}`. */
  footText: 12,
} as const;
/**
 * `RUNTIME-REDESIGN-01` PHASE 7 — Station setup (`09-channel-settings.html`) as RENDERED, measured
 * in Chromium at 1280 × 800 with the dialog opened by the page's own `data-start="channels"`
 * (`design.md` §14.3). ⚠ The reference's Station setup is a SEPARATE prototype inside a shadow
 * root (`createStationSetup`), with its own stylesheet (402 rules, one sheet: `.settings` restated
 * 17 times, `.tab` 12, `.card` 12, `.metric` 13 — 10, 4, 3 and 8 of those under `@media`) and its
 * OWN palette (`--surface #15191f`, a mint `--accent #8ce6d1`) that is NOT the console's approved
 * palette. Only the GEOMETRY is transcribed here; every colour is a role token, and the mint stays
 * where owner answer A4 put it — on healthy, never on air.
 *
 * ⚠ NOT here, deliberately: the reference's `Default sources · this channel` card (the prototype's
 * own `t.defaultSources`, ruled out by `PROMPT.md` §0), its head-status `3 on air` (A12), its
 * emblem, its `Preview` tag and its sidebar station card — each argued in §14.3.
 */
export const STATION_SETUP_PX = {
  /** The frame — `.settings{width:min(1140px,calc(100vw - 64px));height:min(810px,calc(100dvh - 64px))}`. */
  frameW: 1140,
  frameH: 810,
  frameInset: 64,
  /**
   * 🔴 `MONITORS-01`, audit rows 71, 74 and 77 — the frame's CORNER, its TITLE and its
   * CLOSE, as rendered (`border-radius: 16px`; `h2` 19 px / 650; the close a 38 × 38 box
   * with an 8 px corner). Phase 7 took this frame's width, height, head, rail, pane and
   * footer and left these four to the modal primitive; the primitive's are 6 px, a
   * `0 4px 16px` shadow, `1rem / 700` and a 30 px square.
   *
   * ⚠ `titleTextFrame` is deliberately NOT `titleText`, which is the PANE's `h2` (24 px) and
   * a different heading on the same surface. Two headings, two numbers, two names.
   */
  frameRadius: 16,
  titleTextFrame: 19,
  closeBox: 38,
  closeRadius: 8,
  /** The head — `.settings-head{min-height:90px;padding:21px 28px;gap:14px}`, its subtitle 13 px, 3 px under the title. */
  headMinH: 90,
  headPadY: 21,
  headPadX: 28,
  headGap: 14,
  subtitleText: 13,
  subtitleGap: 3,
  /** The rail — `.settings-body{grid-template-columns:226px …}`, `.sidebar{padding:24px 14px 18px}`. */
  railW: 226,
  railPadTop: 24,
  railPadX: 14,
  railPadBottom: 18,
  railGap: 4,
  /** A group heading — `.nav-group{font-size:11px;font-weight:600;letter-spacing:.11em;padding:18px 13px 7px}` (the first `padding-top:0`). */
  groupText: 11,
  groupTracking: '0.11em',
  groupPadTop: 18,
  groupPadX: 13,
  groupPadBottom: 7,
  /** A rail item — `.tab{min-height:44px;padding:11px 12px;gap:11px;border-radius:8px;font-size:14px;line-height:1.35}`, its icon 18 px. The line-height is unitless and lives in `controls.css`; it is what keeps the 44 a floor rather than a 45. */
  tabMinH: 44,
  tabPadY: 11,
  tabPadX: 12,
  tabGap: 11,
  tabRadius: 8,
  tabText: 14,
  tabIcon: 18,
  /** The pane — `.panel-scroll{padding:29px 32px 32px}`. */
  panePadTop: 29,
  panePadX: 32,
  panePadBottom: 32,
  /** The section head — `h2` 24 px / 650 / −.035em; the description 14 px, 7 px under, `max-width:61ch`; 23 px under the head. */
  titleText: 24,
  titleTracking: '-0.035em',
  descriptionText: 14,
  descriptionGap: 7,
  descriptionMaxCh: 61,
  headGapBelow: 23,
  /** The contract tag — `.tag{font-size:12px;font-weight:550;padding:5px 8px;border-radius:6px;gap:6px}`. */
  tagText: 12,
  tagPadY: 5,
  tagPadX: 8,
  tagRadius: 6,
  /** The footer — `.panel-foot{min-height:74px;padding:15px 32px;gap:14px}`, its message 13 px. */
  footMinH: 74,
  footPadY: 15,
  footPadX: 32,
  footGap: 14,
  footText: 13,
  /** A card — `.card{border-radius:12px}`, `.card-heading{padding:17px 20px;gap:12px}` with `h3` 16 px / 600, `.card-body{padding:20px}`, `.card-help{padding:14px 20px;font-size:13px}`; 20 px between cards. */
  cardRadius: 12,
  cardHeadPadY: 17,
  cardHeadPadX: 20,
  cardHeadGap: 12,
  cardTitleText: 16,
  cardBodyPad: 20,
  cardHelpPadY: 14,
  cardHelpPadX: 20,
  cardHelpText: 13,
  cardGap: 20,
  /** The video-format card — `.video-heading{padding:19px 22px 0}`, `.eyebrow` 11 px / 600 / .11em, `.channel-token` 12 px mono `5px 8px` radius 6, `.video-mode{padding:5px 22px 21px;gap:12px}` with `strong` 46 px / 550 / −.055em and `.scan` 13 px, `.video-metrics{margin:0 22px;padding:17px 0 20px}` with `dt` 12 px (5 px under) and `dd` 15 px / 500, each metric inset 22 px behind a rule. */
  videoHeadPadTop: 19,
  videoPadX: 22,
  eyebrowText: 11,
  tokenText: 12,
  tokenPadY: 5,
  tokenPadX: 8,
  tokenRadius: 6,
  modePadTop: 5,
  modePadBottom: 21,
  modeGap: 12,
  modeText: 46,
  modeTracking: '-0.055em',
  scanText: 13,
  metricsPadTop: 17,
  metricsPadBottom: 20,
  metricText: 12,
  metricGap: 5,
  metricValueText: 15,
  metricInset: 22,
  /** The outputs block — `.outputs{margin-top:26px}`, `.subsection-head{margin-bottom:13px}` with `h3` 16 px / 600; `th{padding:12px 18px;font-size:12px;font-weight:450}`, `td{padding:15px 18px;font-size:14px}`, the slot column 80 px, `.slot` 29 × 28 mono 12 px radius 6, `.output-name{gap:10px;font-weight:500}` with a 17 px glyph, `.output-state{font-size:13px;gap:7px}` with a 15 px glyph, `.output-note{font-size:13px;margin-top:12px}`. */
  outputsGapAbove: 26,
  outputsHeadGap: 13,
  outputsTitleText: 16,
  thPadY: 12,
  thPadX: 18,
  thText: 12,
  tdPadY: 15,
  tdPadX: 18,
  tdText: 14,
  slotColW: 80,
  slotW: 29,
  slotH: 28,
  slotText: 12,
  slotRadius: 6,
  outputNameGap: 10,
  outputIcon: 17,
  stateText: 13,
  stateGap: 7,
  stateIcon: 15,
  noteText: 13,
  noteGap: 12,
  /** `.helper-details{font-size:13px;margin-top:17px}`, its paragraph 9 px under, `max-width:70ch`. */
  detailsText: 13,
  detailsGap: 17,
  detailsBodyGap: 9,
  detailsMaxCh: 70,
  /*
   * `SETTINGS-DIALOG-01` §3 — THE FOUR STATION-WIDE TAB BODIES, which Phase 7 deliberately left
   * (`design.md` 14.8: _"It did not re-measure the bodies of the Servers, Live sources,
   * Delimiters and Layers tabs"_ — audit rows 134–137). Measured the same way as the rest of this
   * block: Chromium at 1280 × 800, `09-channel-settings.html`, through the shadow root, with each
   * pane's own tab CLICKED first — a `hidden` pane reports a 0 × 0 box, so an unclicked reading is
   * no reading at all.
   */
  /**
   * The reference's `.field` — a label ABOVE its control, which is the single biggest structural
   * difference on these tabs: the app spells every one as an inline `label + input` row.
   * `.field{display:flex;flex-direction:column;gap:7px}`, its `label` 13 px / 500 secondary,
   * its `.input`/`.select` `min-height:42px;padding:10px 12px;border-radius:8px` at 15 px, and
   * its `.hint` 12 px muted.
   *
   * 🔴 **`SETTINGS-MATCH-02` — THE CONTROL'S BOX WAS MIS-TRANSCRIBED, and the owner saw it
   * before the record did («این قسمت نامرتبه», on the plant).** `SETTINGS-DIALOG-01` recorded
   * `36 / 7px 10px` and the reference renders `42 / 10px 12px` — checked twice over, once by
   * measuring the painted box through the shadow root (`.input` rect height **42**, computed
   * `min-height: 42px`, `padding: 10px 12px`) and once in the drawing's own text
   * (`.input,.select,.textarea{min-height:42px;padding:10px 12px}`). Six pixels of height on
   * every field in the dialog, and the visible cost is not the field itself: the FILTER BAR's
   * search box sat 31 px tall beside a 20 px check, with its own magnifier glyph inset for a
   * 42 px box and therefore hanging five pixels below the field's centre.
   */
  fieldGap: 7,
  fieldLabelText: 13,
  fieldInputMinH: 42,
  fieldInputPadY: 10,
  fieldInputPadX: 12,
  fieldInputRadius: 8,
  fieldInputText: 15,
  fieldHintText: 12,
  /**
   * The field GRID — `.fields{gap:19px 18px}`. Two columns at `394px 394px` in an 806 px body
   * (an even split), and `.fields.three` at `364.734px 202.625px 202.625px`, which is the
   * reference's own `1.8fr 1fr 1fr` resolved: 806 − 2 × 18 = 770, and 770 × 1.8/3.8 = 364.7.
   * Declared as the ratio rather than the three pixel widths, so the grid survives a narrower
   * frame — the reference's own declaration is the ratio too.
   */
  fieldsRowGap: 19,
  fieldsColGap: 18,
  fieldsThreeRatio: '1.8fr 1fr 1fr',
  /** The lede above a field grid — `.card-body p.secondary{font-size:13px;margin-bottom:19px}`. */
  cardLedeText: 13,
  cardLedeGap: 19,
  /**
   * The A/B chip on a server card's head — `.server-label`, a 25 × 25 grid-centred 12 px box
   * with a 6 px corner. ⚠ Its mint ground is NOT adopted: green means air or health by the
   * owner's own rule (`design.md` §20.6), so it takes the raised surface the slot chip took.
   */
  serverChipBox: 25,
  serverChipText: 12,
  serverChipRadius: 6,
  /**
   * The empty state inside a card — `.empty-backup{padding:19px 20px;gap:14px}` with a 42 × 42
   * radius-10 glyph box, a 14 px / 600 line and a 13 px muted one 3 px under it.
   */
  emptyPadY: 19,
  emptyPadX: 20,
  emptyGap: 14,
  emptyIconBox: 42,
  emptyIconRadius: 10,
  emptyTitleText: 14,
  emptyBodyText: 13,
  emptyBodyGap: 3,
  /**
   * A switch row under a field grid — `.switch-row{padding:17px 0 0;gap:20px}`, its label and
   * hint on the left and the control on the right.
   */
  switchRowPadTop: 17,
  switchRowGap: 20,
  /**
   * The pane's own NOTICE band — `.notice{padding:15px 17px;gap:11px;border-radius:10px;
   * margin-bottom:21px}`, a 14 px / 600 headline over a 13 px line.
   *
   * ⚠ ADOPTED AS GEOMETRY ONLY. This band is for the standing, ambient facts a section states
   * about itself, never for an EVENT — the pinned region keeps that job (`AUDIT-CLOSE-01`
   * delta A, `modal-message-containment.spec.ts`).
   *
   * 🔴 `SETTINGS-POLISH-04` §4 — **THE ON-AIR BLOCK IS ONE OF THOSE STANDING FACTS, and the
   * sentence above used to say the opposite.** It read "it does NOT become the home of the
   * on-air refusal", which conflated two things the rest of that paragraph keeps apart: a
   * REFUSAL (an act was attempted and did not happen — pinned) and a BLOCK (a condition that is
   * in force before anything is pressed — this band). `Server changes are paused while on air`
   * is the second, is true at rest, never changes within a tab, and is exactly what the
   * reference puts in its one `.notice`. It renders here now. Nothing about WHEN a commit is
   * refused moved with it — see `SetupNotice.tsx` and `isBlocked`.
   */
  noticePadY: 15,
  noticePadX: 17,
  noticeGap: 11,
  noticeRadius: 10,
  noticeGapBelow: 21,
  noticeTitleText: 14,
  noticeBodyText: 13,
  /** `.notice>svg{width:19px;height:19px;margin-top:2px}` — aligned to the title's first line. */
  noticeIcon: 19,
  noticeIconOffset: 2,
  /** `.notice strong{display:block;margin-bottom:3px}`. */
  noticeTitleGapBelow: 3,
  /*
   * ── `SETTINGS-MATCH-02` — THE REST OF THE DIALOG, measured the same way (Chromium, 1280 × 800,
   * through the shadow root, every pane's tab CLICKED first). The frame's emblem, the rail's two
   * marks and its foot, the footer message, the dialog's own button family, the list header, a
   * resource row, the band card, the delimiter table, the whole Layers pane, a switch, the
   * address chips and the help strip's glyph.
   */
  /** `.settings-emblem` — 44 × 44, radius 12, a 23 px glyph; `h1` tracked −.02em. */
  emblemBox: 44,
  emblemRadius: 12,
  emblemGlyph: 23,
  titleTrackingFrame: '-0.02em',
  /** The rail's marks — `.nav-count` 18 × 18 radius 4 at 11 px / 700; `.nav-symbol svg` 13 px. */
  navCountBox: 18,
  navCountRadius: 4,
  navCountText: 11,
  navSymbolIcon: 13,
  /** The sidebar foot — `.sidebar-foot{padding:28px 11px 0}`; `.station-card{padding-top:18px;gap:10px}` over a rule; the avatar 32 × 32 radius 8 at 12 px mono; the name 13 px / 550; the host 11 px mono, 2 px under. */
  railFootPadTop: 28,
  railFootPadX: 11,
  stationCardPadTop: 18,
  stationCardGap: 10,
  stationAvatarBox: 32,
  stationAvatarRadius: 8,
  stationAvatarText: 12,
  stationNameText: 13,
  stationHostText: 11,
  stationHostGap: 2,
  /** The footer's message — `.foot-message{gap:8px}` with a 16 px glyph; `.foot-actions{gap:9px}`. */
  footMessageGap: 8,
  footMessageIcon: 16,
  footActionsGap: 9,
  /** The dialog's own button — `.btn{min-height:40px;padding:9px 15px;border-radius:8px;font-size:14px;gap:8px}` with a 17 px glyph; `.icon-btn` 38 × 38, radius 8. */
  btnMinH: 40,
  btnPadY: 9,
  btnPadX: 15,
  btnRadius: 8,
  btnText: 14,
  btnGap: 8,
  btnIcon: 17,
  iconBtnBox: 38,
  iconBtnRadius: 8,
  /** The section tag's glyph — `.tag svg` 13 px, gap 6. */
  tagIcon: 13,
  tagGap: 6,
  /** A list header — `.list-header{margin-bottom:14px;gap:14px}`; its `h3` 16 px / 600 with the muted count 4 px after. */
  listHeadGapBelow: 14,
  listHeadGap: 14,
  listCountGap: 4,
  /** A resource row — `.resource{grid-template-columns:40px minmax(0,1fr) auto;gap:13px;padding:18px 20px}`; its tile 40 × 40 radius 9 (a 20 px glyph); the title row gapped 10 with a 14 px / 600 name and an 11 px / 500 / .035em kind; the description 12 px, 5 under; its two icon buttons 2 apart. */
  resourceIconBox: 40,
  resourceIconRadius: 9,
  resourceGap: 13,
  resourcePadY: 18,
  resourcePadX: 20,
  resourceTitleGap: 10,
  resourceTitleText: 14,
  resourceTypeText: 11,
  resourceTypeTracking: '0.035em',
  resourceDescText: 12,
  resourceDescGap: 5,
  resourceActionsGap: 2,
  /** The band card — `.band-card{margin-top:24px}`; `.band-fields{grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr) auto;gap:12px;max-width:470px}` with the dash padded 10 under; `.band-summary` 12 px, 13 under. */
  bandGapAbove: 24,
  bandFieldsGap: 12,
  bandFieldsMaxW: 470,
  bandDashW: 20,
  bandDashPadBottom: 10,
  bandSummaryText: 12,
  bandSummaryGap: 13,
  /** The delimiter table — `td{padding:12px 18px}`, the actions column 104; `.delimiter-symbol` min 40 × 29, `3px 9px`, radius 6, 14 px mono; `.delimiter-meaning` 12 px, 9 after; `.delimiter-bottom{margin-top:14px;gap:18px}` at 13 px; `.reset-link{padding:7px 0}` underlined 4 under. */
  delimiterTdPadY: 12,
  delimiterActionsW: 104,
  delimiterSymbolMinW: 40,
  delimiterSymbolMinH: 29,
  delimiterSymbolPadY: 3,
  delimiterSymbolPadX: 9,
  delimiterSymbolRadius: 6,
  delimiterSymbolText: 14,
  delimiterMeaningText: 12,
  delimiterMeaningGap: 9,
  delimiterBottomGapAbove: 14,
  delimiterBottomGap: 18,
  delimiterBottomText: 13,
  resetLinkPadY: 7,
  resetLinkUnderline: 4,
  /** The Layers pane — `.layer-summary{gap:8px;margin-top:14px}`; `.filter-bar{gap:16px;margin:21px 0 15px}`; `.search-field{max-width:320px}` with a 17 px glyph inset 12 and the input padded 37 at 13 px; `.check{gap:8px}` 13 px with a 16 px box; `.layer-results` 12 px; `.layer-table{min-width:605px}` with th/td `11px 13px` and columns 73 / 65 / 40 %; `.layer-id` 13 px / 500 mono; `.row-number` 11 px, 2 under; `.template-name` 13 px; `.occupied-label` 11 px, 4 under, gap 4, an 11 px glyph; the table's input `min-height:37px;padding:8px 10px` at 13 px; a dirty row's 3 px inset; `.layer-footnote` 12 px, 10 above, gap 6, a 14 px glyph; `.beds-head{margin:25px 0 13px}` with `h3` 16 / 600 over a 13 px line 4 under; `.empty-state{padding:32px 20px}` with a 28 px glyph 8 over the `h3` and a 13 px line 5 under. */
  summaryGap: 8,
  summaryGapAbove: 14,
  filterGap: 16,
  filterGapAbove: 21,
  filterGapBelow: 15,
  searchMaxW: 320,
  searchIcon: 17,
  searchIconInset: 12,
  searchPadStart: 37,
  searchText: 13,
  checkGap: 8,
  checkText: 13,
  checkBox: 16,
  resultsText: 12,
  layerTableMinW: 605,
  layerThPadY: 11,
  layerThPadX: 13,
  layerColLayerW: 73,
  layerColShowW: 65,
  layerColNamePct: 40,
  layerIdText: 13,
  rowNumberText: 11,
  rowNumberGap: 2,
  templateNameText: 13,
  occupiedText: 11,
  occupiedGap: 4,
  occupiedIcon: 11,
  layerInputMinH: 37,
  layerInputPadY: 8,
  layerInputPadX: 10,
  layerInputText: 13,
  dirtyInset: 3,
  footnoteText: 12,
  footnoteGapAbove: 10,
  footnoteGap: 6,
  footnoteIcon: 14,
  bedsHeadGapAbove: 25,
  bedsHeadGapBelow: 13,
  bedsHeadText: 16,
  bedsLineText: 13,
  bedsLineGap: 4,
  emptyStatePadY: 32,
  emptyStatePadX: 20,
  emptyStateIcon: 28,
  emptyStateIconGap: 8,
  emptyStateText: 13,
  emptyStateGap: 5,
  /** A switch — `.switch-track` 36 × 21 radius 20; its knob 13, inset 3, travelling 15. */
  switchW: 36,
  switchH: 21,
  switchRadius: 20,
  switchKnob: 13,
  switchKnobInset: 3,
  switchTravel: 15,
  /** The local-address chips — `.address-chips{gap:7px;margin-top:2px}`; a chip `4px 7px`, radius 5, 12 px mono. */
  chipsGap: 7,
  chipsGapAbove: 2,
  addressChipPadY: 4,
  addressChipPadX: 7,
  addressChipRadius: 5,
  addressChipText: 12,
  /** The help strip's glyph — `.card-help svg` 15 px, 3 px down; `.card-help.inline{gap:8px}`. */
  helpIcon: 15,
  helpIconOffset: 3,
  helpGap: 8,
  /** The mono input — `.input.mono` renders 14 px (the `.select` keeps 15). */
  fieldMonoText: 14,
  /**
   * ── `SETTINGS-MATCH-02` §8 — THE SUB-DIALOG, the one frame every add / edit / remove in
   * Station setup opens. `.sub-dialog{width:min(480px,calc(100vw - 32px))}`,
   * `.sub-head{padding:21px 24px 17px;gap:12px}` with an 18 px / −.02em title,
   * `.sub-body{padding:23px 24px}` whose `.fields` gap is 17, and
   * `.sub-foot{padding:16px 24px;gap:9px;background:#12171e}`.
   */
  subW: 480,
  subInset: 32,
  subHeadPadTop: 21,
  subHeadPadX: 24,
  subHeadPadBottom: 17,
  subHeadGap: 12,
  subTitleText: 18,
  subBodyPadY: 23,
  subBodyPadX: 24,
  subFieldsGap: 17,
  subFootPadY: 16,
  subFootPadX: 24,
  subFootGap: 9,
  /** Its lede — `.sub-description{font-size:14px;line-height:1.65;margin-bottom:20px}`. */
  subLedeText: 14,
  subLedeGap: 20,
  /** The kind picker — `.kind-options{grid 3 × 1fr;gap:8px}`, an option `min-height:46px` radius 8 at 13 px with a 16 px glyph. */
  kindOptionsGap: 8,
  kindOptionMinH: 46,
  kindOptionRadius: 8,
  kindOptionText: 13,
  kindOptionIcon: 16,
  /**
   * 🔴 `SETTINGS-POLISH-04` §5 — **THE ONE NUMBER THE DRAWING CANNOT GIVE**, and it is derived
   * rather than invented.
   *
   * Every other value in this block is the reference's. This one cannot be: the reference lays
   * out THREE kinds at `1fr` each and never has to say how wide one wants to be. Ours has five,
   * so they wrap, and a wrapping row needs a basis.
   *
   * 112 px is the widest option's CONTENT measured at 1280 × 800 — a 16 px glyph, the 8 px gap,
   * and `DeckLink` at 13 px — plus the borders, rounded up to leave a little air. At the
   * sub-dialog's 404 px content width that is three tracks (3 × 112 + 2 × 8 = 352), which is the
   * shape §5 calls correct, and it is what stops the browser choosing a track narrower than the
   * label inside it — the exact fault the old `minmax(0, 1fr)` allowed. It is the MINIMUM, not
   * the width: the tracks then share the row and render 129 px.
   */
  kindOptionBasis: 112,
  /** The destructive emblem — `.confirm-icon` 44 × 44, radius 11, 16 px under it. */
  confirmIconBox: 44,
  confirmIconRadius: 11,
  confirmIconGap: 16,
  /** Its copy — `.confirm-copy{font-size:14px;line-height:1.7}`. */
  confirmCopyText: 14,
  /** The delimiter PREVIEW — `.split-preview{padding:15px;border-radius:9px;margin-top:18px}` on `#121820`, its eyebrow 10 under, its chips `5px 10px` radius 5 gapped 6. */
  previewPad: 15,
  previewRadius: 9,
  previewGapAbove: 18,
  previewEyebrowGap: 10,
  previewChipPadY: 5,
  previewChipPadX: 10,
  previewChipRadius: 5,
  previewChipGap: 6,
} as const;
/**
 * `RUNTIME-REDESIGN-01` PHASE 8 — the template picker (`01-template-picker.html`) and the
 * import surface (`02-template-import.html`) as RENDERED, measured in Chromium at 1280 × 800
 * with each dialog opened by the page's own `data-start` (`design.md` §15.3). ⚠ All three of
 * this phase's dialogs live in the OUTER document — none is a shadow-root prototype like Station
 * setup; checked (`getRootNode() === document`, zero shadow hosts on the page at those starts).
 * The one stylesheet holds 1067 rules; `.modal-head` is restated 10 times, `.template-detail`
 * 9, `.template-row` 6, `.drop-zone` 6, `.import-step` 9 — the `@media` waves do not paint at
 * this viewport, and the numbers here are what the browser painted.
 *
 * ⚠ NOT here, deliberately: the reference's `Into` destination select (the picker's door is the
 * row, so the destination is fixed — and `RUNTIME-REPAIR-04`'s aside now NAMES it, which is the
 * fact that select carried), its aside's SELECTED-TEMPLATE half with the `Compatible with this
 * row` notice and its select-then-`Load into` footer (~~the row's one-click load is the
 * contract twenty specs drive~~ — ⭐ REVERSED by the owner on 2026-09-09, `RUNTIME-REPAIR-05`:
 * the picker is two dialogs and a row is selected then committed, so the aside, the notice and
 * the `Load into` footer are all BUILT), and the import wizard's `Review` step (simulated
 * checks by its own disclaimer — the product's verification is `verify → unpack → runtimeShortfall → render`,
 * unchanged). Each is argued in §15.3 and §21.1.
 *
 * ⭐ The `Manage` view and the aside's FRAME are no longer in that list — both are built, and
 * their measured values are in this record (`frameW`, `asideW`, `manageRow*`).
 */
export const LIBRARY_PX = {
  /**
   * `RUNTIME-REPAIR-04` §3.1 — THE FRAME AND ITS TWO COLUMNS, measured by opening the dialog.
   *
   * `.modal{width:min(1120px,calc(100vw - 56px))}` — the picker wears the OUTER family's BASE
   * width, not a width of its own, which is why `wide` (the `.audio-modal`'s 860) was never
   * going to reach it. 1120 at 1280, and the layout inside is `776px 342px`: a main column
   * that keeps `minmax(0,1fr)` here so the aside is the fixed half, as the drawing has it.
   *
   * ⚠ The reference's `@media(max-width:1180px)` restates this frame at `100vw`; that is a
   * DIFFERENT CONDITIONAL CONTEXT and not "the last wave", so it is not what 1280 paints.
   */
  frameW: 1120,
  frameInset: 56,
  /** The reference's SECOND dialog — `#import-dialog{width:min(750px,calc(100vw - 48px))}`. */
  importW: 750,
  importInset: 48,
  /**
   * `RUNTIME-REPAIR-05` — the VERDICT card in the aside, from the reference's `.notice`
   * pair: `padding:13px 15px`, `border-radius:8px`. It says "ready for this row" or it says
   * why not, in the same box, which is why one set of numbers covers both.
   */
  verdictPadY: 13,
  verdictPadX: 15,
  verdictRadius: 8,
  asideW: 342,
  asidePad: 22,
  /**
   * The tools row — `.template-tools{padding:20px 24px 14px}`. It used to inherit its top and
   * side insets from the modal body; with the layout going edge to edge (the aside's rule must
   * reach both bands) the column owns them.
   */
  toolsPadY: 20,
  toolsPadX: 24,
  /** `.template-filter{padding:0 24px 17px}` — the same side inset as the tools row above it. */
  filterPadX: 24,
  /**
   * `Manage` — `.btn.quiet.small`, 69.9 × 33, radius 7, `6px 10px`, 13 px. The reference puts
   * it at the end of the tools row, beside the search, and hides it while its own view is up.
   */
  manageBtnH: 33,
  manageBtnRadius: 7,
  manageBtnPadY: 6,
  manageBtnPadX: 10,
  manageBtnText: 13,
  /**
   * A `.manage-row` — 84 px, `padding:17px`, `gap:12px`, a rule under each. Its name is an
   * `h3` and its usage line a `p`; the thumbnail is the picker row's own 56 × 49 tile.
   */
  manageRowH: 84,
  manageRowPad: 17,
  manageRowGap: 12,
  /** The view's own notice — the reference wraps it `padding:20px 25px` above the first row. */
  managePadY: 20,
  managePadX: 25,
  /** The tools row — `.template-tools{padding:20px 24px 14px;gap:12px}`; the body is flush there, padded by the primitive here. */
  toolsPadBottom: 14,
  toolsGap: 12,
  /**
   * The search box — PAINTED 40 tall (authored `min-height:39px`, and 14 px at the reference's
   * 1.4 line-height over `9px … 9px` is 39.6, which Chromium paints as 40), `9px 11px 9px 35px`,
   * radius 7, 14 px; the glyph 16 px at 12. The console's own line-height (1.55) would paint 41, so
   * the box is declared as a HEIGHT with the reference's line-height, not left to the floor.
   */
  searchH: 40,
  searchPadY: 9,
  searchPadX: 11,
  searchPadStart: 35,
  searchRadius: 7,
  searchText: 14,
  searchIcon: 16,
  searchIconInset: 12,
  /** The kind filter — `.template-filter{padding:0 24px 17px;gap:6px}` with a rule under it; a chip 32 tall, 12 px, `6px 10px`, radius 6. */
  filterPadBottom: 17,
  chipH: 32,
  chipPadY: 6,
  chipPadX: 10,
  chipRadius: 6,
  chipText: 12,
  chipGap: 6,
  /** The list — `.template-list{padding:12px}`; a row `15px 13px`, gap 14, radius 9, `56px minmax(0,1fr) 24px`, 5 px between rows. */
  listPad: 12,
  rowPadY: 15,
  rowPadX: 13,
  rowGap: 14,
  rowRadius: 9,
  rowGapBelow: 5,
  /** The thumbnail — 56 × 49, radius 7, a 22 px glyph on the raised ground. */
  thumbW: 56,
  thumbH: 49,
  thumbRadius: 7,
  thumbIcon: 22,
  /** The name 15 px / 550; the meta line 12 px muted, gap 8; a badge in it 11 px / 500, `2px 6px`, radius 5. */
  nameText: 15,
  metaText: 12,
  metaGap: 8,
  badgeText: 11,
  badgePadY: 2,
  badgePadX: 6,
  badgeRadius: 5,
  /** The empty state — `.empty{padding:40px 20px}` centred, muted; its title 15 px. */
  emptyPadY: 40,
  emptyPadX: 20,
  emptyTitleText: 15,
  /** The footer sentence — `.foot-info` 13 px muted. */
  footText: 13,
  /** `02`'s drop zone — `32px 20px`, a dashed rule, radius 11; the glyph box 51, radius 13, a 22 px glyph; title 18 px / 600; sentence 13 px. */
  dropPadY: 32,
  dropPadX: 20,
  dropRadius: 11,
  dropIconBox: 51,
  dropIconRadius: 13,
  dropIcon: 22,
  dropTitleText: 18,
  dropText: 13,
} as const;
/**
 * `RUNTIME-REDESIGN-01` PHASE 8 — the audit log (`03-audit-log.html`) as RENDERED, same method
 * (`design.md` §15.3). `.audit-tools` is restated 12 times (7 under `@media`), `.audit-table`
 * 10, `.audit-surface` 5, `.audit-detail` 5.
 *
 * ⚠ NOT here, deliberately: the reference's `Time · UTC` column with a date under every row
 * (`B-210` reads the control-room clock and bands the date), its `View event` detail aside
 * (`B-211` put the names, the ids and the refused line ON the row), its `Date` filter, its
 * `Follow new events` (the panel has no live tail by design), and its `Sample records · UTC`
 * badge. And what the reference does NOT draw and this phase ADDS BACK: the ACTOR column, its
 * `B-143` caveat and the console-name picker beside it — guard item 27 (`design.md` §3).
 */
export const AUDIT_LOG_PX = {
  /** The frame — `.audit-modal{width:min(1250px,calc(100vw - 56px))}`; 1222 at 1280. */
  frameW: 1250,
  frameInset: 56,
  /** The tools row — `.audit-tools{padding:18px 25px;gap:12px}`; the search PAINTED 40 tall (`min-height:39px` authored — see `LIBRARY_PX.searchH`), `9px 11px 9px 35px`, radius 7, 14 px. */
  toolsGap: 12,
  searchH: 40,
  searchPadY: 9,
  searchPadX: 11,
  searchPadStart: 35,
  searchRadius: 7,
  searchText: 14,
  searchIcon: 16,
  searchIconInset: 12,
  /** A filter field — 132 wide; its label 12 px / 500, 5 px above a 39 px select (`9px 11px`, radius 7, 13 px, `line-height: normal` — declared as a height here, since the console's 1.55 would paint 42). */
  fieldW: 132,
  fieldLabelText: 12,
  fieldGap: 5,
  selectH: 39,
  selectPadY: 9,
  selectPadX: 11,
  selectRadius: 7,
  selectText: 13,
  /** The table — `th{padding:12px 16px;font-size:12px;font-weight:500}`, `td{padding:15px 16px}` at 13 px; the time column 125. */
  thPadY: 12,
  thPadX: 16,
  thText: 12,
  tdPadY: 15,
  tdPadX: 16,
  tdText: 13,
  colTime: 125,
  colActor: 130,
  colAction: 100,
  colOutcome: 200,
  /** The item cell — `strong` 13 px / 550 over `small` 12 px muted (3 px between); the ids line and the refused line take the small rank. */
  smallText: 12,
  lineGap: 3,
  /** The outcome badge — 12 px / 500, `4px 8px`, radius 5, gap 6; the reason under it 11 px muted. */
  badgeText: 12,
  badgePadY: 4,
  badgePadX: 8,
  badgeRadius: 5,
  badgeGap: 6,
  reasonText: 11,
  /** The footer — the count 12 px muted; `Reset filters` 13 px. */
  countText: 12,
  resetText: 13,
  /** The console strip (the app's own, kept small by owner answer A1) — the field 132 wide; the caveat 12 px. */
  consoleInputW: 132,
  caveatText: 12,
} as const;
/** The line weight an ACCENTED surface takes: the reference's `.badge.ready` edge. */
const ACCENT_LINE = '#31556a';

export const cssVars = {
  // Semantic colors
  '--r-surface': colors.panel,
  '--r-surface-raised': colors.panelMuted,
  '--r-surface-sunken': colors.background,
  '--r-border': colors.border,
  '--r-border-strong': '#4B5563',
  /**
   * THE QUIETER LINE — the reference's `--soft`, new in Phase 2.
   *
   * `--r-border` is the line around a SURFACE. This is the rule BETWEEN two rows of
   * one table, and the reference gives it its own value for the reason
   * `--r-table-rule` already argues at length: a full-strength line repeated down
   * twelve rows stops being a separator and becomes a grid.
   */
  '--r-border-soft': REF_SOFT,
  '--r-text': colors.text,
  /** The second rank of ink. New in Phase 2; see `colors.textSecondary`. */
  '--r-text-secondary': colors.textSecondary,
  '--r-text-muted': colors.textMuted,
  '--r-accent': ACCENT_SKY, // sky — interactive / secondary
  '--r-accent-strong': '#0EA5E9',
  /**
   * R-055 — the sky's HOVER weight, LIGHTER than `--r-accent`.
   *
   * A lit toggle must lift under the pointer rather than darken, or it reads as
   * having switched off. The violet `.is-on` family already worked that way; the
   * sky one had no lighter weight to lift to, which is why the maximised panel's
   * hover borrowed the violet and with it the PVW meaning. One more weight of the
   * same hue — NOT a state colour, and it must not become one.
   *
   * PHASE 2 — the reference declares this weight itself (`.btn.primary:hover`), so
   * the lift moved with the sky rather than being re-derived from it.
   */
  '--r-accent-lift': ACCENT_LIFT,
  /**
   * THE ACCENTED ACTION — the same sky, in the weights a FILLED control needs.
   *
   * Owner: «فقط از ایده تفاوت رنگ بین دکمه هاش استفاده کن. رنگ apply/update/add
   * item متفاوته.» Exactly three controls wear it — Apply position, Add item,
   * Update — and every other control in the Inspector stays neutral.
   *
   * SAME HUE FAMILY AS `--r-accent`, deliberately, so this is one more weight of
   * a colour the palette already speaks rather than a parallel palette beside it.
   * `--r-accent` is a TEXT sky and makes an unreadable background; these are the
   * dark fill, the line and the light ink that a filled control needs — the same
   * two-weight split `--r-danger`/`--r-danger-strong` and
   * `--r-rehearsing`/`--r-rehearsing-strong` already use.
   *
   * IT IS NOT A STATE COLOUR AND MUST NOT BECOME ONE. See `.cg-btn--accent` in
   * `controls.css` for why this may live in the Inspector and may not spread to
   * the layer table.
   */
  /**
   * PHASE 2 — this is the reference's `--bluebg`: the ground its blue sits on when
   * the blue fills something (`.badge.ready`). The HOVER weight below has no
   * reference value and therefore did not move; it is still the lighter of the two,
   * so a filled accent control still LIFTS under the pointer rather than darkening.
   */
  '--r-accent-fill': REF_BLUE_BG,
  '--r-accent-fill-hover': '#1A4A6B',
  '--r-accent-line': ACCENT_LINE,
  '--r-accent-line-hover': '#4AA8E0',
  '--r-accent-ink': '#CFE8F8',
  /**
   * THE INPUT SURFACE — one background and one line for every field in the app.
   *
   * Owner-specified. It is its own pair rather than `--r-surface-*` because an
   * input is not a panel: it reads as a well SUNK INTO the surface it sits on, and
   * `--r-surface-raised` made the fields sit slightly proud of the panel instead.
   *
   * ONE PAIR, ON `.cg-field`, so the text inputs, the textareas, the selects and
   * `NumericInput` cannot diverge — the owner's report was that the dx/dy boxes
   * rendered differently from the text inputs, and the durable answer is a single
   * surface rather than a second one tuned to look close. Two surfaces tuned to
   * match are two surfaces that drift at the next change.
   */
  '--r-field-bg': REF_INSET,
  '--r-field-line': '#435367',
  '--r-onair': colors.onAir, // sacred GREEN — ON AIR only (see the header)
  /**
   * AMBER AS INK — the caution role: Out / EXIT / UNCONFIRMED / dirty, a badge's word, an
   * outlined button's edge.
   *
   * HELD in Phase 2 while it was also a FILL (`colors.pending` carries the argument);
   * SPLIT in Phase 9. This token is now read only as `color:` / `border-color:`; the
   * two amber GROUNDS are `--r-caution-bg` (the reference's pair, under `--r-caution-text`)
   * and `--r-caution-fill` (the CLEAR verb's saturated fill, directly below).
   */
  '--r-caution': '#F59E0B', // amber — Out / EXIT / UNCONFIRMED / dirty
  /**
   * AMBER AS A SATURATED FILL — the CLEAR verb (`.cg-btn--caution-strong`), the one place
   * the caution hue is still a ground with dark ink on top. The same value as the ink
   * today and a different NAME, so the verb's fill and the badge's word can be retuned
   * apart — the split Phase 2 held and Phase 9 made (`design.md` §16).
   */
  '--r-caution-fill': '#F59E0B',
  '--r-danger': '#DC2626', // Remove — a FILL; the reference draws none, so it is held
  '--r-danger-strong': '#B91C1C',
  /**
   * ACK / HEALTHY — the reference's mint, which is exactly what it spends the colour
   * on (`.bottom-bar .healthy`, `.badge.success`, the toast tick).
   *
   * ⚠ `apps/runtime/index.html` MIRRORS this value as `--cg-ok` for the boot splash's
   * PLAY triangles, because the splash paints before the bundle and cannot read a
   * token. `splashCss.test.ts` asserts the two agree, so this value and that literal
   * move together or the suite goes red — which is the point of the mirror.
   * 🔴 It is NOT `--r-onair`, and the reference's own use of one green for both is
   * the disagreement recorded at `colors.onAir`.
   */
  '--r-success': REF_MINT,
  '--r-dirty': '#F59E0B',
  /**
   * READY — the state a row is in when it is loaded and selected and not playing.
   *
   * 🔴 **IDENTICAL IN VALUE TO `--r-accent` (`#74cdf6`) AND OPPOSITE IN RULE, which is
   * exactly why the choice has to be made deliberately rather than by whichever name comes
   * to hand.** `--r-accent` is the INTERACTIVE sky and its own comment says it _"IS NOT A
   * STATE COLOUR AND MUST NOT BECOME ONE"_. This one IS the state colour. Anything saying
   * "this row is ready / selected, not playing" takes THIS token; anything saying "this is
   * interactive" takes the accent. Picking the wrong one compiles, looks identical today,
   * and silently drifts the day either is retuned — the failure has no moment at which it
   * announces itself, so the only defence is naming the rule where both are declared.
   * (Session BP, on the Inspector's LOOK INPUTS badge.)
   */
  '--r-ready': colors.ready,
  '--r-idle': colors.idle,
  '--r-offline': colors.offline,
  /**
   * R-022 — the REHEARSE hue, in the two weights a hue needs on this surface.
   *
   * `--r-rehearsing` is the state colour itself, as worn by the row's REHEARSING
   * mark. `--r-rehearsing-strong` is the darker weight a FILL needs so light text
   * on it stays legible — the same two-weight split `--r-accent`/`--r-accent-strong`
   * and `--r-danger`/`--r-danger-strong` already use, and for the same reason: the
   * light state hue is a text colour and makes an unreadable background.
   *
   * The ONLY control allowed to wear this is the REHEARSE toggle while rehearse is
   * ENGAGED. That is not a hole in the "row verbs are neutral" rule, it is the
   * other side of it: neutral bans colour used to advertise AVAILABILITY (which is
   * what drowned the state signal across thirty rows), and this says a MODE IS ON
   * — the same thing the row's own state mark says, in the same colour, so the two
   * cannot disagree about which row is rehearsing.
   *
   * 🔴 **SESSION BP — THE RULE IS ABOUT CONTROLS, AND IT IS WIDENED HERE DELIBERATELY
   * RATHER THAN QUIETLY OVERRIDDEN.** Owner's decision, 2026-08-21: the Inspector's LOOK
   * INPUTS badge reads `SHOWING IN PVW` while the row is rehearsing, and wears this hue.
   *
   * Read the justification above and it already licenses that: the ban is on colour that
   * advertises AVAILABILITY, and what this hue is FOR is saying a mode is on, _"the same
   * thing the row's own state mark says, in the same colour, so the two cannot disagree"_.
   * A badge naming the rehearse mode is a STATE INDICATOR in exactly that category — the
   * row's REHEARSING mark already wears it — not a control offering an action.
   *
   * **So: STATE INDICATORS that name the rehearse mode may wear this. CONTROLS still may
   * not, with the REHEARSE toggle-while-engaged the one exception, for the reason above.**
   * The distinction that matters is indicator-vs-control, never which component it is in.
   */
  '--r-rehearsing': colors.rehearsing,
  /** The reference's `--purplebg`: the ground its PVW violet sits on. New in Phase 2. */
  '--r-rehearsing-bg': REF_PURPLE_BG,
  '--r-rehearsing-strong': '#7C3AED',
  /**
   * R-055 — the REHEARSING toggle's HOVER and PRESS weights.
   *
   * They lived as three bare literals inside `controls.css`'s `.is-on` rules, and
   * that is precisely how the defect hid: the hover's border was spelled as the very
   * value `--r-rehearsing` held, and nothing on the page said so. A sky-based toggle that
   * inherited those rules wore the PVW hue while claiming to be about the chrome.
   * Named here so the next reader can see whose colour they are.
   */
  '--r-rehearsing-mid': '#8B5CF6',
  '--r-rehearsing-deep': '#6D28D9',
  /**
   * PER-VERB HOVER FILLS (owner-specified) — used on HOVER AND NOWHERE ELSE.
   *
   * The row verbs rest neutral and that decision is unchanged: colour was taken
   * off them because thirty coloured affordances drowned the state signal, which
   * is a statement about what the operator sees while SCANNING the table. A hover
   * fill is on at most one button at a time, under the pointer the operator is
   * already looking at, and it disambiguates a column of icon-only glyphs at the
   * moment of the click — which is the moment this product can least afford a
   * mis-click, since its STOP and CLEAR mean the opposite of the reference
   * product's.
   *
   * Deliberately DARK, so the shared `--r-text` stays legible on every one of
   * them. Do not reuse these anywhere a control RESTS ON THE LAYER TABLE: that
   * would be the neutral rule reopened, one surface at a time.
   *
   * ONE CARVE-OUT, and it is narrow by construction: `--r-verb-play` is also the
   * Inspector's UPDATE at rest (`.cg-btn--commit`, owner's call). That does NOT
   * reopen the rule, because the rule is about what an operator sees while
   * SCANNING THIRTY ROWS — it exists so a table of coloured affordances cannot
   * drown the one row that is live. The Inspector shows ONE item and has no such
   * competition. The table's verbs are unchanged and still rest neutral.
   *
   * It is `--r-verb-play` rather than `--r-onair` on purpose: UPDATE reads as the
   * play-family action it is without wearing the hue that means a graphic is
   * actually on the output. `--r-onair` remains PLAY's alone.
   */
  '--r-verb-load': '#1AACD8',
  '--r-verb-remove': '#FF0000',
  '--r-verb-play': '#22DD7A',
  '--r-verb-next': '#2EBEA1',
  '--r-verb-stop': '#B38D18',
  '--r-verb-clear': '#DE5105',
  /**
   * R-035 — THE STARTUP SPLASH's own greys, and the one thing to know about them:
   * the splash CANNOT READ THESE TOKENS.
   *
   * It paints before the bundle — that is its entire reason to exist — so
   * `controls.css` has not arrived yet and `var(--r-splash-bg)` would resolve to
   * nothing on the frame that matters. The inline `<style>` in `index.html` therefore
   * mirrors these VALUES as literals, each with a comment naming the token it mirrors,
   * and `tests/splashCss.test.ts` asserts every colour literal in that document is the
   * value of one of these (and that none of them is red).
   *
   * They live here anyway, rather than only in the HTML, for the reason every other
   * token does: this file is the single source of truth, so the mirror has something to
   * be checked AGAINST. A literal with no token behind it is a colour nobody can find
   * when the palette moves.
   *
   * ⚠ PHASE 2 HELD THIS WHOLE FAMILY, AND THAT IS THE RULE THIS BLOCK ALREADY STATES
   * RATHER THAN AN EXEMPTION FROM IT: these values are tuned for large tracked-out type
   * on a lifted ground and are deliberately NOT tied to the chrome, _"[t]ying them to
   * the chrome tokens would mean a chrome tweak silently repainting the product's first
   * frame."_ Phase 2 IS that chrome tweak. The one relationship that mattered survived
   * it intact — the splash ground is still LIGHTER than the console's, and by more than
   * before. The single splash value that did move is `--cg-ok` in `index.html`, and it
   * moved because it is a MIRROR of `--r-success` and not a splash value at all.
   *
   * WHY THEIR OWN FAMILY rather than reuse of `--r-surface-*`: the splash ground is a
   * PANEL LIFTED ABOVE the console — lighter than `--r-surface-sunken` (#0b1017) rather
   * than the near-black it started as — so the dismissal reads as a curtain rising off
   * the app instead of one dark screen becoming another. Its inks are tuned for large
   * tracked-out type on that ground, not for panel text. Tying them to the chrome tokens
   * would mean a chrome tweak silently repainting the product's first frame.
   *
   * THE WHOLE FAMILY MOVES TOGETHER OR NOT AT ALL. Lifting the ground alone would have
   * sunk the lines and the rail track into it — `#1C232E` is within two points of the
   * ground, so the progress rail would simply have had no visible track. Every value
   * below the inks was lifted with it, in one step, for that reason.
   *
   * NO RED IN THIS FAMILY, EVER. Red is the sacred air-state colour and decorative red
   * is forbidden across this UI (see the header) — a boot screen is the LAST place it
   * may appear, because it would teach the operator's eye "red" before they have seen a
   * single real state.
   *
   * THE ACCENT IS NOT IN THIS FAMILY, and no longer borrows `--r-accent` either. The
   * splash is the BRAND screen, so its chrome is APASAI's own blue `#00AEEF` — an exact
   * company value that is not ours to alter — declared as a splash-local constant in the
   * inline CSS beside the scene's violet and amber, NOT as a `--r-*` token, because
   * nothing in the console UI may ever wear them. The app's own sky `--r-accent` is
   * deliberately UNCHANGED by that decision. `--r-splash-glow` is the one exception and
   * only because it must be an `rgba()` a `box-shadow` can take.
   */
  '--r-splash-bg': '#1A212D',
  /** Strong border — the corner brackets, the rule, the scene's row and monitor strokes. */
  '--r-splash-line': '#3D4959',
  '--r-splash-ink': '#E8EDF4',
  '--r-splash-ink-dim': '#5A6675',
  '--r-splash-ink-faint': '#55637A',
  '--r-splash-readout': '#8B97A6',
  /** Subtle border — the rail's TRACK, the scene's wires and the monitor's safe ticks. */
  '--r-splash-rail': '#2C3644',
  /** The dim filler bars inside the playout scene's stack rows. */
  '--r-splash-scene-bar': '#3A4557',
  /** The APASAI wordmark beside the mark — brighter than a tagline, dimmer than `ink`. */
  '--r-splash-company-ink': '#C9D3DF',
  /**
   * The APASAI mark, RELIT FOR A DARK GROUND at the owner's explicit direction: the
   * source artwork's bars are near-black and its swoosh mid-grey, which disappear on
   * `--r-splash-bg`. The arc is NOT here — it keeps the exact brand blue, untouched.
   */
  '--r-splash-logo-bars': '#EEF3F9',
  '--r-splash-logo-swoosh': '#5C6A7C',
  /** The rail's halo — the brand blue at half alpha, in the form `box-shadow` takes. */
  '--r-splash-glow': 'rgba(0, 174, 239, 0.5)',
  /**
   * Softer than it was, and for the same reason the ground was lifted: a heavy vignette on
   * a lighter panel darkens the corners until the thing stops reading as ONE rectangle.
   */
  '--r-splash-vignette': 'rgba(0, 0, 0, 0.22)',
  /*
   * ── STATION-CHROME-01 §1 — THE ROLES THAT USED TO BE LITERALS ────────────────
   *
   * Everything below was, until this change, a bare hex or `rgba()` spelled inside
   * `controls.css` rules and inside component `style={{…}}` objects: 120 of them
   * across 23 files. A value with no home has no reviewer, which is how `57ca77d3`
   * shipped a wash nobody chose.
   *
   * They are named by ROLE — what the colour is FOR — never by value. `--r-btn-add-*`
   * answers "what colour are the Add buttons?"; `--r-blue-500` never could.
   *
   * NOT ONE VALUE CHANGED when they moved here. Where two roles share a value today
   * they each keep their own NAME and point at the same base constant below, so a
   * future retune of one cannot drag the other along silently.
   */

  // The inks a FILLED control needs, each tinted to the fill it sits on.
  '--r-ink-on-fill': INK_LIGHT,
  '--r-ink-on-accent': '#04121F',
  '--r-ink-on-caution': '#1C1207',
  '--r-ink-on-verb': INK_DEEP,
  /**
   * The dark ink on the hazard BAND — the connection banner's TEST MODE stripes. (Until
   * Phase 9 the bridge-skew banner read it too; that band now takes the caution PAIR.)
   */
  '--r-ink-on-band': '#0B0B0C',
  /**
   * DANGER as TEXT on a dark ground — the outlined Remove, the error badge.
   *
   * PHASE 2 — the reference's `--red`, which it spends on exactly this
   * (`.btn.danger`, `.badge.failed`, `.notice.error`). It is NOT `colors.errorText`:
   * that one is the owner's exact saturated red for a row's ERROR mark and a hard
   * link failure, and the reference collapses the two where this palette keeps them
   * apart. 9.53:1 on `--r-surface`.
   */
  '--r-danger-text': REF_RED,
  /** The reference's `--redbg`: the ground its red sits on. New in Phase 2. */
  '--r-danger-bg': REF_RED_BG,
  /*
   * ── PHASE 2A — THE ERROR PAIR, AS TOKENS ────────────────────────────────────
   *
   * The two halves of what used to be one `errorText`, declared here so a
   * stylesheet can reach them too. The argument for the split, and the rule for
   * deciding which a site takes, is at `colors.errorMark` above — it is not
   * repeated here, because a rule with two homes is a rule that drifts.
   *
   * 🔴 A MARK IS NOT A WORD. `--r-error-mark` is measured against 3.0 and
   * `--r-error-text` against 4.5. Pointing a sentence at the mark is how the
   * defect Phase 2A closed comes back.
   */
  '--r-error-mark': colors.errorMark,
  '--r-error-text': colors.errorText,
  /**
   * CAUTION as TEXT on a dark ground — a notice's ink, the audit log's timeout.
   *
   * PHASE 2 — the reference's `--amber`, the half of the caution role that is
   * unambiguously an INK (`.notice.warn`, `.badge.warn`, `.badge.blocked`). The FILL
   * half stayed put; `--r-caution` says why.
   */
  '--r-caution-text': CAUTION_TEXT,
  /** The reference's `--amberbg`: the ground its amber sits on. New in Phase 2. */
  '--r-caution-bg': REF_AMBER_BG,
  '--r-caution-hover': '#D97706',
  /** OK as TEXT on a dark ground — the audit log's succeeded outcome. */
  '--r-ok-text': REF_MINT,
  /** The reference's `--mintbg`: the ground its mint sits on. New in Phase 2. */
  '--r-ok-bg': REF_MINT_BG,
  /**
   * `RUNTIME-REDESIGN-01` Phase 8 — the reference's `.badge.success` edge (`border-color:
   * #355d4d`), the line a mint tag draws on its mint ground. The amber tag takes
   * `--r-notice-line` and the red one `--r-danger`, which already existed; only the mint edge
   * had no home. Read by `.cg-tag--ok`.
   */
  '--r-ok-line': '#355d4d',
  /**
   * `RUNTIME-REPAIR-05` — the CAUTION edge, the amber twin of `--r-ok-line` above and the
   * second reference edge that had no home. Measured on the reference's `.notice.warn` in
   * Chromium at 1280 × 800: `rgb(101, 83, 52)` around its `--amberbg` ground under its
   * `--amber` ink — the pair this app already carries as `--r-caution-bg` / `--r-caution-text`.
   *
   * ADOPTED under the narrow stale-hex test: absent from the drawing's nineteen declared
   * `:root` colours, and not a hex this app retired in Phase 2, so it fails (b).
   *
   * ⚠ It is a boundary on a card that already carries an ICON and a headline, so it is not
   * the only signal for anything — which is why it is allowed to sit under the 3.0 graphic
   * floor, as the reference's own does.
   */
  '--r-caution-line': '#655334',

  /*
   * THE ADD BUTTONS — the owner's own acceptance test for this section:
   * «if later we want to change the colour of the Add buttons, we change one
   * colour, in one obvious place.» That place is `--r-btn-add`, and it is the ONE
   * declaration that moves every Add button in the app.
   *
   * It is deliberately NOT `--r-accent`. Before this change an Add button was a
   * plain `secondary`, so "the Add colour" and "every secondary control's colour"
   * were the same declaration and the owner's edit was impossible to express. The
   * value is `--r-accent`'s TODAY — no pixel moved — but the NAME is now separate,
   * which is the entire point.
   */
  '--r-btn-add': ACCENT_SKY,
  '--r-btn-add-bg': colors.panelMuted,

  /*
   * Control chrome — the hover weights a neutral control lifts to.
   * PHASE 2 — the reference declares this pair itself, as `.btn:hover`.
   */
  '--r-control-hover-bg': '#304258',
  '--r-control-hover-line': '#5e748b',
  /** A ticked checkbox under the pointer — the sky's own lift, see `--r-accent-lift`. */
  '--r-toggle-on-hover': ACCENT_LIFT,

  /*
   * The layer table's grounds.
   *
   * ⚠ HELD IN PHASE 2 BY DESIGN, NOT BY OVERSIGHT. `PROMPT.md` §3 names the table's
   * own values — `16px 17px` cells, hover `#1b2a3a`, selected `#192e40` with an
   * `inset 3px 0 0` blue — so the table's grounds are adopted in PHASE 3, as one
   * piece, against a measured reference-vs-app property table. Moving three of them
   * here would leave the other three to be argued twice.
   * They already sit within a couple of points of the reference's `--raised` and
   * `--inset`, so nothing looks stranded in the meantime.
   */
  '--r-row-bg': 'rgb(30 38 51)',
  /**
   * 🔴 `REPAIR-03` A2 — THE LAYER ROW'S HOVER. **A defect in both trees, fixed with a value
   * from neither.**
   *
   * The row hover read `--r-surface-raised` `#1b2532`, which is **1.02:1 against the row** and
   * DARKER than it — on a table whose whole interaction is "click a row to select it", that is
   * an invisible affordance. The reference is no better: its `#1F2937` measures **1.04:1**. So
   * this is not a delta to adopt in either direction; it is a usability failure the drawing
   * shares, and copying it would have been copying the bug.
   *
   * **`#283443` — 1.20:1 against `--r-row-bg`**, and LIGHTER, because a row that darkens under
   * the pointer reads as pressed and, worse, as an EMPTY row (an unloaded row is darker here).
   *
   * ── THE CEILING IS AA, AND IT IS WHY THIS IS NOT LIGHTER ─────────────────────────────
   *
   * The binding constraint is the muted ink the row actually carries — `--r-text-muted`
   * `#8e9eaf` on the row NUMBER (13.6 px / 700) and the `REMOVE` label (12.8 px / 600), neither
   * of which is WCAG "large text". It measures **4.61:1** on this fill; one step lighter
   * (`#2a3646`) drops it to 4.47 and breaks AA. So 1.20 is the most contrast this hover can
   * have while the row's own text stays legible, and the value is the ceiling rather than a
   * preference.
   *
   * ⚠ **REPORTED, NOT RE-TUNED: hover vs the SELECTED fill is 1.04:1, and it cannot be widened
   * from here.** The selection wash (`--r-row-selected-fill` over the row) sits at 1.25:1, i.e.
   * almost exactly where the AA ceiling puts the hover. Separating them by FILL would mean
   * either dropping `--r-text-muted` below AA on a hovered row or moving the selection wash —
   * both the owner's calls. What distinguishes them today is the selection's **2 px accent
   * frame at 8.55:1**, which is the property `layerRowHover.spec.ts` asserts.
   *
   * Every ink re-measured on this fill: `--r-text` 11.32:1, `--r-text-secondary` 6.47:1,
   * `--r-text-muted` 4.61:1.
   */
  '--r-row-hover-bg': '#283443',
  '--r-row-empty-bg': '#10141E',
  '--r-row-selected-fill': SELECTED_WASH,
  /**
   * 🔴 THE OWNER'S MARKED-ROW FILL. `rgb(145 93 5)`, tuned by hand, and it moved
   * here BYTE FOR BYTE — `emptiedAirRowContrast.dom.test.ts` still measures
   * `colors.markedRowInk` at 5.06:1 and the edge bars at 3.68:1 (3.86:1 before Phase 2
   * moved the ink they follow) against this exact value, resolved through the token.
   * A "tidier" nearby amber is a regression.
   */
  '--r-row-marked-fill': 'rgb(145 93 5)',
  /**
   * The marked row's two edge bars — `EmptiedAirNotice`'s strip INK, so a marked row
   * is visibly the same object as the box holding PUT BACK ON AIR (owner).
   *
   * It has its OWN NAME, and the name is not decoration: it is the decision point at
   * which "does this follow the caution ink?" gets answered deliberately and the
   * ratio re-measured, rather than dragged along by an edit somewhere else.
   *
   * 🔴 **PHASE 2 ANSWERED IT: IT FOLLOWS, AND THE MEASURED RATIO MOVED — 3.86:1 →
   * 3.68:1 on the owner's fill.** Both notes that govern this pair were read first
   * and they point the same way: `controls.css`'s rule says in as many words _"if the
   * strip's ink ever changes, this changes with it"_, because the bars exist to carry
   * the strip's identity down onto the rows. Pinning the value would have preserved a
   * NUMBER by silently discarding the DESIGN the number was serving. It still clears
   * the 3:1 graphic floor, so the bars still read as bars.
   * ⚠ **Reported, not re-tuned** (`PROMPT.md` §2.3). Restoring 3.86:1 would mean
   * choosing a new amber, and that is the owner's to choose.
   */
  '--r-row-marked-edge': CAUTION_TEXT,
  /**
   * A RECORD TABLE's sticky column header — the audit log's, today.
   *
   * ⚠ **IT IS NO LONGER THE LAYER TABLE'S.** `AUDIT-CLOSE-01` C2 split the two: the layer
   * table takes the reference's own rendered pair (`--r-layer-head-bg` / `--r-layer-head-ink`),
   * and this role keeps `--soft` for the record tables, whose reference draws a DIFFERENT
   * ground again (`03-audit-log.html`'s `th` sits on `#1d2b3b`). One name for two grounds the
   * drawing does not agree on was the thing that made the layer table's ground look settled.
   * Re-pointing the audit head is a later item; it is unchanged here, still reading
   * `--r-text-muted` at 4.89:1.
   *
   * 🔴 **PHASE 3 — OWNER ANSWER A6** is why this value is `--soft` and not the owner's older
   * `rgb(45 55 69)`: on that ground the Phase-2 muted ink fell to **4.39:1**, below the 4.5 AA
   * text floor, and A6's remedy was the ground rather than a re-tuned ink. That reasoning is
   * intact for THIS role. What C2 found is that it was never the whole answer for the LAYER
   * table, because the reference clears AA there with a pair — see `REF_LAYER_HEAD_INK`.
   */
  '--r-table-head-bg': REF_SOFT,
  /**
   * 🔴 `AUDIT-CLOSE-01` C2 — THE LAYER TABLE'S OWN HEADER PAIR AND ROW RULE, AS RENDERED.
   *
   * The three values are read off `04-playout-layers.html` in Chromium; the constants carry
   * the measurements and the argument. Taken together they are what restores the LID, and both
   * halves are measured rather than asserted: the header is **1.26:1** over a loaded row (it
   * was 1.13:1 on `--soft`) and the rule between rows is **1.48:1** against it (it was 1.31:1
   * as `--r-border`) — a separator again rather than a shade of the row.
   *
   * Every ink the header puts on this ground was re-measured with it, because a ground change
   * moves all of them at once: labels and the stale tally **4.74:1**, the on-air tally
   * **9.00:1**, the refused NUMBER **6.63:1** (text floor 4.5), the refused MARK **3.12:1**
   * (graphic floor 3.0, Phase 2A's split). The 6.63 and the 3.12 are the same two numbers
   * §8.2 recorded in its `head` column — that table was measured on THIS ground, before
   * Phase 3 moved it, which is the independent confirmation that the move is a return.
   * `--r-text-muted` on this ground would be 4.39:1, and that is exactly why the ink came
   * with the ground.
   *
   * ⚠ The header's rule and the row's rule are ONE value in the reference — `th` and `td` both
   * paint `1px solid rgb(55, 65, 81)` — so they are one token here. Splitting them would be a
   * second spelling of a number the drawing states once.
   */
  '--r-layer-head-bg': REF_LAYER_HEAD_BG,
  '--r-layer-head-ink': REF_LAYER_HEAD_INK,
  '--r-row-rule': REF_LAYER_RULE,

  /*
   * ── `STATION-CHROME-02` §3 — THE SETTINGS DIALOG'S OWN VOCABULARY ────────────
   *
   * The rail, the record tables and the cards. Each is named for what it is FOR, and
   * where a value is one another role already has, the two point at a shared base
   * constant rather than at each other — so retuning the rail cannot silently move the
   * layer table.
   *
   * ⚠ THE MOCKUP'S HEXES ARE DELIBERATELY NOT TRANSPLANTED. `docs/design/station-setup-
   * mockup.html` is drawn on its own palette (`#0a0e16` / `#3b7fe0` / `#d9534f`); this app's
   * palette is `@cg/ui`'s and is TOKENS-ONLY by the design-system rule. Adopting the
   * mockup's values would repaint the whole console from a reference drawn of one dialog.
   * What is taken from the mockup is the ROLE and the GEOMETRY; the hue stays ours.
   */
  /** A rail item under the pointer — one notch raised off the rail's sunken ground. */
  '--r-rail-hover-fill': colors.panelMuted,
  /** The SELECTED rail item's wash. Its own name; the layer row's selection is not it. */
  '--r-rail-selected-fill': SELECTED_WASH,
  /** …and the subtle line around that wash, so the selection has an edge as well as a fill. */
  '--r-rail-selected-line': ACCENT_LINE,
  /**
   * A RECORD TABLE's hairline — under the column headers and between the rows.
   *
   * QUIETER than `--r-border`, deliberately: a full-strength line repeated down twelve
   * rows stops being a separator and becomes a grid.
   *
   * PHASE 2 — it is now the reference's `--soft`, which is that colour and is drawn
   * for exactly this job (`.layer-table td { border-bottom: 1px solid var(--soft) }`).
   * It was an alpha blend of the OLD `--r-border`, so leaving it would have left an
   * alpha of a value that no longer exists. Same name, same role, same argument.
   */
  '--r-table-rule': REF_SOFT,
  /** A record row under the pointer. Raised off the card's sunken ground, not accented. */
  '--r-table-row-hover': colors.panel,
  /**
   * DANGER as a WASH — the fill a quiet destructive control takes ON HOVER ONLY.
   *
   * `--r-danger` at low alpha. It exists so a bin can be neutral at rest and unmistakably
   * red at the moment of intent, without a solid red fill: a row of solid red boxes reads
   * as a row of alarms, which is the whole complaint `STATION-CHROME-02` §3 opens with.
   */
  '--r-danger-soft': 'rgba(220, 38, 38, 0.16)',

  /*
   * Washes, scrims and shadows — the sky at low alpha, and black at several.
   * PHASE 2 — these are DERIVED from `--r-accent`, so the derivation was re-applied
   * when the sky moved (`rgba(56, 189, 248, …)` → `rgba(116, 205, 246, …)`). Leaving
   * them would have split the interactive hue in two: a focus ring in the old sky
   * around a control painted in the new one.
   */
  '--r-focus-halo': 'rgba(116, 205, 246, 0.35)',
  '--r-menu-hover-fill': 'rgba(116, 205, 246, 0.16)',
  '--r-divider-drag-fill': 'rgba(116, 205, 246, 0.22)',
  '--r-scrim': 'rgba(0, 0, 0, 0.45)',
  /**
   * 🔴 `SETTINGS-POLISH-04` §7 — **THE SCRIM IS A COLOUR *AND* A BLUR, AND THE BLUR IS NOT
   * DECORATION.**
   *
   * The reference's `dialog::backdrop{background:rgba(4,7,11,.76);backdrop-filter:blur(5px)}`.
   * Two changes from the `rgba(0,0,0,0.6)` this was: it is DARKER (0.76), and it is not pure
   * black — a blue-black that belongs to this palette rather than a hole punched in it.
   *
   * ⚠ **The blur is half the effect.** At 0.76 with no blur the scrim reads as FLAT BLACK: the
   * console behind it stops being a dimmed console and becomes an absence, which is worse than
   * the light scrim it replaces. The blur is what keeps the shapes behind legible as shapes.
   * So the two tokens travel together and neither is adopted alone.
   *
   * ⚠ These are read INLINE by `Modal`'s `styles.scrim` — it sets `background` inline, so a
   * `[data-modal-layer]` rule in `controls.css` would lose to it silently (the trap this file
   * already records twice). The blur is spelled inline beside the ground for that reason.
   */
  '--r-modal-scrim': 'rgba(4, 7, 11, 0.76)',
  '--r-modal-scrim-blur': 'blur(5px)',
  /**
   * `STATION-CHROME-01` §6 — the scrim a SECOND dialog lays over the first.
   *
   * LIGHTER than the base scrim, and that is the whole reason it is its own role: the
   * operator has to keep seeing the dialog he came from, or a small Add form reads as
   * having replaced his settings rather than as sitting on top of them. Stacking the base
   * scrim twice would double its opacity and black the parent out.
   *
   * `SETTINGS-POLISH-04` §7 — the reference's `.sub-dialog::backdrop{background:#0306099e;
   * backdrop-filter:blur(3px)}`. `#9e` is 0.62, so it stays LIGHTER than the base scrim's 0.76
   * exactly as the role requires, and its blur is SHALLOWER (3 px against 5) for the same
   * reason: the dialog underneath has to stay readable, not merely present.
   */
  '--r-modal-scrim-sub': 'rgba(3, 6, 9, 0.62)',
  '--r-modal-scrim-sub-blur': 'blur(3px)',
  /*
   * ── `STATION-CHROME-02` §2 — A DIALOG'S FRAME IS A SIZE, AND SIZES LIVE HERE TOO ──
   *
   * These were a `WIDTHS` map inside `Modal.tsx`, which is the same defect §1 moved 120
   * colours out of `controls.css` for: a value with no home has no reviewer. They are
   * named for the FRAME they describe, never for the number.
   *
   * `--r-modal-w-fixed` / `--r-modal-h-fixed` were the abandoned mockup's own
   * `min(1000px, 100%)` / `min(680px, calc(100vh - 48px))`; `RUNTIME-REDESIGN-01` Phase 7
   * re-pointed them at the APPROVED reference as rendered — `.settings{width:min(1140px,calc(100vw
   * - 64px));height:min(810px,calc(100dvh - 64px))}`, measured 1140 × 736 at 1280 × 800
   * (`STATION_SETUP_PX`). The HEIGHT is the part that matters and the part no other dialog has:
   * it is what stops the frame moving when the operator switches tab (see `Modal`'s `size`
   * prop). The two-edge measurement (`station-setup-frame.spec.ts`) is about the frame being
   * ONE box on every tab, and it holds at either size.
   */
  /*
   * ── 🔴 `REPAIR-03` B — THE MODAL WIDTH TABLE, WHICH IS THE REFERENCE'S OWN ──────────────
   *
   * Measured in Chromium at 1280 × 800 by OPENING each `<dialog>`, never read off the
   * stylesheet: `.modal`'s width is restated twice and the second restatement
   * (`width:100vw`) is inside a narrow `@media`, so the file's "last rule" is NOT what paints
   * at this viewport. Every number below is what the browser reported.
   *
   *   `.modal.small`   min(500px, 100vw − 32)   → the confirm dialog        → `prose`
   *   `.audio-modal`   860px                    → the live-plate audio      → `wide`
   *   `.audit-modal`   min(1250px, 100vw − 56)  → the audit log             → `ledger`  (already)
   *   `.settings`      min(1140px, 100vw − 64)  → Station setup             → `fixed`   (already)
   *   `.modal` base    min(1120px, 100vw − 56)  → the template picker       → audit row 97, NOT this session
   *   `.import-modal`  750px                    → the import wizard         → audit row 107, not built
   *
   * ⚠ `wide` WAS also worn by the picker. `RUNTIME-REPAIR-04` gave the picker its own
   * `--r-modal-w-library` (audit row 97), so `wide` is now the `.audio-modal`'s 860 and nothing
   * else: the live plate audio dialog, which is where the number comes from, and the
   * live-source swap dialog, which has no reference equivalent at all.
   */
  '--r-modal-w-prose': 'min(500px, calc(100vw - 32px))',
  '--r-modal-w-wide': 'min(860px, 94vw)',
  /**
   * `RUNTIME-REDESIGN-01` Phase 8 — the LEDGER frame: a dialog that IS a table read across
   * many columns, the audit log. The reference's `.audit-modal{width:min(1250px,calc(100vw -
   * 56px))}`, 1222 at 1280 (`AUDIT_LOG_PX`). A width, not a frame: its height stays intrinsic
   * and its table scrolls, so `fixed`'s criterion (content SWITCHED, not scrolled) does not
   * apply. See `Modal`'s `size` prop.
   */
  '--r-modal-w-ledger': `min(${String(AUDIT_LOG_PX.frameW)}px, calc(100vw - ${String(AUDIT_LOG_PX.frameInset)}px))`,
  /**
   * `RUNTIME-REPAIR-04` §3.1 — the LIBRARY frame: the picker, which is the one dialog that
   * reads a list DOWN and a description ACROSS. The reference's base `.modal` width
   * (`min(1120px, calc(100vw - 56px))`, `LIBRARY_PX`), measured by opening `#template-dialog`
   * at 1280 × 800 rather than read off the sheet — `.modal` is restated inside a narrow
   * `@media` that does not paint here.
   *
   * A fifth size rather than a wider `wide`: `wide` IS the `.audio-modal`'s 860 and is worn by
   * the live plate audio dialog and the live-source swap, neither of which wants 1120.
   */
  '--r-modal-w-library': `min(${String(LIBRARY_PX.frameW)}px, calc(100vw - ${String(LIBRARY_PX.frameInset)}px))`,
  /**
   * `RUNTIME-REPAIR-05` — the IMPORT frame. The reference's `#import-dialog`
   * (`min(750px, 100vw - 48px)`, `LIBRARY_PX.importW`), measured by opening it at
   * 1280 × 800 rather than read off the sheet. A dialog that registers one package
   * and loads nothing: it needs a drop target, not a list.
   */
  '--r-modal-w-import': `min(${String(LIBRARY_PX.importW)}px, calc(100vw - ${String(LIBRARY_PX.importInset)}px))`,
  '--r-modal-w-fixed': `min(${String(STATION_SETUP_PX.frameW)}px, calc(100vw - ${String(STATION_SETUP_PX.frameInset)}px))`,
  '--r-modal-h-fixed': `min(${String(STATION_SETUP_PX.frameH)}px, calc(100vh - ${String(STATION_SETUP_PX.frameInset)}px))`,
  /**
   * The fixed frame's HEAD and FOOT paddings — Phase 7, from the reference as rendered
   * (`.settings-head{min-height:90px;padding:21px 28px}`, `.panel-foot{padding:15px 32px}`).
   * Frame chrome, so they live beside the frame and not in the `--r-setup-*` block: a second
   * fixed dialog would take them unchanged.
   */
  '--r-modal-head-min-h-fixed': `${String(STATION_SETUP_PX.headMinH)}px`,
  '--r-modal-head-pad-fixed': `${String(STATION_SETUP_PX.headPadY)}px ${String(STATION_SETUP_PX.headPadX)}px`,
  '--r-modal-head-gap-fixed': `${String(STATION_SETUP_PX.headGap)}px`,
  '--r-modal-foot-pad-fixed': `${String(STATION_SETUP_PX.footPadY)}px ${String(STATION_SETUP_PX.footPadX)}px`,
  '--r-modal-foot-gap-fixed': `${String(STATION_SETUP_PX.footGap)}px`,
  /**
   * 🔴 THE FIXED FRAME'S MESSAGE REGION — DRAWN IN THE PANE'S COLUMN, NOT THE FRAME'S.
   *
   * The `fixed` frame is the one dialog whose BODY is two columns: a rail of section names and
   * the pane of the section you are in. Its message region is a sibling of that body, so with
   * the frame's own padding it spanned BOTH — measured at 1280 × 800, a refusal card running
   * x = 87 → 1193 while the pane it belongs to starts at 297. Two hundred and twenty-six pixels
   * of an amber sentence about Servers, drawn across the names of the four sections the same
   * sentence says are still editable. Its bottom edge sat at 693.0 against a footer top of
   * 693.0 — flush, no separation, which is what read as an overlap.
   *
   * ⭐ THIS IS THE ONE PLACE THE FIXED FRAME'S BODY SHAPE IS SPELLED, and it is spelled here
   * rather than in `Modal.tsx` for the same reason every other frame number is: a value with no
   * home has no reviewer. The inset is the RAIL plus the PANE's own horizontal padding, so the
   * card starts exactly where the section's cards start; the block padding is the pane's own
   * `cardGap`, because the band is the last item in that column and takes the column's rhythm.
   *
   * ⚠ Applied as `paddingInlineStart`, never as the fourth value of a physical shorthand: the
   * rail is the body's FIRST column, so in an RTL document it is on the right and the inset must
   * follow it. `modal-message-containment.spec.ts` measures both edges against the pane's.
   */
  '--r-modal-message-pad-fixed': `${String(STATION_SETUP_PX.cardGap)}px ${String(STATION_SETUP_PX.panePadX)}px`,
  '--r-modal-message-inset-fixed': `${String(STATION_SETUP_PX.railW + STATION_SETUP_PX.panePadX)}px`,
  /*
   * 🔴 `MONITORS-01` — audit rows 71, 74 and 77: the `fixed` frame's own corner, lift,
   * title and close box, measured in Chromium at 1280 × 800 on `09-channel-settings.html`.
   * Scoped `-fixed` because the reference gives its several dialogs several values for each
   * of these — see `Modal.tsx`'s `dialogFixed` for the numbers and the argument.
   */
  /*
   * ── 🔴 `REPAIR-03` B — THE OUTER `.modal` FAMILY, AS RENDERED ───────────────────────────
   *
   * The reference has THREE dialog families and this is the first of them: `.modal` in the
   * OUTER document (picker, import, audit log, live audio, `#confirm-dialog`). The other two
   * are `.settings` and `.sub-dialog`, both inside the Station-setup SHADOW ROOT with their
   * own stylesheet and their own mint palette — see the `-fixed` block below and §20.2.
   *
   * Measured by opening each `<dialog>` at 1280 × 800. Wave counts in the outer sheet (one
   * `<style>`, 82,256 bytes, 1,067 rules): `.modal` 2 (the second is a narrow `@media`),
   * `.modal-head` 3, `.modal-foot` 3, `.modal-body` 1, `.modal-icon` 2, `.btn` 1.
   *
   * ⚠ THE FRAME'S CHROME IS FLUSH — a head band with its own ground and a rule under it, a
   * body that owns its padding, and a footer band with its own ground and a rule over it. The
   * `fixed` size already worked this way; this brings the other three into the same shape,
   * which is one treatment instead of two rather than a second one.
   */
  '--r-modal-radius': '14px',
  /**
   * 🔴 `SETTINGS-POLISH-04` §7 — **ONE LIFT FOR EVERY DIALOG**, which is what the reference
   * draws: its `dialog{box-shadow:0 32px 100px #0009,0 0 0 1px #0003}` is on the ELEMENT, not
   * on one of its sizes, so `.settings` and `.sub-dialog` are lifted the same way.
   *
   * This was `0 30px 100px rgba(0,0,0,0.667)` — a single soft drop with no ring, so a sub-dialog
   * floating over Station setup had a softer edge than the frame beneath it and read as the
   * flatter of the two. The value below is byte-for-byte `--r-modal-shadow-fixed`, which
   * `MONITORS-01` measured off that same rule; the two are now one number stated twice because
   * the drawing states it once. ⚠ If one moves, move both.
   */
  '--r-modal-shadow': '0 32px 100px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
  /** The frame's edge — `#3a4c60`, a step brighter than `--r-border`, so a dialog reads as lifted. */
  '--r-modal-line': '#3a4c60',
  /** `.modal-head{padding:22px 26px;gap:14px;background:#172230}`. */
  '--r-modal-head-pad': '22px 26px',
  '--r-modal-head-gap': '14px',
  '--r-modal-head-bg': '#172230',
  /** Its title — 18 px / 650, which resolves to the 700 face here (A3). */
  '--r-modal-title-text': '18px',
  /** `.modal-body{padding:22px}` on the confirm dialog; the audio dialog insets `0 20px`. */
  '--r-modal-body-pad': '22px',
  /** `.modal-foot{padding:16px 26px;gap:12px;background:#14202d}`, rendered 72 px tall. */
  '--r-modal-foot-pad': '16px 26px',
  '--r-modal-foot-gap': '12px',
  '--r-modal-foot-bg': '#14202d',
  /**
   * 🔴 THE FOOTER FLOOR FOR EVERY DIALOG THAT IS NOT `fixed` — 72 px, measured.
   *
   * ⚠ THERE ARE NOW TWO FLOORS AND EACH BELONGS TO ONE FAMILY. `--r-modal-foot-h` below is
   * **74 px** and is the `fixed` frame's, from the reference's `.panel-foot{min-height:74px}`;
   * this one is **72 px** and is the outer `.modal` family's, from its `.modal-foot`. Neither
   * is "the" floor and neither may be composed from what a section puts in it — a height that
   * belongs to BEING a footer cannot be a function of its contents (`B-240`). The 59 px that
   * appears in this file's history was the abandoned mockup's arithmetic and is neither.
   */
  '--r-modal-foot-h-base': '72px',
  /**
   * THE HEAD EMBLEM — `.modal-icon`, 42 × 42, radius 10, on `#20384d` with a `#3b5770` edge
   * and a `#9edcfa` glyph. Audit rows 62, 98 and 113 (the audio dialog, the picker and the
   * audit log); row 72 is the `fixed` frame's, which the reference draws at the same box.
   *
   * ⚠ The reference's `#confirm-dialog` has NO emblem, and that is a decision rather than an
   * omission: a confirmation asks a question in words, and a decorative mark beside a
   * destructive one adds furniture where the sentence is the whole content.
   */
  '--r-modal-emblem-box': '42px',
  '--r-modal-emblem-radius': '10px',
  '--r-modal-emblem-bg': '#20384d',
  '--r-modal-emblem-line': '#3b5770',
  '--r-modal-emblem-ink': '#9edcfa',
  '--r-modal-emblem-glyph': '20px',
  /**
   * ── THE BUTTON FAMILY (audit rows 87 and 106) ────────────────────────────────────────
   *
   * The reference's outer `.btn` renders `min-height:39px`, `border-radius:7px`,
   * `padding:9px 14px`, `14px / 550`; its `.btn.small` 33 px / 13 px. The app's modal footer
   * button was 36 px, radius 4, `12.8px / 600`.
   *
   * ⚠ The Station-setup family's is DIFFERENT AGAIN — 40 px, radius 8, `9px 15px` — which is
   * why this is scoped to the modal footer rather than applied to `.cg-btn` at large. One
   * primitive, two footers, and the drawing gives two numbers.
   */
  '--r-modal-btn-h': '39px',
  '--r-modal-btn-radius': '7px',
  '--r-modal-btn-text': '14px',
  '--r-modal-radius-fixed': `${String(STATION_SETUP_PX.frameRadius)}px`,
  '--r-modal-shadow-fixed': '0 32px 100px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
  '--r-modal-title-text-fixed': `${String(STATION_SETUP_PX.titleTextFrame)}px`,
  '--r-modal-close-box-fixed': `${String(STATION_SETUP_PX.closeBox)}px`,
  '--r-modal-close-radius-fixed': `${String(STATION_SETUP_PX.closeRadius)}px`,
  '--r-modal-subtitle-text': `${String(STATION_SETUP_PX.subtitleText)}px`,
  '--r-modal-subtitle-gap': `${String(STATION_SETUP_PX.subtitleGap)}px`,
  /**
   * 🔴 THE FIXED FRAME'S FOOTER BAR — a FLOOR, not an intrinsic height, and the distinction
   * is the whole point. It is the same argument `--r-panel-bar-h` makes one surface over: a
   * height that belongs to BEING a footer cannot be a function of what a given section
   * happens to put in it.
   *
   * `B-240` is what forced it. Removing the per-section `Close` left three of the five tabs
   * with NO footer buttons, so their footer collapsed from 59px to 41px — and the footer's
   * TOP EDGE moved 18px as the operator walked the rail, which is precisely what
   * `STATION-CHROME-02` §2 forbids and what `station-setup-frame.spec.ts` measures. The outer
   * box stayed identical throughout, which is why that spec measures two edges and not one.
   *
   * The value is the modal button row's own floor (36px) plus this footer's padding.
   *
   * ⚠ PHASE 2 RE-READ THIS AND CHANGED NOTHING, WHICH IS THE POINT. `PROMPT.md` §2.2
   * says in as many words: _keep `--r-modal-foot-h` as a FLOOR_. The geometry block
   * below brings the reference's own heights in as tokens; none of them is this one,
   * and none of them may be composed into this one. A footer's height belongs to
   * being a footer.
   *
   * ⭐ PHASE 7 MOVED ITS VALUE, NOT ITS ROLE. The reference's footer is
   * `.panel-foot{min-height:74px}` — itself a floor — so the number is the measured one
   * (`STATION_SETUP_PX.footMinH`) and it is still applied as `minHeight`, still read by
   * nothing that composes into it, and still what `station-setup-frame.spec.ts` measures
   * on every tab. 59 was the abandoned mockup's arithmetic (36 + padding); 74 is what the
   * owner approved.
   */
  '--r-modal-foot-h': `${String(STATION_SETUP_PX.footMinH)}px`,
  '--r-lock-scrim': 'rgba(15, 23, 42, 0.94)',
  '--r-shadow-menu': '0 4px 16px rgba(0, 0, 0, 0.45)',
  '--r-shadow-drawer': '-8px 0 24px rgba(0, 0, 0, 0.45)',

  /*
   * ── `RUNTIME-REDESIGN-01` PHASE 9 — THE NOTICE, AS THE REFERENCE RENDERS IT ──────────
   *
   * The reference's `.notice` is ONE wave (measured in Chromium at 1280 × 800, `design.md`
   * §16.3): a `13px 15px` box, radius 8, 13 px on a 1.6 line, an 18 px icon gapped 10, in
   * one of three pairs — plain (`#bed6e5` on `#172736`, ruled `#2b4c62`), warn (`--amber`
   * on `--amberbg`, ruled `#655334`) and error (`--red` on `--redbg`, ruled `#68414c`).
   *
   * The WARN pair is what every amber strip in the app already meant — the emptied-air
   * notice, the orphan and occupancy strips, `Notice`'s refusal, the amber tag — so
   * `--r-notice-fill` / `--r-notice-line` MOVE to it (a role adopts a reference value IFF the
   * reference declares one for that role, §7.1). The PLAIN pair is new: it dresses the
   * neutral strips that used to borrow the panel's own surface (the video-layer strip, a
   * completed manual failover, `Notice`'s `notice` role). The ERROR pair is NOT taken for
   * the air alarms — those keep `colors.alarmFill` with light ink (A4 / 2A: alarm severity by
   * air-criticality), and the reference spends its pastel error card on an import failure,
   * which is not an alarm about air.
   */
  /*
   * 🔴 `CONSOLE-LOOK-06` DELTA 7 §1 — **THE AUDIO VERB FAMILY, ONE SET FOR BOTH SURFACES.**
   *
   * ON / OFF / SOLO appear in the Live plates ROW and in the Live audio MODAL. The reference
   * styles them differently in the two places; we do not copy that split — one colour family,
   * consumed by both, with only GEOMETRY per surface (a 42 px table row and a modal grid cell
   * are not the same box).
   *
   * ⚠ THE REFERENCE'S MODAL-ONLY HOVERS ARE RETIRED, and the reason must outlive this comment:
   * its modal paints ON green (`#22dd7a`). **In this console green means ON AIR** (`design.md`
   * §29). A green hover on an audio verb teaches that green also means "audible", and the same
   * button family then means two things. Amber already carries SOLO; blue already carries the
   * audible/attention role.
   *
   * ⭐ SOLO IS AMBER AT REST BECAUSE IT IS THE ONE VERB THAT CHANGES OTHER FRAMES. That is why
   * it must not look like ON/OFF — it is not a louder version of them, it is a different kind
   * of act.
   *
   * Measured off the reference's TABLE treatment at 1280 × 800: ON/OFF `rgb(25 39 55)` on
   * `rgb(61 83 104)` with `rgb(116 205 246)` ink; SOLO `rgb(42 38 29)` on `rgb(118 92 46)`
   * with `rgb(243 205 136)` ink. The two INKS already existed as roles (`--r-accent` and
   * `--r-caution-text`) and are reused rather than re-spelled; only the grounds are new.
   */
  '--r-verb-audio-bg': '#192737',
  '--r-verb-audio-line': '#3d5368',
  '--r-verb-solo-bg': '#2a261d',
  '--r-verb-solo-line': '#765c2e',
  /** `.plate-panic{background:#3c3019;border:1px solid #a6792d;color:#f5cd81}`, measured. */
  '--r-panic-bg': '#3c3019',
  '--r-panic-line': '#a6792d',
  '--r-panic-ink': '#f5cd81',
  '--r-notice-line': '#655334',
  '--r-notice-fill': REF_AMBER_BG,
  '--r-notice-neutral-bg': '#172736',
  '--r-notice-neutral-line': '#2b4c62',
  '--r-notice-neutral-text': '#bed6e5',
  '--r-notice-pad': `${String(NOTICE_PX.padY)}px ${String(NOTICE_PX.padX)}px`,
  '--r-notice-radius': `${String(NOTICE_PX.radius)}px`,
  '--r-notice-fs': `${String(NOTICE_PX.text)}px`,
  '--r-notice-lh': String(NOTICE_PX.line),
  '--r-notice-gap': `${String(NOTICE_PX.gap)}px`,
  '--r-notice-icon': `${String(NOTICE_PX.icon)}px`,

  /*
   * THE FAILOVER ALARM's own `--r-alarm-*` family (a deep red slab, `B-172`) was DELETED in
   * Phase 9: the banner is a strip whose tone is the situation's, and it reads the notice
   * pairs above and `colors.alarmFill` like every other alarm. A token read by nothing is a
   * trap (A9), so the family is gone rather than documented dead.
   */

  /*
   * THE COMMAND TOAST — the reference's `.global-toast` as rendered (`design.md` §16.3):
   * `#d6f3e3` on `#1d3b30`, ruled `#4b7f68`, radius 9, `12px 17px`, 14 px, 42 px off the
   * foot, under `0 8px 40px` of shadow. The reference has no ERROR toast (its toast has no
   * command-refusal path), so that half keeps `colors.alarmFill` with the fill ink.
   */
  '--r-toast-ok-bg': '#1d3b30',
  '--r-toast-ok-ink': '#d6f3e3',
  '--r-toast-ok-line': '#4b7f68',
  '--r-toast-bottom': `${String(TOAST_PX.bottom)}px`,
  '--r-toast-pad': `${String(TOAST_PX.padY)}px ${String(TOAST_PX.padX)}px`,
  '--r-toast-radius': `${String(TOAST_PX.radius)}px`,
  '--r-toast-fs': `${String(TOAST_PX.text)}px`,
  '--r-toast-shadow': '0 8px 40px rgba(0, 0, 0, 0.53)',
  /** `.global-toast{gap:9px}` — between the icon and the line. */
  '--r-toast-gap': '9px',

  /*
   * THE LOCK SCREEN — the reference's `unlock-dialog` LOOK (`design.md` §16.3), over the
   * app's OWN chrome and NOT its dialog primitive (§9; `Modal.tsx`'s note; `B-229`): a
   * 480 px card, `32px 24px 23px` body, a 56 px icon box with a 14 px corner in the ACCENT
   * pair, a 24 px / 650 centred title, 14 px muted copy, a mono PIN field tracked `.3em`,
   * and one full-width primary submit. The reference draws the box in the Station-setup
   * shadow palette (its teal accent); this console has one accent and the box takes it.
   */
  '--r-lock-card-w': `${String(LOCK_PX.cardW)}px`,
  '--r-lock-card-pad': `${String(LOCK_PX.padTop)}px ${String(LOCK_PX.padX)}px ${String(LOCK_PX.padBottom)}px`,
  '--r-lock-icon-box': `${String(LOCK_PX.iconBox)}px`,
  '--r-lock-icon-radius': `${String(LOCK_PX.iconRadius)}px`,
  '--r-lock-icon-glyph': `${String(LOCK_PX.iconGlyph)}px`,
  '--r-lock-title-fs': `${String(LOCK_PX.titleText)}px`,
  '--r-lock-copy-fs': `${String(LOCK_PX.copyText)}px`,
  '--r-lock-pin-fs': `${String(LOCK_PX.pinText)}px`,
  '--r-lock-pin-h': `${String(LOCK_PX.pinH)}px`,
  '--r-lock-submit-h': `${String(LOCK_PX.submitH)}px`,

  // THE CONNECTION BAND's hazard stripe.
  '--r-band-stripe-a': '#F5C451',
  '--r-band-stripe-b': '#E0A92E',

  // THE FILE CHIP — a light pill on the dark chrome (the Inspector's from-file mark).
  '--r-file-chip-bg': '#E6EBF0',
  '--r-file-chip-ink': INK_DEEP,
  '--r-file-chip-detach-bg': '#55606C',
  '--r-file-chip-detach-ink': '#F2F5F8',

  /*
   * VIDEO SURFACES — what a picture sits on, and what stands in for one.
   *
   * `--r-video-ground` is BLACK and must stay black: it is the ground a real
   * broadcast picture is composited on, so anything else would tint the operator's
   * reference. The checkers are the "no picture here" stand-in behind a rehearsal
   * plate, and the hatch is the "this plate is not in this look" fill.
   */
  /**
   * `REPAIR-03` A1, audit row 38's other half — THE MONITOR BOX's own ground, adopted.
   *
   * The reference paints `.monitor` on `#101722`, a near-black between its `--bg` and its
   * `--surface` and declared as neither. `MONITORS-01` argued it away with the stale-hex
   * claim; run against the owner's narrow test it FAILS part (b) — `#101722` is nowhere in
   * §7's "was" column — so it is the drawing's own decision and it is taken.
   *
   * It is a MONITOR ground, not a panel ground: the box holds a picture, and sitting it a
   * shade below the panels around it is what makes the screen read as inset rather than as
   * another card. `--r-video-ground` below is still the SCREEN itself and still black.
   */
  '--r-monitor-bg': '#101722',
  '--r-video-ground': '#000',
  '--r-checker-a': '#3D4253',
  '--r-checker-b': '#5B6075',
  '--r-plate-hatch': 'rgba(0, 0, 0, 0.34)',
  '--r-plate-chip-bg': 'rgba(0, 0, 0, 0.78)',
  '--r-plate-ink': '#FFFFFF',
  '--r-plate-ink-dim': 'rgba(255, 255, 255, 0.72)',
  '--r-plate-outline': 'rgba(255, 255, 255, 0.85)',

  // Spacing (4px base)
  '--r-space-1': '4px',
  '--r-space-2': '8px',
  '--r-space-3': '12px',
  '--r-space-4': '16px',
  '--r-space-6': '24px',
  '--r-space-8': '32px',
  // Radii
  '--r-radius-sm': '4px',
  /*
   * 🔴 `CONSOLE-LOOK-06` §5 — THE FIELD/BADGE CORNER, reversing `CONSOLE-MATCH-03`'s ARGUED (a).
   *
   * That argument was "the reference is not uniform, so this is one shared token against one of
   * its several" — and the FACT is right while the conclusion was wrong. Measured in Chromium,
   * the reference splits its corners by KIND and does it consistently: the transport buttons are
   * 3, the toolbar's are 4, the header's are 5, the base button is 7 — and every FIELD and every
   * BADGE is **5**. That is not several answers; it is one answer for fields and badges and a
   * different one for buttons.
   *
   * So this is a NEW token rather than a change to `--r-radius-sm`, which is what `.cg-btn` and
   * eleven other chips read. Moving that one would have taken the buttons with it, which the
   * reference does not do.
   *
   * ⭐ WHAT IT MOVES, in full: the shared `.cg-field` (every text input, search and select in
   * the app), the sub-bar's on-air chip, and the header's `PVW · N` badge — 4 px → 5 px. What it
   * deliberately does NOT move: `.cg-btn`, `.cg-file-chip`, `.cg-list-item`, the drag handle,
   * checkboxes, `.cg-tooltip`, `.cg-plate-spacer`, `.cg-plate-help`, `.cg-audio-index`,
   * `.cg-code-chip`, `.cg-audit-caveat` and `.cg-audit-table`, all still `--r-radius-sm`.
   */
  '--r-radius-field': '5px',
  '--r-radius-md': '6px',
  '--r-radius-lg': '10px',
  '--r-radius-full': '9999px',
  // Type scale
  '--r-text-xs': '0.72rem',
  '--r-text-sm': '0.8rem',
  '--r-text-md': '0.9rem',
  '--r-text-lg': '1rem',
  '--r-text-xl': '1.2rem',
  '--r-weight-medium': '500',
  '--r-weight-semibold': '600',
  '--r-weight-bold': '700',
  /*
   * ── 🔴 `REPAIR-03` A3 — THE REFERENCE'S HALF-STEPS ARE NOT DECLARED HERE, AND THAT IS THE
   *    DECISION, NOT AN OVERSIGHT ────────────────────────────────────────────────────────
   *
   * The reference's type scale uses 450, 550 and 650 as well as the whole hundreds (`.outputs
   * th` 450; `.tag` / `.video-mode strong` / `.plate-table th` / `.btn.small` 550;
   * `.panel-scroll h2` 650). `MONITORS-01` declared `--r-weight-450/550/650` for them. They are
   * DELETED, because a token that cannot render is the same class as a dead token and dead
   * tokens are deleted rather than documented-dead (owner answer A9).
   *
   * 🔴 **MEASURED, NOT ASSUMED — BOTH TREES.** This app ships Exo 2 as FIVE STATIC FACES
   * (400/500/600/700/800, `fonts.css`); there is no variable axis, so CSS font matching snaps a
   * half step to a neighbour. In Chromium at 40 px with the real faces inlined, by rendered
   * width: `450 → 500`, `550 → 600`, `650 → 700`. So each rule now spells the face that
   * actually paints, and NOTHING ON SCREEN MOVED when the three tokens went.
   *
   * ⭐ **FINDING, recorded because it changes how the drawing should be read: the reference
   * does not render its own half steps either.** Its stack is `Inter, "Segoe UI", …` and
   * `document.fonts` is EMPTY — no face is loaded at all — so it falls back and groups
   * {400, 450} / {500, 550, 600} / {650, 700}. The drawing declares a scale finer than anything
   * that draws it, its own browser included. A half step in that file is therefore evidence of
   * INTENT (heavier / lighter than its neighbour), never of a value to transcribe.
   *
   * ⚠ Do NOT re-add these, and do NOT add font faces to make them real — shipping a variable
   * Exo 2 is a font-loading decision with a bundle cost, and it is the owner's to make.
   */ // Borders / elevation
  '--r-focus-ring': '2px',
  '--r-shadow-1': '0 1px 3px rgba(0, 0, 0, 0.35)',
  '--r-shadow-2': '0 4px 16px rgba(0, 0, 0, 0.4)',
  /**
   * THE PANEL BAR'S HEIGHT — one number for all four panels.
   *
   * A FLOOR, not an intrinsic height, and that distinction is the whole fix: the
   * bars used to be as tall as their contents, so LAYERS (36px bulk verbs) stood
   * ~52px and the Inspector (small icon buttons only) stood ~39px. Neither was
   * wrong on its own, which is exactly why nobody found it by reading a file.
   * See `.cg-panel-header` in `controls.css`.
   */
  '--r-panel-bar-h': '52px',
  /*
   * ── `RUNTIME-REDESIGN-01` PHASE 2 §2.2 / PHASE 3 §3 — THE REFERENCE'S GEOMETRY ──
   *
   * The reference's own row padding, action-button heights and icon-button boxes, as
   * tokens, so the numbers have ONE home. Phase 2 declared them; Phase 3 applies them —
   * the layer row, its verbs, the sticky header and the Graphics-beds divider now READ
   * the `--r-row-*` family, and `layerTable.ts` reads the same numbers through
   * `LAYER_ROW_PX` (declared beside `SELECTED_WASH`, above).
   *
   * 🔴 **PHASE 3 CORRECTED THE ROW VALUES.** Phase 2 transcribed them from the FIRST
   * `.layer-table` rules in the reference's stylesheet, and those rules are overridden
   * four times further down the same file; the prototype as a browser renders it draws
   * `padding:15px 12px` cells 67 px tall and `48 × 36` verbs (`design.md` §10, measured
   * in Chromium). The general-button tokens below are untouched: `.btn`, `.btn.small`
   * and `.icon-btn` ARE live rules, and later phases dress the surfaces that wear them.
   *
   * ⚠ These are NOT steps on the spacing scale and must not be folded into it. A
   * scale step exists so several things move together; each of these is one
   * component's own dimension, measured off the drawing.
   */
  /** A layer-table cell — `…tr>td{padding:15px 12px}` (the RENDERED rule). */
  '--r-row-pad': `${String(LAYER_ROW_PX.padY)}px ${String(LAYER_ROW_PX.padX)}px`,
  /** A general action button's floor: `.btn { min-height: 39px }`. */
  '--r-btn-h': '39px',
  /** …and the compact one: `.btn.small { min-height: 33px }`. */
  '--r-btn-h-small': '33px',
  /**
   * The floor every VERB-WEIGHT control shares — the row verb's own height
   * (`.row-verb{min-height:36px}`), which the panel's text bulk verbs also take so
   * the two read as one weight. Phase 2 had it at 34 from `.row-actions .btn`, a rule
   * the prototype renders for no element.
   */
  '--r-row-action-h': `${String(LAYER_ROW_PX.verbH)}px`,
  /** A general icon button is a SQUARE: `.icon-btn { width: 36px; height: 36px }`. */
  '--r-icon-btn-box': '36px',
  /**
   * A row verb's box is NOT square — `.row-verb{width:48px;height:36px}`: wider than
   * tall, because the sticky header prints a WORD above each glyph and `REMOVE` needs
   * the width. Two tokens rather than one box for that reason. (Phase 2 had 32 × 34,
   * from the dead `.row-actions .icon-btn` rule.)
   */
  '--r-row-icon-btn-w': `${String(LAYER_ROW_PX.verbW)}px`,
  '--r-row-icon-btn-h': `${String(LAYER_ROW_PX.verbH)}px`,
  /** Between two verbs — `.row-actions{gap:12px}`. Read by the column model. */
  '--r-row-verb-gap': `${String(LAYER_ROW_PX.verbGap)}px`,
  /** The verb's glyph — `.row-verb svg{width:20px;height:20px}`. */
  '--r-row-verb-glyph': `${String(LAYER_ROW_PX.verbGlyph)}px`,
  /** The Graphics-beds divider band — `.layer-table .bed-divider>td{height:25px}`. */
  '--r-bed-divider-h': `${String(LAYER_ROW_PX.bedDividerH)}px`,
  /*
   * ── 🔴 `AUDIT-CLOSE-01` B — THE APP HEADER AND THE LAYERS SUB-BAR ────────────────────
   *
   * `APP_HEAD_PX` / `LAYER_SUBBAR_PX` carry the measurements and why they are new.
   *
   * ⚠ `--r-app-head-bg` is a LITERAL and not a role, and that is deliberate rather than an
   * oversight: the reference paints its `.app-head` and its `.bottom-bar` on `rgb(18, 27, 38)`,
   * one unit off this palette's `--r-surface` `#141b25`. Taking the measured value gives this
   * bar the drawing's own ground without repainting a fourth near-identical surface across the
   * app. The STATUS bar's ground is a different question and an unmeasured one — the audit
   * files it as bucket D — so it is not moved here to match.
   */
  '--r-app-head-h': `${String(APP_HEAD_PX.h)}px`,
  '--r-app-head-pad': `${String(APP_HEAD_PX.padY)}px ${String(APP_HEAD_PX.padX)}px`,
  '--r-app-head-gap': `${String(APP_HEAD_PX.gap)}px`,
  '--r-app-head-bg': '#121b26',
  '--r-app-brand-gap': `${String(APP_HEAD_PX.brandGap)}px`,
  '--r-app-head-btn-h': `${String(APP_HEAD_PX.btnH)}px`,
  '--r-app-head-btn-pad': `${String(APP_HEAD_PX.btnPadY)}px ${String(APP_HEAD_PX.btnPadX)}px`,
  '--r-app-head-btn-gap': `${String(APP_HEAD_PX.btnGap)}px`,
  '--r-app-head-btn-text': `${String(APP_HEAD_PX.btnText)}px`,
  '--r-app-head-btn-radius': `${String(APP_HEAD_PX.btnRadius)}px`,
  '--r-subbar-h': `${String(LAYER_SUBBAR_PX.h)}px`,
  '--r-subbar-pad': `${String(LAYER_SUBBAR_PX.padY)}px ${String(LAYER_SUBBAR_PX.padX)}px`,
  '--r-subbar-gap': `${String(LAYER_SUBBAR_PX.gap)}px`,
  '--r-subbar-text': `${String(LAYER_SUBBAR_PX.text)}px`,
  '--r-subbar-search-w': `${String(LAYER_SUBBAR_PX.searchW)}px`,
  '--r-subbar-search-h': `${String(LAYER_SUBBAR_PX.searchH)}px`,
  '--r-subbar-search-pad': `${String(LAYER_SUBBAR_PX.searchPadTop)}px ${String(LAYER_SUBBAR_PX.searchPadRight)}px ${String(LAYER_SUBBAR_PX.searchPadTop)}px ${String(LAYER_SUBBAR_PX.searchPadLeft)}px`,
  '--r-subbar-search-glyph-inset': `${String(LAYER_SUBBAR_PX.searchGlyphInset)}px`,
  '--r-subbar-check-gap': `${String(LAYER_SUBBAR_PX.checkGap)}px`,
  '--r-subbar-pill-text': `${String(LAYER_SUBBAR_PX.pillText)}px`,
  '--r-subbar-badge-text': `${String(LAYER_SUBBAR_PX.badgeText)}px`,
  '--r-subbar-badge-pad': `${String(LAYER_SUBBAR_PX.badgePadY)}px ${String(LAYER_SUBBAR_PX.badgePadX)}px`,
  '--r-monitor-label-text': `${String(MONITOR_HEAD_PX.labelText)}px`,
  '--r-monitor-label-track': `${String(MONITOR_HEAD_PX.labelTrack)}px`,
  '--r-monitor-label-gap': `${String(MONITOR_HEAD_PX.labelGap)}px`,
  '--r-monitor-ch-text': `${String(MONITOR_HEAD_PX.chText)}px`,
  '--r-monitor-fact-text': `${String(MONITOR_HEAD_PX.factText)}px`,
  '--r-monitor-strip-h': `${String(MONITOR_HEAD_PX.stripH)}px`,
  '--r-monitor-strip-pad': `${String(MONITOR_HEAD_PX.stripPadY)}px ${String(MONITOR_HEAD_PX.stripPadX)}px`,
  '--r-monitor-strip-gap': `${String(MONITOR_HEAD_PX.stripGap)}px`,
  '--r-monitor-head-h': `${String(MONITOR_COMPACT_PX.headH)}px`,
  '--r-monitor-head-pad': `${String(MONITOR_COMPACT_PX.headPadY)}px ${String(MONITOR_COMPACT_PX.headPadX)}px`,
  '--r-monitor-head-gap': `${String(MONITOR_COMPACT_PX.headGap)}px`,
  '--r-monitor-head-btn': `${String(MONITOR_COMPACT_PX.headBtn)}px`,
  '--r-monitor-head-btn-pad': `${String(MONITOR_COMPACT_PX.headBtnPad)}px`,
  '--r-monitor-head-btn-radius': `${String(MONITOR_COMPACT_PX.headBtnRadius)}px`,
  '--r-monitor-card-radius': `${String(MONITOR_COMPACT_PX.cardRadius)}px`,
  '--r-monitor-ch-indent': `${String(MONITOR_COMPACT_PX.chIndent)}px`,
  '--r-monitor-ch-opacity': `${String(MONITOR_COMPACT_PX.chOpacity)}`,
  '--r-pvw-transport-h': `${String(MONITOR_COMPACT_PX.transportH)}px`,
  '--r-pvw-transport-pad': `${String(MONITOR_COMPACT_PX.transportPadY)}px ${String(MONITOR_COMPACT_PX.transportPadX)}px`,
  '--r-pvw-transport-gap': `${String(MONITOR_COMPACT_PX.transportGap)}px`,
  '--r-pvw-transport-radius': `${String(MONITOR_COMPACT_PX.transportRadius)}px`,
  '--r-pvw-transport-text': `${String(MONITOR_COMPACT_PX.transportText)}px`,
  '--r-pvw-scope-text': `${String(MONITOR_COMPACT_PX.scopeText)}px`,
  '--r-pvw-scope-track': `${String(MONITOR_COMPACT_PX.scopeTrack)}px`,
  /** The compact head's ground — a step above the panel's, as the reference draws it. */
  '--r-monitor-head-bg': '#202b3a',
  '--r-monitor-signal-gap': `${String(MONITOR_COMPACT_PX.signalGap)}px`,
  '--r-monitor-signal-dot': `${String(MONITOR_COMPACT_PX.signalDot)}px`,
  /*
   * The PGM signal dot's fill. A muted GOLD, and the reference's own choice: "no return
   * signal" is not a fault (`MONITORS-01` — `C-016` is unbuilt, the playout server is very
   * probably transmitting), so it may not wear the alarm red; but it is not nothing either,
   * so it may not be the text grey. This is the one hue in §2 with no existing role token.
   */
  '--r-monitor-signal-dot-fill': '#a78c58',
  /** The PVW count rides its pane's own accent, as the reference does (`#c4b5fd`). */
  '--r-monitor-count-ink': '#c4b5fd',
  /** The PGM strip's readouts — a step below the body text, as measured. */
  '--r-monitor-strip-ink': '#93a5bc',
  /** `#monitor-area .pvw-compact .monitor-controls{background:#101827}` */
  '--r-monitor-strip-bg': '#101827',
  '--r-stage-note-inset': `${String(STAGE_NOTE_PX.inset)}px`,
  '--r-stage-note-pad': `${String(STAGE_NOTE_PX.padY)}px ${String(STAGE_NOTE_PX.padX)}px`,
  '--r-stage-note-text': `${String(STAGE_NOTE_PX.text)}px`,
  '--r-stage-note-track': `${String(STAGE_NOTE_PX.track)}px`,
  /** The translucent plate that keeps the stamp readable over a white graphic. */
  '--r-stage-note-bg': 'rgba(7 12 19 / 0.62)',
  '--r-bulk-target-text': `${String(LAYER_BULK_PX.targetText)}px`,
  '--r-bulk-target-well': `${String(LAYER_BULK_PX.targetWell)}px`,
  '--r-bulk-divider-h': `${String(LAYER_BULK_PX.dividerH)}px`,
  '--r-foothint-h': `${String(LAYER_FOOTHINT_PX.h)}px`,
  '--r-foothint-pad': `${String(LAYER_FOOTHINT_PX.padY)}px ${String(LAYER_FOOTHINT_PX.padX)}px`,
  '--r-foothint-gap': `${String(LAYER_FOOTHINT_PX.gap)}px`,
  '--r-foothint-text': `${String(LAYER_FOOTHINT_PX.text)}px`,
  /*
   * ⚠ There is deliberately NO `--r-row-icon-btn-narrow-w` here any more. Phase 2 transcribed
   * a `30px` destructive-group width from a stylesheet rule the prototype renders for no
   * element; Phase 3 kept it "documented as dead" for the owner's decision, and the owner
   * answered (A8/A9, 2026-09-08): wave 1 is REJECTED and the token is DELETED — a token read
   * by nothing with a comment saying it is dead is a trap, not a record. Do not re-add it.
   */
  /**
   * ── `RUNTIME-REDESIGN-01` PHASE 4 — the look strip (`LOOK_STRIP_PX`, cited to the RENDERED
   * rules above it). Read by `.cg-look-cell`, `.cg-look-thumb` and `LookPicker`'s label.
   */
  /*
   * ── 🔴 `REPAIR-03` A1 — THE LOOK SEGMENT'S OWN COLOURS (audit rows 20 and 21), ADOPTED ──
   *
   * `MONITORS-01` argued these away as "the prototype's fourth wave is painted in this
   * console's retired hexes". That argument is right about SOME values and was applied too
   * widely, so the owner narrowed it to a two-part test: a reference value is stale ONLY when
   * it is (a) absent from the reference's own nineteen declared `:root` colours AND (b) equal
   * to a hex this app RETIRED in Phase 2. Everything else is adopted.
   *
   * Run per value, none of these six is retired — `#151e2c`, `#56667d`, `#dbe4f0`, `#285273`,
   * `#91d7ff`, `#ffffff` appear nowhere in §7's "was" column. They fail (b), so they are the
   * drawing's own decisions and they are taken.
   *
   * ⚠ THE SELECTED FRAME IS A 1 px INSET IN `#91d7ff`, not the app's 2 px inset in
   * `--r-surface`. The app's device drew a dark gap; the reference's draws a bright edge, and
   * with the fill it is what says "this look is the one".
   */
  '--r-look-btn-bg': '#151e2c',
  '--r-look-btn-line': '#56667d',
  '--r-look-btn-ink': '#dbe4f0',
  '--r-look-btn-sel-bg': '#285273',
  '--r-look-btn-sel-line': '#91d7ff',
  '--r-look-btn-sel-ink': '#ffffff',
  '--r-look-btn-h': `${String(LOOK_STRIP_PX.btnH)}px`,
  '--r-look-btn-min-w': `${String(LOOK_STRIP_PX.btnMinW)}px`,
  '--r-look-btn-pad': `${String(LOOK_STRIP_PX.btnPadY)}px ${String(LOOK_STRIP_PX.btnPadX)}px`,
  '--r-look-btn-radius': `${String(LOOK_STRIP_PX.btnRadius)}px`,
  '--r-look-btn-text': `${String(LOOK_STRIP_PX.btnText)}px`,
  '--r-look-btn-gap': `${String(LOOK_STRIP_PX.btnGap)}px`,
  '--r-look-strip-gap': `${String(LOOK_STRIP_PX.stripGap)}px`,
  '--r-look-ctx-gap': `${String(LOOK_STRIP_PX.ctxGap)}px`,
  '--r-look-ctx-min-w': `${String(LOOK_STRIP_PX.ctxMinW)}px`,
  '--r-look-ctx-text': `${String(LOOK_STRIP_PX.ctxText)}px`,
  '--r-look-thumb-w': `${String(LOOK_STRIP_PX.thumbW)}px`,
  '--r-look-thumb-h': `${String(LOOK_STRIP_PX.thumbH)}px`,
  '--r-look-thumb-gap': `${String(LOOK_STRIP_PX.thumbGap)}px`,
  /**
   * ── `RUNTIME-REDESIGN-01` PHASE 5 — the Inspector (`INSPECTOR_PX`, cited to the RENDERED
   * rules above it). Read by `.cg-inspector-body`, `.cg-inspector-section`, `.cg-position-row`,
   * `.cg-inspector-actions` and `PositionPicker`'s labels.
   */
  '--r-insp-section-text': `${String(INSPECTOR_PX.sectionText)}px`,
  '--r-insp-section-tracking': INSPECTOR_PX.sectionTracking,
  '--r-insp-label-text': `${String(INSPECTOR_PX.labelText)}px`,
  '--r-insp-label-line': `${String(INSPECTOR_PX.labelLine)}px`,
  '--r-insp-field-text': `${String(INSPECTOR_PX.fieldText)}px`,
  '--r-insp-field-pad': `${String(INSPECTOR_PX.fieldPadY)}px ${String(INSPECTOR_PX.fieldPadX)}px`,
  '--r-insp-field-h': `${String(INSPECTOR_PX.fieldH)}px`,
  '--r-insp-position-field-h': `${String(INSPECTOR_PX.positionFieldH)}px`,
  '--r-insp-offset-min-w': `${String(INSPECTOR_PX.offsetMinW)}px`,
  '--r-insp-foot-pad': `${String(INSPECTOR_PX.footPadY)}px ${String(INSPECTOR_PX.footPadX)}px`,
  '--r-insp-foot-gap': `${String(INSPECTOR_PX.footGap)}px`,
  '--r-insp-foot-btn-min-w': `${String(INSPECTOR_PX.footBtnMinW)}px`,
  '--r-insp-foot-btn-text': `${String(INSPECTOR_PX.footBtnText)}px`,
  '--r-insp-hint-text': `${String(INSPECTOR_PX.hintText)}px`,
  /**
   * The footer's upward shadow — `.inspector-foot{box-shadow:0 -5px 12px #0002}`: what lifts
   * the pinned bar off the field list it is stuck over, so scrolled content reads as passing
   * BEHIND it. Same family as `--r-shadow-1/-2`, cast upward.
   */
  '--r-insp-foot-shadow': '0 -5px 12px rgba(0, 0, 0, 0.13)',
  /*
   * ── `RUNTIME-REDESIGN-01` PHASE 6 — the live plates pane (`PLATES_PX`) and the audio
   * dialog (`AUDIO_DIALOG_PX`), cited to the RENDERED reference; see the constants' note.
   */
  '--r-plate-toolbar-h': `${String(PLATES_PX.toolbarH)}px`,
  '--r-plate-toolbar-pad': `${String(PLATES_PX.toolbarPadY)}px ${String(PLATES_PX.toolbarPadX)}px`,
  '--r-plate-toolbar-gap': `${String(PLATES_PX.toolbarGap)}px`,
  '--r-plate-toolbar-text': `${String(PLATES_PX.toolbarText)}px`,
  '--r-plate-head-h': `${String(PLATES_PX.headH)}px`,
  '--r-plate-head-text': `${String(PLATES_PX.headText)}px`,
  '--r-plate-row-min-h': `${String(PLATES_PX.rowMinH)}px`,
  '--r-plate-cell-pad': `${String(PLATES_PX.cellPadY)}px ${String(PLATES_PX.cellPadX)}px`,
  '--r-plate-cell-text': `${String(PLATES_PX.cellText)}px`,
  '--r-plate-coord-w': `${String(PLATES_PX.coordW)}px`,
  '--r-plate-coord-text': `${String(PLATES_PX.coordText)}px`,
  '--r-plate-slot-text': `${String(PLATES_PX.slotText)}px`,
  '--r-plate-owner-btn-h': `${String(PLATES_PX.ownerBtnH)}px`,
  '--r-plate-owner-text': `${String(PLATES_PX.ownerText)}px`,
  '--r-plate-word-text': `${String(PLATES_PX.wordText)}px`,
  '--r-plate-pill-dot': `${String(PLATES_PX.pillDot)}px`,
  '--r-plate-pill-gap': `${String(PLATES_PX.pillGap)}px`,
  '--r-plate-gain-w': `${String(PLATES_PX.gainW)}px`,
  '--r-plate-gain-h': `${String(PLATES_PX.gainH)}px`,
  '--r-plate-gain-gap': `${String(PLATES_PX.gainGap)}px`,
  '--r-plate-gain-radius': `${String(PLATES_PX.gainRadius)}px`,
  '--r-plate-readout-w': `${String(PLATES_PX.readoutW)}px`,
  '--r-plate-readout-text': `${String(PLATES_PX.readoutText)}px`,
  '--r-plate-verb-w': `${String(PLATES_PX.verbW)}px`,
  '--r-plate-solo-w': `${String(PLATES_PX.soloW)}px`,
  '--r-plate-verb-h': `${String(PLATES_PX.verbH)}px`,
  '--r-plate-verb-text': `${String(PLATES_PX.verbText)}px`,
  '--r-plate-verb-gap': `${String(PLATES_PX.verbGap)}px`,
  '--r-plate-panic-h': `${String(PLATES_PX.panicH)}px`,
  '--r-plate-col-owner': `${String(PLATES_PX.colOwner)}px`,
  '--r-plate-col-picture': `${String(PLATES_PX.colPicture)}px`,
  '--r-plate-col-audio': `${String(PLATES_PX.colAudio)}px`,
  '--r-plate-col-gain': `${String(PLATES_PX.colGain)}px`,
  '--r-plate-col-controls': `${String(PLATES_PX.colControls)}px`,
  '--r-audio-subtitle-text': `${String(AUDIO_DIALOG_PX.subtitleText)}px`,
  '--r-audio-context-pad-y': `${String(AUDIO_DIALOG_PX.contextPadY)}px`,
  '--r-audio-context-text': `${String(AUDIO_DIALOG_PX.contextText)}px`,
  '--r-audio-hint-text': `${String(AUDIO_DIALOG_PX.hintText)}px`,
  '--r-audio-head-pad-y': `${String(AUDIO_DIALOG_PX.headPadY)}px`,
  '--r-audio-head-text': `${String(AUDIO_DIALOG_PX.headText)}px`,
  '--r-audio-col-gain': `${String(AUDIO_DIALOG_PX.colGain)}px`,
  '--r-audio-col-verbs': `${String(AUDIO_DIALOG_PX.colVerbs)}px`,
  '--r-audio-col-gap': `${String(AUDIO_DIALOG_PX.colGap)}px`,
  '--r-audio-row-pad-y': `${String(AUDIO_DIALOG_PX.rowPadY)}px`,
  '--r-audio-row-min-h': `${String(AUDIO_DIALOG_PX.rowMinH)}px`,
  '--r-audio-index-box': `${String(AUDIO_DIALOG_PX.indexBox)}px`,
  '--r-audio-index-text': `${String(AUDIO_DIALOG_PX.indexText)}px`,
  '--r-audio-name-text': `${String(AUDIO_DIALOG_PX.nameText)}px`,
  '--r-audio-seat-text': `${String(AUDIO_DIALOG_PX.seatText)}px`,
  '--r-audio-slider-h': `${String(AUDIO_DIALOG_PX.sliderH)}px`,
  '--r-audio-slider-gap': `${String(AUDIO_DIALOG_PX.sliderGap)}px`,
  '--r-audio-readout-w': `${String(AUDIO_DIALOG_PX.readoutW)}px`,
  '--r-audio-readout-text': `${String(AUDIO_DIALOG_PX.readoutText)}px`,
  '--r-audio-state-text': `${String(AUDIO_DIALOG_PX.stateText)}px`,
  '--r-audio-verb-w': `${String(AUDIO_DIALOG_PX.verbW)}px`,
  '--r-audio-verb-h': `${String(AUDIO_DIALOG_PX.verbH)}px`,
  '--r-audio-verb-gap': `${String(AUDIO_DIALOG_PX.verbGap)}px`,
  '--r-audio-verb-text': `${String(AUDIO_DIALOG_PX.verbText)}px`,
  '--r-audio-foot-text': `${String(AUDIO_DIALOG_PX.footText)}px`,
  /*
   * ── `RUNTIME-REDESIGN-01` PHASE 7 — Station setup (`STATION_SETUP_PX`, cited to the RENDERED
   * reference; `design.md` §14.3). Read by `controls.css`'s `.cg-rail*`, `.cg-card*`,
   * `.cg-setup-*`, `.cg-video-*` and `.cg-output-*` rules and by the dialog's inline shell.
   */
  /**
   * The MONO face — for a channel token (`CH 01`), a slot number and a server-mode token,
   * the reference's `--mono`. Declared here so the stylesheet's `var(--r-font-mono)` has a
   * home; the console's body face is the shaping-capable stack `index.html` sets, untouched.
   */
  '--r-font-mono': '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  '--r-setup-rail-w': `${String(STATION_SETUP_PX.railW)}px`,
  '--r-setup-rail-pad': `${String(STATION_SETUP_PX.railPadTop)}px ${String(STATION_SETUP_PX.railPadX)}px ${String(STATION_SETUP_PX.railPadBottom)}px`,
  '--r-setup-rail-gap': `${String(STATION_SETUP_PX.railGap)}px`,
  '--r-setup-group-text': `${String(STATION_SETUP_PX.groupText)}px`,
  '--r-setup-group-tracking': STATION_SETUP_PX.groupTracking,
  '--r-setup-group-pad': `${String(STATION_SETUP_PX.groupPadTop)}px ${String(STATION_SETUP_PX.groupPadX)}px ${String(STATION_SETUP_PX.groupPadBottom)}px`,
  '--r-setup-group-pad-first': `0 ${String(STATION_SETUP_PX.groupPadX)}px ${String(STATION_SETUP_PX.groupPadBottom)}px`,
  '--r-setup-tab-min-h': `${String(STATION_SETUP_PX.tabMinH)}px`,
  '--r-setup-tab-pad': `${String(STATION_SETUP_PX.tabPadY)}px ${String(STATION_SETUP_PX.tabPadX)}px`,
  '--r-setup-tab-gap': `${String(STATION_SETUP_PX.tabGap)}px`,
  '--r-setup-tab-radius': `${String(STATION_SETUP_PX.tabRadius)}px`,
  '--r-setup-tab-text': `${String(STATION_SETUP_PX.tabText)}px`,
  '--r-setup-tab-icon': `${String(STATION_SETUP_PX.tabIcon)}px`,
  '--r-setup-pane-pad': `${String(STATION_SETUP_PX.panePadTop)}px ${String(STATION_SETUP_PX.panePadX)}px ${String(STATION_SETUP_PX.panePadBottom)}px`,
  '--r-setup-title-text': `${String(STATION_SETUP_PX.titleText)}px`,
  '--r-setup-title-tracking': STATION_SETUP_PX.titleTracking,
  '--r-setup-description-text': `${String(STATION_SETUP_PX.descriptionText)}px`,
  '--r-setup-description-gap': `${String(STATION_SETUP_PX.descriptionGap)}px`,
  '--r-setup-description-max-w': `${String(STATION_SETUP_PX.descriptionMaxCh)}ch`,
  '--r-setup-head-gap-below': `${String(STATION_SETUP_PX.headGapBelow)}px`,
  '--r-setup-tag-text': `${String(STATION_SETUP_PX.tagText)}px`,
  '--r-setup-tag-pad': `${String(STATION_SETUP_PX.tagPadY)}px ${String(STATION_SETUP_PX.tagPadX)}px`,
  '--r-setup-tag-radius': `${String(STATION_SETUP_PX.tagRadius)}px`,
  '--r-setup-foot-text': `${String(STATION_SETUP_PX.footText)}px`,
  '--r-setup-card-radius': `${String(STATION_SETUP_PX.cardRadius)}px`,
  '--r-setup-card-head-pad': `${String(STATION_SETUP_PX.cardHeadPadY)}px ${String(STATION_SETUP_PX.cardHeadPadX)}px`,
  '--r-setup-card-head-gap': `${String(STATION_SETUP_PX.cardHeadGap)}px`,
  '--r-setup-card-title-text': `${String(STATION_SETUP_PX.cardTitleText)}px`,
  '--r-setup-card-body-pad': `${String(STATION_SETUP_PX.cardBodyPad)}px`,
  '--r-setup-card-help-pad': `${String(STATION_SETUP_PX.cardHelpPadY)}px ${String(STATION_SETUP_PX.cardHelpPadX)}px`,
  '--r-setup-card-help-text': `${String(STATION_SETUP_PX.cardHelpText)}px`,
  '--r-setup-card-gap': `${String(STATION_SETUP_PX.cardGap)}px`,
  '--r-video-head-pad': `${String(STATION_SETUP_PX.videoHeadPadTop)}px ${String(STATION_SETUP_PX.videoPadX)}px 0`,
  '--r-video-eyebrow-text': `${String(STATION_SETUP_PX.eyebrowText)}px`,
  '--r-video-token-text': `${String(STATION_SETUP_PX.tokenText)}px`,
  '--r-video-token-pad': `${String(STATION_SETUP_PX.tokenPadY)}px ${String(STATION_SETUP_PX.tokenPadX)}px`,
  '--r-video-token-radius': `${String(STATION_SETUP_PX.tokenRadius)}px`,
  '--r-video-mode-pad': `${String(STATION_SETUP_PX.modePadTop)}px ${String(STATION_SETUP_PX.videoPadX)}px ${String(STATION_SETUP_PX.modePadBottom)}px`,
  '--r-video-mode-gap': `${String(STATION_SETUP_PX.modeGap)}px`,
  '--r-video-mode-text': `${String(STATION_SETUP_PX.modeText)}px`,
  '--r-video-mode-tracking': STATION_SETUP_PX.modeTracking,
  '--r-video-scan-text': `${String(STATION_SETUP_PX.scanText)}px`,
  '--r-video-metrics-margin': `0 ${String(STATION_SETUP_PX.videoPadX)}px`,
  '--r-video-metrics-pad': `${String(STATION_SETUP_PX.metricsPadTop)}px 0 ${String(STATION_SETUP_PX.metricsPadBottom)}px`,
  '--r-video-metric-text': `${String(STATION_SETUP_PX.metricText)}px`,
  '--r-video-metric-gap': `${String(STATION_SETUP_PX.metricGap)}px`,
  '--r-video-metric-value-text': `${String(STATION_SETUP_PX.metricValueText)}px`,
  '--r-video-metric-inset': `${String(STATION_SETUP_PX.metricInset)}px`,
  '--r-output-gap-above': `${String(STATION_SETUP_PX.outputsGapAbove)}px`,
  '--r-output-head-gap': `${String(STATION_SETUP_PX.outputsHeadGap)}px`,
  '--r-output-title-text': `${String(STATION_SETUP_PX.outputsTitleText)}px`,
  '--r-output-th-pad': `${String(STATION_SETUP_PX.thPadY)}px ${String(STATION_SETUP_PX.thPadX)}px`,
  '--r-output-th-text': `${String(STATION_SETUP_PX.thText)}px`,
  '--r-output-td-pad': `${String(STATION_SETUP_PX.tdPadY)}px ${String(STATION_SETUP_PX.tdPadX)}px`,
  '--r-output-td-text': `${String(STATION_SETUP_PX.tdText)}px`,
  '--r-output-slot-col-w': `${String(STATION_SETUP_PX.slotColW)}px`,
  '--r-output-slot-w': `${String(STATION_SETUP_PX.slotW)}px`,
  '--r-output-slot-h': `${String(STATION_SETUP_PX.slotH)}px`,
  '--r-output-slot-text': `${String(STATION_SETUP_PX.slotText)}px`,
  '--r-output-slot-radius': `${String(STATION_SETUP_PX.slotRadius)}px`,
  '--r-output-name-gap': `${String(STATION_SETUP_PX.outputNameGap)}px`,
  '--r-output-icon': `${String(STATION_SETUP_PX.outputIcon)}px`,
  '--r-output-state-text': `${String(STATION_SETUP_PX.stateText)}px`,
  '--r-output-state-gap': `${String(STATION_SETUP_PX.stateGap)}px`,
  '--r-output-state-icon': `${String(STATION_SETUP_PX.stateIcon)}px`,
  '--r-output-note-text': `${String(STATION_SETUP_PX.noteText)}px`,
  '--r-output-note-gap': `${String(STATION_SETUP_PX.noteGap)}px`,
  '--r-setup-details-text': `${String(STATION_SETUP_PX.detailsText)}px`,
  '--r-setup-details-gap': `${String(STATION_SETUP_PX.detailsGap)}px`,
  '--r-setup-details-body-gap': `${String(STATION_SETUP_PX.detailsBodyGap)}px`,
  '--r-setup-details-max-w': `${String(STATION_SETUP_PX.detailsMaxCh)}ch`,
  /*
   * ── `SETTINGS-DIALOG-01` §3 — the tab BODIES' own idioms, read by `controls.css`'s
   * `.cg-setup-field*`, `.cg-setup-empty*`, `.cg-setup-switch-row` and `.cg-setup-notice`.
   * Geometry only: every ink here is a role token (`design.md` §20.6's green rule).
   */
  '--r-setup-field-gap': `${String(STATION_SETUP_PX.fieldGap)}px`,
  '--r-setup-field-label-text': `${String(STATION_SETUP_PX.fieldLabelText)}px`,
  '--r-setup-field-input-min-h': `${String(STATION_SETUP_PX.fieldInputMinH)}px`,
  '--r-setup-field-input-pad': `${String(STATION_SETUP_PX.fieldInputPadY)}px ${String(STATION_SETUP_PX.fieldInputPadX)}px`,
  '--r-setup-field-input-radius': `${String(STATION_SETUP_PX.fieldInputRadius)}px`,
  '--r-setup-field-input-text': `${String(STATION_SETUP_PX.fieldInputText)}px`,
  '--r-setup-field-hint-text': `${String(STATION_SETUP_PX.fieldHintText)}px`,
  '--r-setup-fields-gap': `${String(STATION_SETUP_PX.fieldsRowGap)}px ${String(STATION_SETUP_PX.fieldsColGap)}px`,
  '--r-setup-fields-three': STATION_SETUP_PX.fieldsThreeRatio,
  '--r-setup-card-lede-text': `${String(STATION_SETUP_PX.cardLedeText)}px`,
  '--r-setup-card-lede-gap': `${String(STATION_SETUP_PX.cardLedeGap)}px`,
  '--r-setup-server-chip-box': `${String(STATION_SETUP_PX.serverChipBox)}px`,
  '--r-setup-server-chip-text': `${String(STATION_SETUP_PX.serverChipText)}px`,
  '--r-setup-server-chip-radius': `${String(STATION_SETUP_PX.serverChipRadius)}px`,
  '--r-setup-empty-pad': `${String(STATION_SETUP_PX.emptyPadY)}px ${String(STATION_SETUP_PX.emptyPadX)}px`,
  '--r-setup-empty-gap': `${String(STATION_SETUP_PX.emptyGap)}px`,
  '--r-setup-empty-icon-box': `${String(STATION_SETUP_PX.emptyIconBox)}px`,
  '--r-setup-empty-icon-radius': `${String(STATION_SETUP_PX.emptyIconRadius)}px`,
  '--r-setup-empty-title-text': `${String(STATION_SETUP_PX.emptyTitleText)}px`,
  '--r-setup-empty-body-text': `${String(STATION_SETUP_PX.emptyBodyText)}px`,
  '--r-setup-empty-body-gap': `${String(STATION_SETUP_PX.emptyBodyGap)}px`,
  '--r-setup-switch-row-pad-top': `${String(STATION_SETUP_PX.switchRowPadTop)}px`,
  '--r-setup-switch-row-gap': `${String(STATION_SETUP_PX.switchRowGap)}px`,
  '--r-setup-notice-pad': `${String(STATION_SETUP_PX.noticePadY)}px ${String(STATION_SETUP_PX.noticePadX)}px`,
  '--r-setup-notice-gap': `${String(STATION_SETUP_PX.noticeGap)}px`,
  '--r-setup-notice-radius': `${String(STATION_SETUP_PX.noticeRadius)}px`,
  '--r-setup-notice-gap-below': `${String(STATION_SETUP_PX.noticeGapBelow)}px`,
  '--r-setup-notice-title-text': `${String(STATION_SETUP_PX.noticeTitleText)}px`,
  '--r-setup-notice-body-text': `${String(STATION_SETUP_PX.noticeBodyText)}px`,
  '--r-setup-notice-icon': `${String(STATION_SETUP_PX.noticeIcon)}px`,
  '--r-setup-notice-icon-offset': `${String(STATION_SETUP_PX.noticeIconOffset)}px`,
  '--r-setup-notice-title-gap-below': `${String(STATION_SETUP_PX.noticeTitleGapBelow)}px`,
  /*
   * ══ `SETTINGS-MATCH-02` — THE STATION-SETUP SURFACE FAMILY ══════════════════════════════
   *
   * 🔴 **DEFECT 1, AND ITS ROOT CAUSE IS THE SENTENCE THAT USED TO SIT ABOVE `STATION_SETUP_PX`.**
   * It read: _"its OWN palette … is NOT the console's approved palette. Only the GEOMETRY is
   * transcribed here; every colour is a role token."_ That is RIGHT about the mint and WRONG
   * about the NEUTRALS, and the neutrals were swept out with it. Measured, that swap inverted
   * the dialog's depth:
   *
   *   | surface        | reference | what we painted                |
   *   | dialog ground  | `#15191f` | `#141b25` (`--r-surface`)      |
   *   | a CARD on it   | `#191e25` | `#0b1017` (`--r-surface-sunken`)|
   *
   * The reference's card is one step LIGHTER than the ground it sits on; ours was the darkest
   * value in the whole palette, so every box in the dialog read as a HOLE rather than as a
   * card. Owner, on the built dialog, twice: _"the box/card colours inside the modal are
   * wrong."_ That is this.
   *
   * ⚠ **SCOPED TO THIS FRAME, and that is the whole design of this block.** These are not a
   * second console palette: nothing outside `[data-modal-size='fixed']` reads them, so the
   * layer table, the Inspector and every panel keep `--r-surface*` exactly as they are. The
   * reference's Station setup IS a separate shadow family with its own surfaces (`design.md`
   * §14.3), and this is that family, named by ROLE so a later retune is one edit per role.
   *
   * ⚠ **THE INK IS NOT TAKEN, and the reason is a measurement rather than a preference.** The
   * reference's three ranks are `#f1f4f7` / `#b8c0cc` / `#8e99a9`; ours are `#eef3f9` /
   * `#bbc8d7` / `#8e9eaf`. The largest per-channel delta across all three is ELEVEN of 255 and
   * the smallest is zero — invisible on screen, and adopting them would mint three more ink
   * tokens for a difference no operator can see while splitting the console's type ramp in
   * two. The ink stays the console's.
   */
  /** The frame's own ground — `.settings{background:var(--surface)}`. */
  '--r-setup-surface': '#15191f',
  /** The rail's ground — `.sidebar{background:#11151b}`, one step under the frame. */
  '--r-setup-rail-bg': '#11151b',
  /** A CARD — `.card{background:#191e25;border:1px solid var(--line)}`. RAISED off the frame. */
  '--r-setup-card-bg': '#191e25',
  '--r-setup-card-line': '#2b323c',
  /** The quieter rule INSIDE a card — `--line-soft`: under a card head, between two rows. */
  '--r-setup-rule': '#232a33',
  /** A card's HELP band — `.card-help{background:#161b22}`, under a rule. */
  '--r-setup-help-bg': '#161b22',
  /** A table's head band — `.data-table th{background:#14191f}`. */
  '--r-setup-table-head-bg': '#14191f',
  /** A record row under the pointer — `.data-table tbody tr:hover{background:#1d242d}`. */
  '--r-setup-row-hover': '#1d242d',
  /** A FIELD in this dialog — `.input{background:#10151c;border-color:#3b4552}`, hover `#596575`. */
  '--r-setup-field-bg': '#10151c',
  '--r-setup-field-line': '#3b4552',
  '--r-setup-field-hover-line': '#596575',
  /** The INLINE table input — `.layer-table .input{background:#121820;border-color:transparent}`, hover `#414f5f`. */
  '--r-setup-inline-input-bg': '#121820',
  '--r-setup-inline-input-hover-line': '#414f5f',
  /** A chip — `.tag{background:#1c222a;border-color:#35404c}`; the mono chips take the raised one. */
  '--r-setup-chip-bg': '#1c222a',
  '--r-setup-chip-line': '#35404c',
  /** A mono token chip — `.slot` / `.address-chip` / `.station-avatar` grounds. */
  '--r-setup-token-bg': '#202732',
  '--r-setup-token-line': '#38414d',
  /** A delimiter's own characters — `.delimiter-symbol{background:#11171e;border-color:#39434f}`. */
  '--r-setup-symbol-bg': '#11171e',
  '--r-setup-symbol-line': '#39434f',
  /**
   * THE DIALOG'S BUTTON — `.btn{background:#242b34;border-color:var(--line)}`, hover
   * `#303945` / `#465363`; `.icon-btn:hover{background:#2a323d}`.
   */
  '--r-setup-btn-bg': '#242b34',
  '--r-setup-btn-hover-bg': '#303945',
  '--r-setup-btn-hover-line': '#465363',
  '--r-setup-icon-btn-hover-bg': '#2a323d',
  /** An EMPTY tile — `.empty-icon{background:#232b35;border:1px dashed #485465}`. */
  '--r-setup-empty-icon-bg': '#232b35',
  '--r-setup-empty-icon-line': '#485465',
  /**
   * ── 🔴 `SETTINGS-POLISH-04` §2 / §3 / §4 — **THIS FAMILY'S CAUTION AND DANGER PAIRS** ────
   *
   * The block above takes this dialog's SURFACES from the reference's shadow stylesheet. These
   * are the same decision one role along: the shadow sheet declares its own `--amber:#f5c879`
   * / `--amber-bg:#30281c` and `--red:#ffaaa7` / `--red-bg:#352224`, and the console's
   * `REF_AMBER` (`#f3cd88`) / `REF_RED_BG` (`#3a242a`) come from the OTHER reference file —
   * `04-playout-layers.html`'s variable block. **Two drawings, two palettes**, and this dialog
   * has been taking the shadow sheet's since `SETTINGS-MATCH-02`.
   *
   * ⚠ **SCOPED, exactly like the surfaces.** Nothing outside this dialog reads them, so the
   * audit log's `failed` tag and the console's own confirm keep the values they were measured
   * at. The alternative — moving `REF_RED_BG` for everyone — would re-point two surfaces that
   * were measured against a different drawing in order to fix one that was not.
   *
   * The deltas are small (the reds differ by 5/18/6 of 255) and that is the point: the fault
   * §2 names is not the hue, it is that this dialog's destructive button was wearing the
   * console's SOLID AMBER. Having decided to give it the reference's red outline, it takes the
   * reference's red.
   */
  /** `.btn.danger{background:var(--red-bg);border-color:#684044;color:var(--red)}`. */
  '--r-setup-danger-ink': '#ffaaa7',
  '--r-setup-danger-bg': '#352224',
  '--r-setup-danger-line': '#684044',
  /** `.btn.danger:hover{background:#482a2e}` — the outline FILLS on intent, never at rest. */
  '--r-setup-danger-hover-bg': '#482a2e',
  /** `--amber`: the ink `.foot-message.warning`, `.notice` and `.tag.warn` all take. */
  '--r-setup-caution-ink': '#f5c879',
  /**
   * THE STANDING NOTICE's own pair — and it is NOT `--amber-bg`.
   *
   * `.notice{border:1px solid #54452d;background:#29241c}` states both literally; the
   * `--amber-bg` token (`#30281c`) is what `.tag.warn` takes. A band and a chip are two sizes
   * of the same signal and the drawing gives them two grounds, so the band gets its own.
   */
  '--r-setup-notice-bg': '#29241c',
  '--r-setup-notice-line': '#54452d',
  /** `.notice p{color:#cdbd9e}` — the explanation under the title, a rank quieter than it. */
  '--r-setup-notice-body-ink': '#cdbd9e',
  /**
   * `SETTINGS-POLISH-04` §8 — the NOT-RUNNING row's wash: `.output-warning td{background:
   * #28241d40}`. **25 % alpha, and the alpha is the design** — it composites over whatever the
   * cell already has rather than replacing it, so the row rule under it still reads. Ours was
   * the opaque `--r-caution-bg`, which painted the rule out.
   */
  '--r-setup-output-warning-wash': 'rgba(40, 36, 29, 0.25)',
  /**
   * 🔴 THE MINT, AND WHERE OWNER ANSWER A4 PUTS IT.
   *
   * A4 reads _"the outer primary is `--r-accent`; the reference's MINT belongs only to its
   * shadow family."_ **This dialog IS that shadow family**, so A4 LOCALISES the mint here
   * rather than forbidding it — it is not a licence anywhere else, and nothing outside
   * `[data-modal-size='fixed']` may read these.
   *
   * ⚠ **IT IS KEPT OFF EVERYTHING THAT STATES AIR**, which is the standing rule (`design.md`
   * §20.6) and is why this list is short: the SELECTED rail item, the rail's unapplied COUNT
   * chip, the dialog's own `primary` (`Add …` / `Apply …`), and a dirty row's marks. No
   * surface in this dialog reports air, so none of those can be mistaken for one — and the
   * A/B server chip stays OFF the mint deliberately, because a green mark beside a SERVER'S
   * NAME is exactly the health claim the rule forbids.
   */
  '--r-setup-accent': '#8ce6d1',
  /** The dark ink a filled mint control owes — `.btn.primary{color:#10251f}`. */
  '--r-setup-accent-ink': '#10251f',
  /** …and the count chip's, which the reference draws one notch different (`#152720`). */
  '--r-setup-count-ink': '#152720',
  /** `.btn.primary:hover{background:#acf3e2}`. */
  '--r-setup-accent-hover': '#acf3e2',
  /** The SELECTED rail item — `.tab[aria-selected=true]{background:#20322f;border-color:#314b45;color:#c8f9ed}`. */
  '--r-setup-selected-bg': '#20322f',
  '--r-setup-selected-line': '#314b45',
  '--r-setup-selected-ink': '#c8f9ed',
  /** …and a rail item under the pointer — `.tab:hover{background:#1c222b}`. */
  '--r-setup-tab-hover-bg': '#1c222b',
  /** A DIRTY row's input edge — `.layer-table tr.edited .input{border-color:#48786b}`. */
  '--r-setup-dirty-line': '#48786b',
  /**
   * THE VIDEO-FORMAT CARD — `.video-card`, the one card the reference tints:
   * `linear-gradient(115deg,#1b2728 0%,#1b2229 65%,#1b2229 100%)` over a `#35463f` edge.
   * A GRADIENT and not a hue: it is the faintest green-grey wash, which is why it reads as
   * "this card is the channel itself" without claiming anything about air.
   */
  '--r-setup-video-bg': 'linear-gradient(115deg, #1b2728 0%, #1b2229 65%, #1b2229 100%)',
  '--r-setup-video-line': '#35463f',
  /** A SWITCH — `.switch-track{background:#39424f;border-color:#515d6c}` with a `#d8dee6` knob. */
  '--r-setup-switch-bg': '#39424f',
  '--r-setup-switch-line': '#515d6c',
  '--r-setup-switch-knob': '#d8dee6',
  /** …and the knob's ink once the track is mint — `.switch input:checked+.switch-track:after`. */
  '--r-setup-switch-knob-on': '#17332b',
  /*
   * ── `SETTINGS-MATCH-02` — the GEOMETRY for the four bodies and the frame's remaining chrome.
   * Read by `controls.css`'s `.cg-setup-*`, `.cg-rail-*`, `.cg-layer-*` and `.cg-resource-*`.
   */
  '--r-setup-emblem-box': `${String(STATION_SETUP_PX.emblemBox)}px`,
  '--r-setup-emblem-radius': `${String(STATION_SETUP_PX.emblemRadius)}px`,
  '--r-setup-emblem-glyph': `${String(STATION_SETUP_PX.emblemGlyph)}px`,
  '--r-setup-title-tracking-frame': STATION_SETUP_PX.titleTrackingFrame,
  '--r-setup-nav-count-box': `${String(STATION_SETUP_PX.navCountBox)}px`,
  '--r-setup-nav-count-radius': `${String(STATION_SETUP_PX.navCountRadius)}px`,
  '--r-setup-nav-count-text': `${String(STATION_SETUP_PX.navCountText)}px`,
  '--r-setup-nav-symbol-icon': `${String(STATION_SETUP_PX.navSymbolIcon)}px`,
  '--r-setup-rail-foot-pad': `${String(STATION_SETUP_PX.railFootPadTop)}px ${String(STATION_SETUP_PX.railFootPadX)}px 0`,
  '--r-setup-station-card-pad-top': `${String(STATION_SETUP_PX.stationCardPadTop)}px`,
  '--r-setup-station-card-gap': `${String(STATION_SETUP_PX.stationCardGap)}px`,
  '--r-setup-station-avatar-box': `${String(STATION_SETUP_PX.stationAvatarBox)}px`,
  '--r-setup-station-avatar-radius': `${String(STATION_SETUP_PX.stationAvatarRadius)}px`,
  '--r-setup-station-avatar-text': `${String(STATION_SETUP_PX.stationAvatarText)}px`,
  '--r-setup-station-name-text': `${String(STATION_SETUP_PX.stationNameText)}px`,
  '--r-setup-station-host-text': `${String(STATION_SETUP_PX.stationHostText)}px`,
  '--r-setup-station-host-gap': `${String(STATION_SETUP_PX.stationHostGap)}px`,
  '--r-setup-foot-message-gap': `${String(STATION_SETUP_PX.footMessageGap)}px`,
  '--r-setup-foot-message-icon': `${String(STATION_SETUP_PX.footMessageIcon)}px`,
  '--r-setup-foot-actions-gap': `${String(STATION_SETUP_PX.footActionsGap)}px`,
  '--r-setup-btn-min-h': `${String(STATION_SETUP_PX.btnMinH)}px`,
  '--r-setup-btn-pad': `${String(STATION_SETUP_PX.btnPadY)}px ${String(STATION_SETUP_PX.btnPadX)}px`,
  '--r-setup-btn-radius': `${String(STATION_SETUP_PX.btnRadius)}px`,
  '--r-setup-btn-text': `${String(STATION_SETUP_PX.btnText)}px`,
  '--r-setup-btn-gap': `${String(STATION_SETUP_PX.btnGap)}px`,
  '--r-setup-btn-icon': `${String(STATION_SETUP_PX.btnIcon)}px`,
  '--r-setup-icon-btn-box': `${String(STATION_SETUP_PX.iconBtnBox)}px`,
  '--r-setup-icon-btn-radius': `${String(STATION_SETUP_PX.iconBtnRadius)}px`,
  '--r-setup-tag-icon': `${String(STATION_SETUP_PX.tagIcon)}px`,
  '--r-setup-tag-gap': `${String(STATION_SETUP_PX.tagGap)}px`,
  '--r-setup-list-head-gap-below': `${String(STATION_SETUP_PX.listHeadGapBelow)}px`,
  '--r-setup-list-head-gap': `${String(STATION_SETUP_PX.listHeadGap)}px`,
  '--r-setup-list-count-gap': `${String(STATION_SETUP_PX.listCountGap)}px`,
  '--r-setup-resource-icon-box': `${String(STATION_SETUP_PX.resourceIconBox)}px`,
  '--r-setup-resource-icon-radius': `${String(STATION_SETUP_PX.resourceIconRadius)}px`,
  '--r-setup-resource-gap': `${String(STATION_SETUP_PX.resourceGap)}px`,
  '--r-setup-resource-pad': `${String(STATION_SETUP_PX.resourcePadY)}px ${String(STATION_SETUP_PX.resourcePadX)}px`,
  '--r-setup-resource-title-gap': `${String(STATION_SETUP_PX.resourceTitleGap)}px`,
  '--r-setup-resource-title-text': `${String(STATION_SETUP_PX.resourceTitleText)}px`,
  '--r-setup-resource-type-text': `${String(STATION_SETUP_PX.resourceTypeText)}px`,
  '--r-setup-resource-type-tracking': STATION_SETUP_PX.resourceTypeTracking,
  '--r-setup-resource-desc-text': `${String(STATION_SETUP_PX.resourceDescText)}px`,
  '--r-setup-resource-desc-gap': `${String(STATION_SETUP_PX.resourceDescGap)}px`,
  '--r-setup-resource-actions-gap': `${String(STATION_SETUP_PX.resourceActionsGap)}px`,
  '--r-setup-band-gap-above': `${String(STATION_SETUP_PX.bandGapAbove)}px`,
  '--r-setup-band-fields-gap': `${String(STATION_SETUP_PX.bandFieldsGap)}px`,
  '--r-setup-band-fields-max-w': `${String(STATION_SETUP_PX.bandFieldsMaxW)}px`,
  '--r-setup-band-dash-w': `${String(STATION_SETUP_PX.bandDashW)}px`,
  '--r-setup-band-dash-pad-bottom': `${String(STATION_SETUP_PX.bandDashPadBottom)}px`,
  '--r-setup-band-summary-text': `${String(STATION_SETUP_PX.bandSummaryText)}px`,
  '--r-setup-band-summary-gap': `${String(STATION_SETUP_PX.bandSummaryGap)}px`,
  '--r-setup-delimiter-td-pad-y': `${String(STATION_SETUP_PX.delimiterTdPadY)}px`,
  '--r-setup-delimiter-actions-w': `${String(STATION_SETUP_PX.delimiterActionsW)}px`,
  '--r-setup-symbol-min-w': `${String(STATION_SETUP_PX.delimiterSymbolMinW)}px`,
  '--r-setup-symbol-min-h': `${String(STATION_SETUP_PX.delimiterSymbolMinH)}px`,
  '--r-setup-symbol-pad': `${String(STATION_SETUP_PX.delimiterSymbolPadY)}px ${String(STATION_SETUP_PX.delimiterSymbolPadX)}px`,
  '--r-setup-symbol-radius': `${String(STATION_SETUP_PX.delimiterSymbolRadius)}px`,
  '--r-setup-symbol-text': `${String(STATION_SETUP_PX.delimiterSymbolText)}px`,
  '--r-setup-meaning-text': `${String(STATION_SETUP_PX.delimiterMeaningText)}px`,
  '--r-setup-meaning-gap': `${String(STATION_SETUP_PX.delimiterMeaningGap)}px`,
  '--r-setup-list-bottom-gap-above': `${String(STATION_SETUP_PX.delimiterBottomGapAbove)}px`,
  '--r-setup-list-bottom-gap': `${String(STATION_SETUP_PX.delimiterBottomGap)}px`,
  '--r-setup-list-bottom-text': `${String(STATION_SETUP_PX.delimiterBottomText)}px`,
  '--r-setup-reset-link-pad': `${String(STATION_SETUP_PX.resetLinkPadY)}px 0`,
  '--r-setup-reset-link-underline': `${String(STATION_SETUP_PX.resetLinkUnderline)}px`,
  '--r-setup-summary-gap': `${String(STATION_SETUP_PX.summaryGap)}px`,
  '--r-setup-summary-gap-above': `${String(STATION_SETUP_PX.summaryGapAbove)}px`,
  '--r-setup-filter-gap': `${String(STATION_SETUP_PX.filterGap)}px`,
  /**
   * 🔴 `SETTINGS-POLISH-04`, owner on the plant: _«فاصله بین متن Visibility and layer safety و
   * سرچ باکس کمه»_ — the gap between that line and the search box is too small. **It was
   * ZERO.** Measured on the Layers pane at 1280 × 800: the `<details>` bottom at y = 299 and
   * the search field's top at y = 299, touching, while the same line had 17 px of air ABOVE it.
   *
   * ── WHY THE SPACING VANISHED, WHICH IS THE PART WORTH KEEPING ──────────────────────────
   *
   * The pane's rhythm comes from `.cg-setup-body`'s 20 px flex GAP, and a flex gap applies
   * BETWEEN THE CHILDREN OF THE BOX THAT DECLARES IT. `SetupSection` renders the helper
   * `<details>` OUTSIDE that box — head, helper, body — so the first card's spacing came from
   * the gap and the helper's did not come from anywhere. Nothing was deleted and nothing was
   * overridden; the element simply sat in the one position the column's rhythm does not reach.
   *
   * ⚠ **`--r-setup-filter-margin` USED TO LIVE ON THIS LINE AND WAS READ BY NOBODY.** It was
   * the reference's `.filter-bar{margin:21px 0 15px}` as a shorthand, unused because those
   * margins would ADD to the body's gap rather than replace it (`.cg-setup-filter` says so).
   * A declared value nothing renders is worse than an absent one — it answers "is this spacing
   * handled?" with a yes. Its `21px` half is what the drawing actually spends between the
   * helper and the first thing under it, so that is what this token is, named for the RELATION
   * it spaces rather than for the one element that happens to be below it today.
   */
  '--r-setup-details-gap-below': `${String(STATION_SETUP_PX.filterGapAbove)}px`,
  '--r-setup-search-max-w': `${String(STATION_SETUP_PX.searchMaxW)}px`,
  '--r-setup-search-icon': `${String(STATION_SETUP_PX.searchIcon)}px`,
  '--r-setup-search-icon-inset': `${String(STATION_SETUP_PX.searchIconInset)}px`,
  '--r-setup-search-pad-start': `${String(STATION_SETUP_PX.searchPadStart)}px`,
  '--r-setup-search-text': `${String(STATION_SETUP_PX.searchText)}px`,
  '--r-setup-check-gap': `${String(STATION_SETUP_PX.checkGap)}px`,
  '--r-setup-check-text': `${String(STATION_SETUP_PX.checkText)}px`,
  '--r-setup-check-box': `${String(STATION_SETUP_PX.checkBox)}px`,
  '--r-setup-results-text': `${String(STATION_SETUP_PX.resultsText)}px`,
  '--r-layer-table-min-w': `${String(STATION_SETUP_PX.layerTableMinW)}px`,
  '--r-layer-cell-pad': `${String(STATION_SETUP_PX.layerThPadY)}px ${String(STATION_SETUP_PX.layerThPadX)}px`,
  '--r-layer-col-layer-w': `${String(STATION_SETUP_PX.layerColLayerW)}px`,
  '--r-layer-col-show-w': `${String(STATION_SETUP_PX.layerColShowW)}px`,
  '--r-layer-col-name-w': `${String(STATION_SETUP_PX.layerColNamePct)}%`,
  '--r-layer-id-text': `${String(STATION_SETUP_PX.layerIdText)}px`,
  '--r-layer-row-number-text': `${String(STATION_SETUP_PX.rowNumberText)}px`,
  '--r-layer-row-number-gap': `${String(STATION_SETUP_PX.rowNumberGap)}px`,
  '--r-layer-template-text': `${String(STATION_SETUP_PX.templateNameText)}px`,
  '--r-layer-occupied-text': `${String(STATION_SETUP_PX.occupiedText)}px`,
  '--r-layer-occupied-gap': `${String(STATION_SETUP_PX.occupiedGap)}px`,
  '--r-layer-occupied-icon': `${String(STATION_SETUP_PX.occupiedIcon)}px`,
  '--r-layer-input-min-h': `${String(STATION_SETUP_PX.layerInputMinH)}px`,
  '--r-layer-input-pad': `${String(STATION_SETUP_PX.layerInputPadY)}px ${String(STATION_SETUP_PX.layerInputPadX)}px`,
  '--r-layer-input-text': `${String(STATION_SETUP_PX.layerInputText)}px`,
  '--r-layer-dirty-inset': `${String(STATION_SETUP_PX.dirtyInset)}px`,
  '--r-layer-footnote-text': `${String(STATION_SETUP_PX.footnoteText)}px`,
  '--r-layer-footnote-gap-above': `${String(STATION_SETUP_PX.footnoteGapAbove)}px`,
  '--r-layer-footnote-gap': `${String(STATION_SETUP_PX.footnoteGap)}px`,
  '--r-layer-footnote-icon': `${String(STATION_SETUP_PX.footnoteIcon)}px`,
  '--r-setup-beds-head-margin': `${String(STATION_SETUP_PX.bedsHeadGapAbove)}px 0 ${String(STATION_SETUP_PX.bedsHeadGapBelow)}px`,
  '--r-setup-beds-head-text': `${String(STATION_SETUP_PX.bedsHeadText)}px`,
  '--r-setup-beds-line-text': `${String(STATION_SETUP_PX.bedsLineText)}px`,
  '--r-setup-beds-line-gap': `${String(STATION_SETUP_PX.bedsLineGap)}px`,
  '--r-setup-empty-state-pad': `${String(STATION_SETUP_PX.emptyStatePadY)}px ${String(STATION_SETUP_PX.emptyStatePadX)}px`,
  '--r-setup-empty-state-icon': `${String(STATION_SETUP_PX.emptyStateIcon)}px`,
  '--r-setup-empty-state-icon-gap': `${String(STATION_SETUP_PX.emptyStateIconGap)}px`,
  '--r-setup-empty-state-text': `${String(STATION_SETUP_PX.emptyStateText)}px`,
  '--r-setup-empty-state-gap': `${String(STATION_SETUP_PX.emptyStateGap)}px`,
  '--r-setup-switch-w': `${String(STATION_SETUP_PX.switchW)}px`,
  '--r-setup-switch-h': `${String(STATION_SETUP_PX.switchH)}px`,
  '--r-setup-switch-radius': `${String(STATION_SETUP_PX.switchRadius)}px`,
  '--r-setup-switch-knob-box': `${String(STATION_SETUP_PX.switchKnob)}px`,
  '--r-setup-switch-knob-inset': `${String(STATION_SETUP_PX.switchKnobInset)}px`,
  '--r-setup-switch-travel': `${String(STATION_SETUP_PX.switchTravel)}px`,
  '--r-setup-chips-gap': `${String(STATION_SETUP_PX.chipsGap)}px`,
  '--r-setup-chips-gap-above': `${String(STATION_SETUP_PX.chipsGapAbove)}px`,
  '--r-setup-address-chip-pad': `${String(STATION_SETUP_PX.addressChipPadY)}px ${String(STATION_SETUP_PX.addressChipPadX)}px`,
  '--r-setup-address-chip-radius': `${String(STATION_SETUP_PX.addressChipRadius)}px`,
  '--r-setup-address-chip-text': `${String(STATION_SETUP_PX.addressChipText)}px`,
  '--r-setup-help-icon': `${String(STATION_SETUP_PX.helpIcon)}px`,
  '--r-setup-help-icon-offset': `${String(STATION_SETUP_PX.helpIconOffset)}px`,
  '--r-setup-help-gap': `${String(STATION_SETUP_PX.helpGap)}px`,
  '--r-setup-field-mono-text': `${String(STATION_SETUP_PX.fieldMonoText)}px`,
  /*
   * ── `SETTINGS-MATCH-02` §8 — THE SUB-DIALOG FAMILY. Read by `controls.css`'s `.cg-sub-*`
   * and `.cg-kind-*` rules and by `Modal`'s `record` size.
   */
  '--r-modal-w-record': `min(${String(STATION_SETUP_PX.subW)}px, calc(100vw - ${String(STATION_SETUP_PX.subInset)}px))`,
  '--r-sub-head-pad': `${String(STATION_SETUP_PX.subHeadPadTop)}px ${String(STATION_SETUP_PX.subHeadPadX)}px ${String(STATION_SETUP_PX.subHeadPadBottom)}px`,
  '--r-sub-head-gap': `${String(STATION_SETUP_PX.subHeadGap)}px`,
  '--r-sub-title-text': `${String(STATION_SETUP_PX.subTitleText)}px`,
  '--r-sub-body-pad': `${String(STATION_SETUP_PX.subBodyPadY)}px ${String(STATION_SETUP_PX.subBodyPadX)}px`,
  '--r-sub-fields-gap': `${String(STATION_SETUP_PX.subFieldsGap)}px`,
  '--r-sub-foot-pad': `${String(STATION_SETUP_PX.subFootPadY)}px ${String(STATION_SETUP_PX.subFootPadX)}px`,
  '--r-sub-foot-gap': `${String(STATION_SETUP_PX.subFootGap)}px`,
  /** The sub-dialog's footer band — `.sub-foot{background:#12171e}`, a step under its body. */
  '--r-sub-foot-bg': '#12171e',
  '--r-sub-lede-text': `${String(STATION_SETUP_PX.subLedeText)}px`,
  '--r-sub-lede-gap': `${String(STATION_SETUP_PX.subLedeGap)}px`,
  '--r-kind-options-gap': `${String(STATION_SETUP_PX.kindOptionsGap)}px`,
  '--r-kind-option-min-h': `${String(STATION_SETUP_PX.kindOptionMinH)}px`,
  '--r-kind-option-radius': `${String(STATION_SETUP_PX.kindOptionRadius)}px`,
  '--r-kind-option-text': `${String(STATION_SETUP_PX.kindOptionText)}px`,
  '--r-kind-option-icon': `${String(STATION_SETUP_PX.kindOptionIcon)}px`,
  '--r-kind-option-basis': `${String(STATION_SETUP_PX.kindOptionBasis)}px`,
  /** A kind option — `#11171e` on a `#394451` edge; SELECTED `#1d342e` / `#629b89` / `#c6f4e7`. */
  '--r-kind-option-bg': '#11171e',
  '--r-kind-option-line': '#394451',
  '--r-kind-option-sel-bg': '#1d342e',
  '--r-kind-option-sel-line': '#629b89',
  '--r-kind-option-sel-ink': '#c6f4e7',
  '--r-confirm-icon-box': `${String(STATION_SETUP_PX.confirmIconBox)}px`,
  '--r-confirm-icon-radius': `${String(STATION_SETUP_PX.confirmIconRadius)}px`,
  '--r-confirm-icon-gap': `${String(STATION_SETUP_PX.confirmIconGap)}px`,
  '--r-confirm-copy-text': `${String(STATION_SETUP_PX.confirmCopyText)}px`,
  /** The destructive emblem — `.confirm-icon` on `--red-bg` behind a `#684044` edge. */
  '--r-confirm-icon-line': '#684044',
  '--r-preview-pad': `${String(STATION_SETUP_PX.previewPad)}px`,
  '--r-preview-radius': `${String(STATION_SETUP_PX.previewRadius)}px`,
  '--r-preview-gap-above': `${String(STATION_SETUP_PX.previewGapAbove)}px`,
  '--r-preview-eyebrow-gap': `${String(STATION_SETUP_PX.previewEyebrowGap)}px`,
  '--r-preview-chip-pad': `${String(STATION_SETUP_PX.previewChipPadY)}px ${String(STATION_SETUP_PX.previewChipPadX)}px`,
  '--r-preview-chip-radius': `${String(STATION_SETUP_PX.previewChipRadius)}px`,
  '--r-preview-chip-gap': `${String(STATION_SETUP_PX.previewChipGap)}px`,
  /** A preview chip — `.split-item{background:#20332f;border-color:#355149;color:#b5e3d5}`. */
  '--r-preview-chip-bg': '#20332f',
  '--r-preview-chip-line': '#355149',
  '--r-preview-chip-ink': '#b5e3d5',
  /*
   * ── `RUNTIME-REDESIGN-01` PHASE 8 — the template picker (`LIBRARY_PX`) and the audit log
   * (`AUDIT_LOG_PX`), cited to the RENDERED reference; see the constants' notes. Read by
   * `controls.css`'s `.cg-tpl-*`, `.cg-audit-*` and `.cg-tag*` rules.
   */
  '--r-tpl-aside-w': `${String(LIBRARY_PX.asideW)}px`,
  '--r-tpl-aside-pad': `${String(LIBRARY_PX.asidePad)}px`,
  /**
   * The aside's ground — the reference's `.template-detail{background:#111c28}`. Under the
   * narrow stale-hex test it is ADOPTED: absent from the drawing's nineteen `:root` colours,
   * but it is NOT a hex this app retired in Phase 2 (§7's "was" column), so it fails (b) and is
   * a design decision rather than a leftover — the same verdict, and for the same reason, as
   * row 38's `#101722`. It is a fourth near-black, one step under `--r-surface`, which is what
   * makes a column read as a SIDE of the dialog rather than another panel in it.
   */
  '--r-tpl-aside-bg': '#111c28',
  /**
   * `RUNTIME-REPAIR-05` — the SELECTED list row, from `.template-row.selected{background:
   * #203649;border-color:#547d9a}`, measured by opening the dialog.
   *
   * Both ADOPTED under the narrow stale-hex test: absent from the reference's nineteen
   * declared `:root` colours, and NEITHER is a hex this app retired in Phase 2 (§7's "was"
   * column), so they fail (b) and are design decisions rather than leftovers.
   *
   * ⚠ They are NOT the layer table's selection, and must not be pointed at it. That one is a
   * 2 px accent FRAME over a wash, tuned against a 67 px row carrying six verbs and a muted
   * ink at its AA floor (§20.1); this is an 81 px list row whose only job is to be the one
   * the footer will act on. Two surfaces, two problems.
   */
  '--r-tpl-row-sel-bg': '#203649',
  '--r-tpl-row-sel-line': '#547d9a',
  '--r-tpl-verdict-pad': `${String(LIBRARY_PX.verdictPadY)}px ${String(LIBRARY_PX.verdictPadX)}px`,
  '--r-tpl-verdict-radius': `${String(LIBRARY_PX.verdictRadius)}px`,
  '--r-tpl-tools-pad': `${String(LIBRARY_PX.toolsPadY)}px ${String(LIBRARY_PX.toolsPadX)}px`,
  '--r-tpl-filter-pad-x': `${String(LIBRARY_PX.filterPadX)}px`,
  '--r-tpl-manage-btn-h': `${String(LIBRARY_PX.manageBtnH)}px`,
  '--r-tpl-manage-btn-radius': `${String(LIBRARY_PX.manageBtnRadius)}px`,
  '--r-tpl-manage-btn-pad': `${String(LIBRARY_PX.manageBtnPadY)}px ${String(LIBRARY_PX.manageBtnPadX)}px`,
  '--r-tpl-manage-btn-text': `${String(LIBRARY_PX.manageBtnText)}px`,
  '--r-tpl-manage-row-h': `${String(LIBRARY_PX.manageRowH)}px`,
  '--r-tpl-manage-row-pad': `${String(LIBRARY_PX.manageRowPad)}px`,
  '--r-tpl-manage-row-gap': `${String(LIBRARY_PX.manageRowGap)}px`,
  '--r-tpl-manage-pad': `${String(LIBRARY_PX.managePadY)}px ${String(LIBRARY_PX.managePadX)}px`,
  '--r-tpl-tools-pad-bottom': `${String(LIBRARY_PX.toolsPadBottom)}px`,
  '--r-tpl-tools-gap': `${String(LIBRARY_PX.toolsGap)}px`,
  '--r-tpl-search-h': `${String(LIBRARY_PX.searchH)}px`,
  '--r-tpl-search-pad': `${String(LIBRARY_PX.searchPadY)}px ${String(LIBRARY_PX.searchPadX)}px ${String(LIBRARY_PX.searchPadY)}px ${String(LIBRARY_PX.searchPadStart)}px`,
  '--r-tpl-search-radius': `${String(LIBRARY_PX.searchRadius)}px`,
  '--r-tpl-search-text': `${String(LIBRARY_PX.searchText)}px`,
  '--r-tpl-search-icon': `${String(LIBRARY_PX.searchIcon)}px`,
  '--r-tpl-search-icon-inset': `${String(LIBRARY_PX.searchIconInset)}px`,
  '--r-tpl-filter-pad-bottom': `${String(LIBRARY_PX.filterPadBottom)}px`,
  '--r-tpl-chip-h': `${String(LIBRARY_PX.chipH)}px`,
  '--r-tpl-chip-pad': `${String(LIBRARY_PX.chipPadY)}px ${String(LIBRARY_PX.chipPadX)}px`,
  '--r-tpl-chip-radius': `${String(LIBRARY_PX.chipRadius)}px`,
  '--r-tpl-chip-text': `${String(LIBRARY_PX.chipText)}px`,
  '--r-tpl-chip-gap': `${String(LIBRARY_PX.chipGap)}px`,
  '--r-tpl-list-pad': `${String(LIBRARY_PX.listPad)}px`,
  '--r-tpl-row-pad': `${String(LIBRARY_PX.rowPadY)}px ${String(LIBRARY_PX.rowPadX)}px`,
  '--r-tpl-row-gap': `${String(LIBRARY_PX.rowGap)}px`,
  '--r-tpl-row-radius': `${String(LIBRARY_PX.rowRadius)}px`,
  '--r-tpl-row-gap-below': `${String(LIBRARY_PX.rowGapBelow)}px`,
  '--r-tpl-thumb-w': `${String(LIBRARY_PX.thumbW)}px`,
  '--r-tpl-thumb-h': `${String(LIBRARY_PX.thumbH)}px`,
  '--r-tpl-thumb-radius': `${String(LIBRARY_PX.thumbRadius)}px`,
  '--r-tpl-thumb-icon': `${String(LIBRARY_PX.thumbIcon)}px`,
  '--r-tpl-name-text': `${String(LIBRARY_PX.nameText)}px`,
  '--r-tpl-meta-text': `${String(LIBRARY_PX.metaText)}px`,
  '--r-tpl-meta-gap': `${String(LIBRARY_PX.metaGap)}px`,
  '--r-tpl-badge-text': `${String(LIBRARY_PX.badgeText)}px`,
  '--r-tpl-badge-pad': `${String(LIBRARY_PX.badgePadY)}px ${String(LIBRARY_PX.badgePadX)}px`,
  '--r-tpl-badge-radius': `${String(LIBRARY_PX.badgeRadius)}px`,
  '--r-tpl-empty-pad': `${String(LIBRARY_PX.emptyPadY)}px ${String(LIBRARY_PX.emptyPadX)}px`,
  '--r-tpl-empty-title-text': `${String(LIBRARY_PX.emptyTitleText)}px`,
  '--r-tpl-foot-text': `${String(LIBRARY_PX.footText)}px`,
  '--r-tpl-drop-pad': `${String(LIBRARY_PX.dropPadY)}px ${String(LIBRARY_PX.dropPadX)}px`,
  '--r-tpl-drop-radius': `${String(LIBRARY_PX.dropRadius)}px`,
  '--r-tpl-drop-icon-box': `${String(LIBRARY_PX.dropIconBox)}px`,
  '--r-tpl-drop-icon-radius': `${String(LIBRARY_PX.dropIconRadius)}px`,
  '--r-tpl-drop-icon': `${String(LIBRARY_PX.dropIcon)}px`,
  '--r-tpl-drop-title-text': `${String(LIBRARY_PX.dropTitleText)}px`,
  '--r-tpl-drop-text': `${String(LIBRARY_PX.dropText)}px`,
  '--r-audit-tools-gap': `${String(AUDIT_LOG_PX.toolsGap)}px`,
  '--r-audit-search-h': `${String(AUDIT_LOG_PX.searchH)}px`,
  '--r-audit-search-pad': `${String(AUDIT_LOG_PX.searchPadY)}px ${String(AUDIT_LOG_PX.searchPadX)}px ${String(AUDIT_LOG_PX.searchPadY)}px ${String(AUDIT_LOG_PX.searchPadStart)}px`,
  '--r-audit-search-radius': `${String(AUDIT_LOG_PX.searchRadius)}px`,
  '--r-audit-search-text': `${String(AUDIT_LOG_PX.searchText)}px`,
  '--r-audit-search-icon': `${String(AUDIT_LOG_PX.searchIcon)}px`,
  '--r-audit-search-icon-inset': `${String(AUDIT_LOG_PX.searchIconInset)}px`,
  '--r-audit-field-w': `${String(AUDIT_LOG_PX.fieldW)}px`,
  '--r-audit-field-label-text': `${String(AUDIT_LOG_PX.fieldLabelText)}px`,
  '--r-audit-field-gap': `${String(AUDIT_LOG_PX.fieldGap)}px`,
  '--r-audit-select-h': `${String(AUDIT_LOG_PX.selectH)}px`,
  '--r-audit-select-pad': `${String(AUDIT_LOG_PX.selectPadY)}px ${String(AUDIT_LOG_PX.selectPadX)}px`,
  '--r-audit-select-radius': `${String(AUDIT_LOG_PX.selectRadius)}px`,
  '--r-audit-select-text': `${String(AUDIT_LOG_PX.selectText)}px`,
  '--r-audit-th-pad': `${String(AUDIT_LOG_PX.thPadY)}px ${String(AUDIT_LOG_PX.thPadX)}px`,
  '--r-audit-th-text': `${String(AUDIT_LOG_PX.thText)}px`,
  '--r-audit-td-pad': `${String(AUDIT_LOG_PX.tdPadY)}px ${String(AUDIT_LOG_PX.tdPadX)}px`,
  '--r-audit-td-text': `${String(AUDIT_LOG_PX.tdText)}px`,
  '--r-audit-col-time': `${String(AUDIT_LOG_PX.colTime)}px`,
  '--r-audit-col-actor': `${String(AUDIT_LOG_PX.colActor)}px`,
  '--r-audit-col-action': `${String(AUDIT_LOG_PX.colAction)}px`,
  '--r-audit-col-outcome': `${String(AUDIT_LOG_PX.colOutcome)}px`,
  '--r-audit-small-text': `${String(AUDIT_LOG_PX.smallText)}px`,
  '--r-audit-line-gap': `${String(AUDIT_LOG_PX.lineGap)}px`,
  '--r-audit-badge-text': `${String(AUDIT_LOG_PX.badgeText)}px`,
  '--r-audit-badge-pad': `${String(AUDIT_LOG_PX.badgePadY)}px ${String(AUDIT_LOG_PX.badgePadX)}px`,
  '--r-audit-badge-radius': `${String(AUDIT_LOG_PX.badgeRadius)}px`,
  '--r-audit-badge-gap': `${String(AUDIT_LOG_PX.badgeGap)}px`,
  '--r-audit-reason-text': `${String(AUDIT_LOG_PX.reasonText)}px`,
  '--r-audit-count-text': `${String(AUDIT_LOG_PX.countText)}px`,
  '--r-audit-reset-text': `${String(AUDIT_LOG_PX.resetText)}px`,
  '--r-audit-console-input-w': `${String(AUDIT_LOG_PX.consoleInputW)}px`,
  '--r-audit-caveat-text': `${String(AUDIT_LOG_PX.caveatText)}px`,
  // Motion
  '--r-dur-fast': '120ms',
  '--r-dur-med': '200ms',
  '--r-dur-spin': '700ms',
} as const;

/** The `<style>` element `applyThemeVars` owns. Named so a second call replaces it. */
const THEME_STYLE_ID = 'cg-theme-vars';

/**
 * ── STATION-CHROME-01 §1 — HOW THE ONE HOME REACHES THE STYLESHEET ──────────
 *
 * `controls.css` used to REPEAT every value in its own `:root` block, with a parity
 * test asserting the two copies matched. That is what actually defeated the owner's
 * acceptance test: the values agreed, but changing one still meant editing TWO
 * files, and a test that only proves two copies are equal is not a single home —
 * it is a well-guarded duplicate.
 *
 * So `controls.css` no longer declares any of them. This writes the `:root` block
 * from `cssVars` into a `<style>` in the document head, once, before the first
 * render. The stylesheet reads `var(--r-*)`; TypeScript reads `cssVars`; the value
 * itself is written exactly once, here.
 *
 * ⚠ MUST RUN BEFORE THE FIRST RENDER, and `main.tsx` calls it at module scope for
 * that reason (`themeVarsApplied.dom.test.ts` pins the call). No app element exists
 * before `createRoot().render()`, so no app pixel can paint without the tokens. The
 * startup splash is unaffected either way: it lives in `index.html`, paints before
 * the bundle, and mirrors its own values as documented literals (`splashCss.test.ts`).
 */
export function applyThemeVars(root: HTMLElement, doc: Document = root.ownerDocument): void {
  const body = Object.entries(cssVars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  const existing = doc.getElementById(THEME_STYLE_ID);
  const style = existing instanceof HTMLStyleElement ? existing : doc.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = `:root {\n${body}\n}\n`;
  if (existing === null) doc.head.append(style);
}

/**
 * Badge "tone" for a stack status — the `StatusBadge` maps this to a CSS class so
 * every state has a coherent color role. Labels/icons still come from
 * `airStateVisual` (kept verbatim so the Playwright badge-word hooks stay stable).
 */
export type BadgeTone = 'onair' | 'transient' | 'ready' | 'idle' | 'attention' | 'error' | 'exit';

export function badgeTone(status: StackItemStatus, pending: boolean): BadgeTone {
  if (status === 'disconnected') return 'error';
  if (status === 'error') return 'error';
  if (status === 'on-air') return 'onair';
  if (status === 'playing') return pending ? 'transient' : 'onair';
  if (status === 'updating') return 'transient';
  if (status === 'unconfirmed') return 'attention';
  // B-086 — link down, on-air claim unverifiable: muted grey (the health-UNKNOWN
  // tone), NEVER the broadcast air colour and NEVER the amber of `unconfirmed`.
  if (status === 'unverified') return 'idle';
  if (status === 'exiting') return 'exit';
  // `loaded` AND `idle` are both READY — see `airStateVisual` for why they were
  // merged, and why the distinction lives in the tooltip instead.
  if (status === 'loaded' || status === 'idle') return 'ready';
  return 'idle';
}

/**
 * WHY a READY row still has two underlying states, and where the difference went.
 *
 * `idle` and `loaded` now render identically — same word, same icon, same colour —
 * because an operator does not perceive the difference and showing two states for
 * one perception is false precision.
 *
 * The difference is REAL, though, and it is about what pressing PLAY costs:
 *
 *  - `loaded` — the producer is already on the layer. PLAY plays it immediately.
 *  - `idle` — a template is chosen but nothing is on the layer yet. PLAY must
 *    reach CasparCG and build the producer FIRST, which takes time and can fail.
 *
 * That matters the moment a take fails: if both rows read READY and one of them
 * fails to come up, it reads as a bug rather than as "that one had to load first".
 * So the fact stays one hover away, in the tooltip — the same trade this surface
 * makes for the occupancy report and the layer number.
 */
export function readyDetail(status: StackItemStatus): string | undefined {
  if (status === 'loaded') {
    return 'Loaded on the layer — PLAY takes it to air immediately.';
  }
  if (status === 'idle') {
    return (
      'A template is chosen but nothing is on the layer yet. PLAY has to build it on ' +
      'CasparCG first, so this take is not instant and can fail.'
    );
  }
  return undefined;
}

export interface AirStateVisual {
  /**
   * The state's colour — and, where a state renders BOTH a mark and a word, the
   * MARK's colour specifically. The consumer paints the icon with this.
   */
  color: string;
  /**
   * PHASE 2A — the WORD's colour, present ONLY where it differs from `color`.
   *
   * `error` is the one state today: its ✕ is a graphic judged at the 3.0 floor and
   * its `ERROR` label is text judged at 4.5, so one value cannot serve both. Every
   * other state returns nothing here and its label goes on inheriting `color`,
   * which is the behaviour that must not change.
   *
   * ⚠ It is OPTIONAL rather than always-present on purpose: a consumer that reads
   * `labelColor ?? color` cannot accidentally flatten the states that legitimately
   * paint their mark and their word the same.
   */
  labelColor?: string;
  icon: string;
  label: string;
}

/**
 * Air-state visual for a given `StackItemStatus`. Always returns
 * { color, icon, label } so consumers never reach for hue alone.
 */
export function airStateVisual(status: StackItemStatus, pending: boolean): AirStateVisual {
  if (status === 'disconnected') return { color: colors.offline, icon: '⚠', label: 'OFFLINE' };
  // PHASE 2A — the one state that paints a MARK and a WORD in two different reds:
  // the ✕ is a graphic (3.0 floor), the word ERROR is text (4.5). See `colors.errorMark`.
  if (status === 'error') {
    return { color: colors.errorMark, labelColor: colors.errorText, icon: '✕', label: 'ERROR' };
  }
  if (status === 'on-air') return { color: colors.onAir, icon: '●', label: 'ON AIR' };
  if (status === 'playing')
    return pending
      ? { color: colors.pending, icon: '⟳', label: 'TAKING' }
      : { color: colors.onAir, icon: '●', label: 'ON AIR' };
  if (status === 'updating') return { color: colors.onAir, icon: '⟳', label: 'UPDATING' };
  // B-044 — bounded-timeout state: the command was sent but no ack arrived in
  // time; the on-air result is unknown. Minimal visual for now (the queued
  // runtime UI-polish item restyles all badge states).
  if (status === 'unconfirmed') return { color: colors.pending, icon: '?', label: 'UNCONFIRMED' };
  // B-086 — the CasparCG link is down: this item WAS on air, but the wire can no
  // longer confirm it. Muted grey (health-UNKNOWN tone); the last-known "ON AIR"
  // lives in the row's tooltip. Restores to on-air or resets to idle on reconnect.
  if (status === 'unverified') return { color: colors.textMuted, icon: '◌', label: 'WAS ON AIR' };
  if (status === 'exiting') return { color: colors.exit, icon: '◐', label: 'EXIT' };
  // `loaded` and `idle` are ONE presented state: READY. The operator cannot
  // perceive the difference between "the producer is already up" and "it will be
  // built when you press PLAY", so showing two states was false precision. The
  // difference is preserved in `readyDetail`, which the row's tooltip carries.
  if (status === 'loaded' || status === 'idle') {
    return { color: colors.ready, icon: '▸', label: 'READY' };
  }
  return { color: colors.idle, icon: '○', label: 'IDLE' };
}

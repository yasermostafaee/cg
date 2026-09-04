import type { CSSProperties } from 'react';
import {
  activeRangeOf,
  followsComposition,
  hasEffectiveHoldDrivers,
  playoutOf,
  type Composition,
  type Element,
  type HoldSource,
  type PlayoutMode,
  type Scene,
} from '@cg/shared-schema';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Callout } from '../../ui/Callout.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
import { designerStore } from '../../state/store.js';
import { contentStartDefaultFrom } from './content-start-default.js';
import { CollapseSection } from './CollapseSection.js';
import { InfoTip, StateLine } from './InfoTip.js';
import { RealtimeNumberInput } from './controls.js';
import * as s from './InspectorPanel.css.js';
import * as cls from './PlayoutSection.css.js';
import * as prose from './prose.css.js';

const MODE_LABELS: Record<PlayoutMode, string> = {
  // D-114 — the no-out-point mode: play in → hold → hard cut on stop, no animated exit.
  static: 'Static — plays in, holds, cut on stop (no out-point)',
  manual: 'Manual — hold until stop',
  'auto-out': 'Auto-out — outro after hold',
  'loop-cycle': 'Loop cycle — repeat in → hold → out',
};

const HOLD_LABELS: Record<HoldSource, string> = {
  timed: 'Timed — hold for a duration',
  'content-driven':
    'Content-driven — until the content completes (ticker passes / countdown / sequence passes)',
};

/**
 * Does this composition contain a content source — a ticker, a countdown
 * clock (D-027), or a sequence (D-029)? Wall/countup clocks are NOT content
 * sources: they never complete, so they can't end a hold. Tickers and
 * sequences count regardless of their authored `repeat` (an infinite one
 * holds until stop — still a meaningful content-driven authoring choice).
 */
export function hasContentElement(scene: Scene): boolean {
  // D-104 — a nested composition instance participates in the parent's
  // content-driven hold, so resolve the referenced composition's layers and
  // check THEM too (cycle-guarded by a visited set), exactly as we recurse into
  // a container. So the hold control is offered for a parent whose only finite
  // content lives inside a nested composition.
  const visited = new Set<string>();
  const walk = (children: readonly Element[]): boolean =>
    children.some((el) => {
      if (
        (el.type === 'ticker' ||
          el.type === 'sequence' ||
          (el.type === 'clock' && el.mode === 'countdown')) &&
        // B-034 — a HIDDEN content element (`visible: false`) is fully inert: not a hold driver.
        el.visible !== false
      ) {
        return true;
      }
      // D-128 — a media element (video/lottie) that is OPTED IN to drive the hold
      // (`drivesHold === true`, the media opt-in) is a content source: the content-driven hold
      // option must be reachable so the operator can see + tune it in the closer list below.
      if (
        (el.type === 'video' || el.type === 'lottie') &&
        el.visible !== false &&
        el.drivesHold === true
      ) {
        return true;
      }
      // B-034 — a HIDDEN container / instance makes its WHOLE subtree inert: don't descend (mirrors
      // render + the runtime), so a comp whose only content lives in hidden ancestors offers no hold.
      if (el.type === 'container') return el.visible !== false && walk(el.children);
      if (el.type === 'composition') {
        if (el.visible === false || visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = scene.compositions?.find((c) => c.id === el.compositionId);
        return comp !== undefined && comp.layers.some((l) => walk(l.children));
      }
      return false;
    });
  return scene.layers.some((l) => walk(l.children));
}

type ContentKind = 'ticker' | 'sequence' | 'clock' | 'video' | 'lottie';
interface ContentHoldItem {
  id: string;
  name: string;
  type: ContentKind;
  drivesHold: boolean;
  /**
   * D-111 — a driver that never completes, so while it participates (`drivesHold`) the
   * content-driven hold runs until `stop()` (the graphic won't auto-close): a ticker/sequence
   * with `repeat: 'infinite'`, or a video/lottie with a `loop` hold (D-128 — a loop hold loops
   * until stop; a `freeze` hold completes at its intro end and IS a closer). A countdown clock
   * is always finite ⇒ never true.
   */
  infinite: boolean;
}

/**
 * D-125/D-128 — a `video` or `lottie` is an OPT-IN hold driver: `drivesHold === true` (the
 * INVERSE of ticker/sequence, whose absent flag participates). This mirrors the runtime, which
 * reads media `drivesHold` as `=== true`. A `loop` hold never completes (infinite); a `freeze`
 * hold completes at its intro end, so it CAN close the graphic.
 */
function mediaHoldItem(el: Extract<Element, { type: 'video' | 'lottie' }>): ContentHoldItem {
  return {
    id: el.id,
    name: el.name,
    type: el.type,
    drivesHold: el.drivesHold === true,
    infinite: mediaHoldIsInfinite(el),
  };
}

/**
 * Does this media element's hold EVER complete? Answered the way the DRIVERS answer it —
 * the session-R lesson is that this banner goes stale precisely when this mirror and the
 * runtime disagree, so the predicate spells the driver facts per kind:
 *
 *  - 🔴 The two media kinds SPELL the never-completing hold DIFFERENTLY: a video's is
 *    `loop` and a Lottie's is `idle-loop` (schema enums `['loop','freeze']` /
 *    `['freeze','idle-loop']`). Testing only `'loop'` once marked every idle-loop Lottie
 *    a finite closer (session R's found-beside fix).
 *  - A video `loop` hold NEVER resolves — `VideoDriver`'s loop branch has no completion,
 *    even on a zero-length range — EXCEPT under follow with no authored idle, where the
 *    runtime resolves the hold to a FREEZE at `H` (looping the whole clip would abandon
 *    the held look follow promises to keep) and the freeze completes.
 *  - A Lottie `idle-loop` loops only a NON-EMPTY effective span (`clipPositionAt` requires
 *    `idleOut > idleIn`; a zero span falls back to freeze and RESOLVES `whenComplete`).
 *    A MARKER-LESS clip's span is zero (`idleIn = idleOut = op`) — it COMPLETES, which the
 *    coarse `holdBehavior === 'idle-loop'` check got wrong (found beside the follow work:
 *    the alert claimed a graphic would never close that the runtime auto-closes).
 *  - Under follow (`source: 'composition'`) the stored `introEnd`/`outroStart` are IGNORED
 *    and must not smuggle a loop range in: only an AUTHORED idle range loops.
 */
function mediaHoldIsInfinite(el: Extract<Element, { type: 'video' | 'lottie' }>): boolean {
  const follows = followsComposition(el.phases);
  if (el.type === 'video') {
    if (el.holdBehavior !== 'loop') return false;
    return follows ? el.phases?.idle !== undefined : true;
  }
  if (el.holdBehavior !== 'idle-loop') return false;
  const p = el.phases;
  if (follows) return p?.idle !== undefined && p.idle[1] > p.idle[0];
  if (p === undefined) return false; // marker-less: zero span, freezes, completes
  return p.idle !== undefined ? p.idle[1] > p.idle[0] : (p.outroStart ?? 0) > (p.introEnd ?? 0);
}

/**
 * D-107 — the active composition's OWN content elements that can drive a
 * content-driven hold: tickers, sequences, and COUNTDOWN clocks (wall/countup
 * never complete, so they can't end a hold — excluded here, matching the runtime).
 * Recurses containers (a grouped content element still drives the hold) but NOT
 * nested composition instances: a nested instance is a SHARED child, so its
 * content is chosen by drilling into that composition's own Playout section, not
 * from the parent. `drivesHold` reflects the stored flag (absent ⇒ participates).
 */
export function contentHoldElementsOf(scene: Scene): ContentHoldItem[] {
  const out: ContentHoldItem[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      // B-034 — a HIDDEN content element (`visible: false`) is inert: never listed as a hold driver.
      if ((el.type === 'ticker' || el.type === 'sequence') && el.visible !== false) {
        out.push({
          id: el.id,
          name: el.name,
          type: el.type,
          drivesHold: el.drivesHold !== false,
          infinite: el.repeat === 'infinite',
        });
      } else if (el.type === 'clock' && el.mode === 'countdown' && el.visible !== false) {
        out.push({
          id: el.id,
          name: el.name,
          type: 'clock',
          drivesHold: el.drivesHold !== false,
          infinite: false,
        });
      } else if ((el.type === 'video' || el.type === 'lottie') && el.visible !== false) {
        // D-128 — a media element (opt-in drivesHold) is a hold driver too; without this it
        // was ABSENT from the closer list and the "repeats forever" warning (the owner's bug).
        out.push(mediaHoldItem(el));
      } else if (el.type === 'container' && el.visible !== false) {
        // B-034 — skip a HIDDEN container's whole subtree (inert, mirrors render).
        walk(el.children);
      }
    }
  };
  for (const l of scene.layers) walk(l.children);
  return out;
}

type NestedInstance = Extract<Element, { type: 'composition' }>;

/**
 * D-112 — is this referenced composition a content-driven "coordinator" (the same predicate the
 * runtime uses: `mode !== 'manual' && holdSource === 'content-driven'`)? A coordinator nested child
 * self-settles, so its PARENT awaits its `whenSettled` rather than aggregating its content per-element
 * — a per-instance override on it would be INERT. So the parent surfaces a coordinator child's content
 * READ-ONLY (drill in to edit the child's own participation), never as a writable override.
 */
function isCoordinatorComp(comp: Composition): boolean {
  const p = playoutOf(comp);
  return p.mode !== 'manual' && p.holdSource === 'content-driven';
}

/** D-112 — one writable nested driver row: the referenced comp's OWN direct content element. */
interface NestedHoldDriver {
  /** The nested content element id — the per-instance override key. */
  id: string;
  name: string;
  type: ContentKind;
  /** The element's OWN authored flag (absent ⇒ drives). */
  drivesHold: boolean;
  /** `repeat: 'infinite'` (a countdown clock is always finite). */
  infinite: boolean;
  /** The instance's stored override for this element (undefined ⇒ none → fall back to `drivesHold`). */
  override: boolean | undefined;
  /** D-112 — effective participation in THIS parent's hold = `override ?? drivesHold`. */
  effective: boolean;
}

/**
 * `a`, `a and b`, `a, b and c` — the culprit list in the never-closes alert.
 *
 * ONE message, parameterised, rather than a separate all-infinite variant. The REMEDY is
 * identical in both cases ("give a driver a finite repeat, exclude one below, or switch to a
 * timed hold"), and naming the drivers is strictly more useful than asserting "every" — which
 * is the same list spelled less helpfully, and which was the wording that could go stale the
 * moment a finite driver joined.
 */
function listSentence(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

interface NestedHoldGroup {
  /** The nested INSTANCE element id — override target + stable React key (a comp can be instanced twice). */
  key: string;
  /** The referenced composition to drill into. */
  compositionId: string;
  /** The instance's name (what the operator sees and drills into). */
  name: string;
  /**
   * D-112 — false when the referenced comp is a content-driven coordinator: the per-instance
   * override would be inert (the parent awaits its settle), so its content is surfaced READ-ONLY.
   */
  writable: boolean;
  /** D-112 — the referenced comp's OWN DIRECT content, as WRITABLE rows (this instance's override). */
  drivers: NestedHoldDriver[];
  /** Hold-eligible content reachable through this instance's OWN deeper nested instances (drill in to edit). */
  deeperCount: number;
  /** Recursive EFFECTIVE drivers (own direct + deeper, per-level overrides applied) — for the all-infinite alert. */
  effectiveCount: number;
  /** Recursive EFFECTIVE + infinite drivers. */
  effectiveInfinite: number;
}

/**
 * D-108 + D-112 — the active composition's IMMEDIATE nested composition instances that contribute
 * hold-eligible content. D-112 makes each instance's OWN DIRECT content (recursing containers, NOT
 * deeper instances) WRITABLE: the parent toggles whether each drives ITS hold via a per-instance
 * `holdOverrides` on the instance element (effective = `override ?? element.drivesHold`), without
 * touching the shared child. Deeper nested content (inside this instance's own instances) carries
 * its OWN overrides and is edited by drilling in — one level at a time (cascade per level). Also
 * reports recursive EFFECTIVE driver counts (overrides applied at each level) for the all-infinite
 * alert. Cycle-guarded.
 */
function nestedHoldGroupsOf(scene: Scene): NestedHoldGroup[] {
  const analyze = (
    inst: NestedInstance,
    seen: Set<string>,
  ): {
    drivers: NestedHoldDriver[];
    eligible: number;
    effective: number;
    effectiveInfinite: number;
  } => {
    const empty = {
      drivers: [] as NestedHoldDriver[],
      eligible: 0,
      effective: 0,
      effectiveInfinite: 0,
    };
    if (seen.has(inst.compositionId)) return empty;
    const seen2 = new Set([...seen, inst.compositionId]);
    const comp = scene.compositions?.find((c) => c.id === inst.compositionId);
    if (comp === undefined) return empty;
    const overrides = inst.holdOverrides;
    const drivers: NestedHoldDriver[] = [];
    let eligible = 0;
    let effective = 0;
    let effectiveInfinite = 0;
    const walk = (children: readonly Element[]): void => {
      for (const el of children) {
        if (
          (el.type === 'ticker' ||
            el.type === 'sequence' ||
            (el.type === 'clock' && el.mode === 'countdown')) &&
          // B-034 — a HIDDEN nested content element is inert: not listed/counted as a hold driver.
          el.visible !== false
        ) {
          const drivesHold = el.drivesHold !== false;
          const override = overrides?.[el.id];
          const eff = override !== undefined ? override : drivesHold;
          const infinite =
            (el.type === 'ticker' || el.type === 'sequence') && el.repeat === 'infinite';
          drivers.push({
            id: el.id,
            name: el.name,
            type: el.type === 'clock' ? 'clock' : el.type,
            drivesHold,
            infinite,
            override,
            effective: eff,
          });
          eligible += 1;
          if (eff) {
            effective += 1;
            if (infinite) effectiveInfinite += 1;
          }
        } else if ((el.type === 'video' || el.type === 'lottie') && el.visible !== false) {
          // D-128 — a nested media element drives the parent's hold too (opt-in `drivesHold === true`,
          // a `loop` hold is the infinite case). Mirrors the own-content media branch above.
          const drivesHold = el.drivesHold === true;
          const override = overrides?.[el.id];
          const eff = override !== undefined ? override : drivesHold;
          const infinite = el.holdBehavior === 'loop';
          drivers.push({
            id: el.id,
            name: el.name,
            type: el.type,
            drivesHold,
            infinite,
            override,
            effective: eff,
          });
          eligible += 1;
          if (eff) {
            effective += 1;
            if (infinite) effectiveInfinite += 1;
          }
          // B-034 — a HIDDEN container / deeper instance makes its WHOLE subtree inert: don't descend.
        } else if (el.type === 'container' && el.visible !== false) {
          walk(el.children);
        } else if (el.type === 'composition' && el.visible !== false) {
          // Deeper level — counts cascade (its OWN overrides apply), but its drivers are edited there.
          const sub = analyze(el, seen2);
          eligible += sub.eligible;
          effective += sub.effective;
          effectiveInfinite += sub.effectiveInfinite;
        }
      }
    };
    for (const l of comp.layers) walk(l.children);
    return { drivers, eligible, effective, effectiveInfinite };
  };

  const groups: NestedHoldGroup[] = [];
  const findInstances = (children: readonly Element[]): void => {
    for (const el of children) {
      // B-034 — a HIDDEN immediate instance / container is inert: no checklist group (whole subtree
      // skipped), matching render + the runtime's hold aggregation.
      if (el.type === 'composition' && el.visible !== false) {
        const a = analyze(el, new Set<string>());
        if (a.eligible > 0) {
          const comp = scene.compositions?.find((c) => c.id === el.compositionId);
          groups.push({
            key: el.id,
            compositionId: el.compositionId,
            name: el.name,
            // A coordinator immediate child ignores per-instance overrides (it self-settles), so
            // its content is read-only here — edit it by drilling into the child.
            writable: comp === undefined ? true : !isCoordinatorComp(comp),
            drivers: a.drivers,
            deeperCount: a.eligible - a.drivers.length,
            effectiveCount: a.effective,
            effectiveInfinite: a.effectiveInfinite,
          });
        }
      } else if (el.type === 'container' && el.visible !== false) {
        findInstances(el.children);
      }
    }
  };
  for (const l of scene.layers) findInstances(l.children);
  return groups;
}

/** Suffix duplicate display names "(1)/(2)/…" so each checklist row is identifiable. */
function disambiguate(names: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if ((counts.get(n) ?? 0) <= 1) return n;
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return `${n} (${k})`;
  });
}

const TYPE_LABEL: Record<ContentKind, string> = {
  ticker: 'ticker',
  sequence: 'sequence',
  clock: 'countdown',
  video: 'video',
  lottie: 'lottie',
};

const selectStyle: CSSProperties = {
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.14rem 0.3rem',
  fontSize: '0.72rem',
  width: '100%',
  boxSizing: 'border-box',
};

const mutedStyle: CSSProperties = { color: colors.textMuted, fontSize: '0.66rem' };
const hintStyle: CSSProperties = { ...mutedStyle, lineHeight: 1.4, margin: '0.35rem 0 0' };
const checklistStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.18rem',
  margin: '0.1rem 0 0',
  maxHeight: '8.5rem',
  overflowY: 'auto',
};
const checkRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  fontSize: '0.7rem',
  cursor: 'pointer',
};
const checkTypeStyle: CSSProperties = { color: colors.textMuted, fontSize: '0.62rem' };
// D-112 — a nested instance's drill-in header plus its writable per-driver rows, indented under it.
const nestedGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.14rem',
};
const nestedDriversStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.18rem',
  marginLeft: '1.15rem',
};
const holdMsNumStyle: CSSProperties = {
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.1rem 0.35rem',
  fontSize: '0.72rem',
  width: '76px',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
};

// D-111 — inline flag on a hold-driving row whose element repeats forever (`repeat: 'infinite'`):
// such a driver never completes, so it keeps the graphic on air until stop(). Reuses the design
// system's danger colour + triangle-alert glyph (no new palette).
const infiniteWarnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.18rem',
  // CAUTION, not danger. An infinite ticker is a DELIBERATE, legitimate authoring choice
  // — the operator should notice it, but nothing is wrong. Painting it `danger` cried wolf
  // and left a real error (the Lottie intro overrunning the out-point) nothing louder to
  // escalate to. Amber tint + amber label, from the `caution` tokens.
  background: colors.cautionSurface,
  color: colors.caution,
  borderRadius: '3px',
  padding: '0.05rem 0.25rem',
  fontSize: '0.6rem',
  fontWeight: 600,
};
function InfiniteWarn({ title }: { title: string }): JSX.Element {
  return (
    <span style={infiniteWarnStyle} title={title}>
      <Icon icon={TriangleAlert} size={11} />
      loops forever
    </span>
  );
}

/**
 * D-107 — when the hold is content-driven, let the designer choose WHICH content
 * elements close the graphic. Pre-checked (all participate by default); unchecking
 * one sets its `drivesHold: false` so it no longer gates the hold (it still runs).
 * Lists the active composition's own tickers / sequences / countdown clocks
 * (recursing groups). D-112 — below it, each nested composition instance's OWN content is shown as
 * WRITABLE rows: the checkbox reflects the EFFECTIVE participation (the per-instance override if set,
 * else the element's own `drivesHold`) and toggling it writes a `holdOverrides` entry on the INSTANCE
 * (not the shared child) — so two instances of the same child differ. The drill-in stays (to edit the
 * child or a deeper instance level). Falls back to a drill-in hint only when neither surface has rows.
 * D-111 (folded into D-112) — any EFFECTIVELY-driving `repeat: 'infinite'` row is flagged
 * ("loops forever"); when EVERY effective driver is infinite a prominent alert says the graphic won't
 * auto-close (the hold runs until stop).
 */
function ContentHoldChecklist({ scene }: { scene: Scene }): JSX.Element {
  const items = contentHoldElementsOf(scene);
  // D-112 — hold-driving content inside nested composition instances drives the parent's hold too
  // (D-104); each instance's own direct content is now WRITABLE per-instance (its `holdOverrides`).
  const nested = nestedHoldGroupsOf(scene);
  const labels = disambiguate(items.map((it) => it.name));
  const nestedLabels = disambiguate(nested.map((g) => g.name));
  // D-111/D-112 — a content-driven hold is `Promise.all` over its EFFECTIVE drivers, so ANY
  // infinite-repeat driver (still effectively participating) keeps the graphic on air until
  // stop(). Flag each such row, AND escalate to the alert on ANY of them.
  //
  // 🔴 It escalated on EVERY until 2026-08-13, and the gap was worse than a missed warning. With
  // an infinite ticker and a Lottie, ticking the Lottie added a FINITE driver (a `freeze` hold
  // completes at its intro end), `every` stopped holding, and the banner UNMOUNTED — while its
  // headline claim, "this graphic won't auto-close", was still true. An alert that disappears at
  // the moment the operator acts reads as confirmation that the action fixed it. The comment
  // above already said ANY; only the code said EVERY.
  //
  // The culprits are named from the SAME arrays the counts come from (`items` + `nested`, each
  // with its disambiguated label), so the sentence and the condition cannot disagree — and the
  // effective-driver derivation stays exactly where it was, in `contentHoldElementsOf` /
  // `nestedHoldGroupsOf`.
  const infiniteOwn = items
    .map((it, i) => ({ it, label: labels[i] ?? it.name }))
    .filter(({ it }) => it.drivesHold && it.infinite);
  // A nested group names its INSTANCE: `effectiveInfinite` counts drivers reachable through it
  // (its own direct content plus deeper instances, per-level overrides applied), and the deeper
  // ones have no row of their own to name.
  const infiniteNested = nested
    .map((g, i) => ({ g, label: nestedLabels[i] ?? g.name }))
    .filter(({ g }) => g.effectiveInfinite > 0);
  const infiniteLabels = [
    ...infiniteOwn.map(({ label }) => `“${label}”`),
    ...infiniteNested.map(({ label }) => `content inside “${label}”`),
  ];
  const anyInfinite = infiniteLabels.length > 0;
  return (
    <>
      {anyInfinite && (
        <div className={s.row} style={{ display: 'block' }}>
          {/* `role="alert"` restored: #352 recoloured this banner danger→caution and the
              variant-derived role silently demoted it to `status`. The COLOUR changed
              because a never-closing hold is a legitimate state, not an error — but it is
              still an assertive announcement ("this graphic will not auto-close"), so it
              stays in the alert channel. Styling and semantics are independent.

              🔴 This banner has now lost accuracy TWICE through a change that looked local:
              once in styling (#352's variant swap silently demoting the role) and once in
              logic (escalating on EVERY infinite driver instead of ANY). Both times the
              banner kept rendering something, so nothing looked broken. Keep the variant
              and the role BOTH explicit, and keep the condition tied to the consequence. */}
          <Callout variant="caution" role="alert">
            This graphic won’t auto-close — {listSentence(infiniteLabels)}{' '}
            {infiniteLabels.length === 1 ? 'repeats' : 'repeat'} forever, so the content-driven hold
            runs until stop. Give a driver a finite repeat, exclude one below, or switch to a timed
            hold.
          </Callout>
        </div>
      )}
      {items.length > 0 && (
        <div className={s.row} style={{ display: 'block' }}>
          <p style={{ ...mutedStyle, margin: '0 0 0.2rem' }}>Which content closes the graphic?</p>
          <div style={checklistStyle}>
            {items.map((it, i) => (
              <label key={it.id} style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={it.drivesHold}
                  aria-label={`${labels[i] ?? it.name} drives the hold`}
                  onChange={(e) => designerStore.setElementDrivesHold(it.id, e.target.checked)}
                />
                <span style={{ color: colors.text }}>{labels[i] ?? it.name}</span>
                <span style={checkTypeStyle}>{TYPE_LABEL[it.type]}</span>
                {it.drivesHold && it.infinite && (
                  <InfiniteWarn
                    title={`“${labels[i] ?? it.name}” has repeat: infinite, so it never completes — the graphic holds until stop(). Uncheck it or give it a finite repeat to let the graphic auto-close.`}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {nested.length > 0 && (
        <div className={s.row} style={{ display: 'block' }}>
          <p style={{ ...mutedStyle, margin: '0 0 0.2rem' }}>
            Nested content — choose which closes THIS graphic (per instance):
          </p>
          <div style={checklistStyle}>
            {nested.map((g, i) => {
              const instanceLabel = nestedLabels[i] ?? g.name;
              const driverLabels = disambiguate(g.drivers.map((d) => d.name));
              return (
                <div key={g.key} style={nestedGroupStyle}>
                  <Button
                    variant="bare"
                    className={cls.nestedRow}
                    aria-label={`Open ${instanceLabel} to edit its content${
                      g.deeperCount > 0 ? ' or its deeper nested compositions' : ''
                    }`}
                    onClick={() => designerStore.setActiveComposition(g.compositionId)}
                  >
                    <Icon icon={ChevronRight} size={12} flipRtl />
                    <span>{instanceLabel}</span>
                    {g.deeperCount > 0 && (
                      <span style={checkTypeStyle}>+{g.deeperCount} inside — open</span>
                    )}
                  </Button>
                  {g.writable && g.drivers.length > 0 && (
                    <div style={nestedDriversStyle}>
                      {g.drivers.map((d, di) => {
                        const driverLabel = driverLabels[di] ?? d.name;
                        return (
                          <label key={`${g.key}:${d.id}`} style={checkRowStyle}>
                            <input
                              type="checkbox"
                              checked={d.effective}
                              aria-label={`${driverLabel} in ${instanceLabel} drives the hold`}
                              onChange={(e) =>
                                designerStore.setHoldOverride(
                                  g.key,
                                  d.id,
                                  // Clear the override when it matches the child's own default
                                  // (keeps stored data minimal; the fallback rule governs).
                                  e.target.checked === d.drivesHold ? undefined : e.target.checked,
                                )
                              }
                            />
                            <span style={{ color: colors.text }}>{driverLabel}</span>
                            <span style={checkTypeStyle}>{TYPE_LABEL[d.type]}</span>
                            {d.effective && d.infinite && (
                              <InfiniteWarn
                                title={`“${driverLabel}” has repeat: infinite, so it never completes — the graphic holds until stop(). Toggle it off here or give it a finite repeat to let the graphic auto-close.`}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {!g.writable && (
                    <div style={nestedDriversStyle}>
                      <span style={checkTypeStyle}>
                        {g.effectiveCount} item{g.effectiveCount === 1 ? '' : 's'} — content-driven;
                        open to edit
                      </span>
                      {g.effectiveInfinite > 0 && (
                        <InfiniteWarn
                          title={`Content inside “${instanceLabel}” has repeat: infinite — it self-settles only on stop(), so this graphic won't auto-close. Open it to give that content a finite repeat or exclude it there.`}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length === 0 && nested.length === 0 && (
        <p style={hintStyle}>
          This composition’s content lives in nested compositions — open each to choose which of its
          content closes the graphic.
        </p>
      )}
    </>
  );
}

/**
 * D-133 §9.1 — WHY an authored hold loop has no playback effect, or `null` when it has one.
 *
 * The loop range renders the HOLD, and only a CONTENT-DRIVEN hold; every other resolution
 * parks on `outPoint` exactly as it does today. The order below is the resolution order the
 * runtime itself uses, and it is not cosmetic:
 *
 *  - `manual` / `static` ignore `holdSource` ENTIRELY (`HoldSourceSchema`'s own comment), so
 *    the select's value is not the reason and must not be reported as one (§9.1 correction 4);
 *  - with NO effective hold driver, `content-driven` falls back to `timed` in the runtime,
 *    the exporter AND this panel (B-032) — so a select reading "Content-driven" is still a
 *    timed hold, and saying "switch the select" would be a lie;
 *  - only then is the select itself the missing condition.
 *
 * `hasDrivers` is the ALREADY-COMPUTED `hasEffectiveHoldDrivers` from the panel — passed in,
 * never re-derived here (§1.5's standing rule: one predicate, one call).
 */
export type HoldLoopInertReason = 'static' | 'manual' | 'no-drivers' | 'timed-hold';

export function holdLoopInertReason(
  mode: PlayoutMode,
  holdSource: HoldSource | undefined,
  hasDrivers: boolean,
): HoldLoopInertReason | null {
  if (mode === 'static') return 'static';
  if (mode === 'manual') return 'manual';
  if (!hasDrivers) return 'no-drivers';
  // Absent ⇒ 'timed' (`PlayoutObjectSchema`), which is the DEFAULT even with drivers present.
  if ((holdSource ?? 'timed') !== 'content-driven') return 'timed-hold';
  return null;
}

/**
 * D-133 §3.4 — the loop range's own STATE ROW, and the surface that names it.
 *
 * THE THREE LOOPS, named apart (a spec requirement, not a preference):
 *
 *  | surface                    | name here      | what repeats                          |
 *  | -------------------------- | -------------- | ------------------------------------- |
 *  | transport bar toggle       | "Preview loop" | the EDITOR playhead, over the ruler    |
 *  | `mode: 'loop-cycle'`       | "Loop cycle"   | the whole IN → hold → OUT cycle        |
 *  | `[contentStart→outPoint]`  | "Hold loop"    | the furniture, DURING the hold         |
 *
 * They can all be true of one composition at once, so none of them is called plain "loop".
 * "Hold loop" names WHERE it applies, which is also the whole of why it can be inert.
 *
 * §9.1 — an inert control that does not explain itself is a defect. When the range has no
 * playback effect this states so and NAMES THE MISSING CONDITION exactly.
 *
 * ⭐ `DESIGNER-FIX-0905` — **the state is a TAG, the remedy is one line, the teaching is
 * behind the `i`.** This was a paragraph — _"Hold loop (frames 38 → 38) has no playback effect
 * here: a manual hold waits for the operator to stop it, so the hold source is ignored. Pick
 * auto-out or loop-cycle to activate the loop."_ — and the three-loops distinction rode on the
 * end of the ACTIVE paragraph in parentheses. Now: `inert` / `empty` / `active` is read at a
 * glance, the missing condition and its remedy stay inline (a remedy never goes behind the
 * `i`), and `38 → 38` reads as what it is — an EMPTY range with nothing to replay, whatever the
 * mode, which is exactly the runtime's own rule (`startHoldLoop`: `to <= from` parks).
 */
function HoldLoopRow({
  reason,
  from,
  to,
}: {
  reason: HoldLoopInertReason | null;
  from: number;
  to: number;
}): JSX.Element {
  const range = `frames ${String(from)} → ${String(to)}`;
  const empty = to <= from;
  const tip = <ThreeLoopsTip />;
  if (empty) {
    return (
      <StateLine testId="hold-loop-state" tip={tip} tone="text">
        <span className={prose.tagCaution}>empty</span>
        Hold loop {range} — nothing to replay. Drag the cyan marker earlier than the out point to
        give the hold a range.
      </StateLine>
    );
  }
  if (reason === null) {
    return (
      <StateLine testId="hold-loop-state" tip={tip} tone="text">
        <span className={prose.tagActive}>active</span>
        Hold loop {range} — replays during the hold; the content keeps running and never restarts.
      </StateLine>
    );
  }
  return (
    <StateLine testId="hold-loop-state" tip={tip} tone="text">
      <span className={prose.tagCaution}>inert</span>
      Hold loop {range} — no playback effect:{' '}
      {reason === 'static'
        ? 'a static composition never runs a hold source. Pick auto-out or loop-cycle.'
        : reason === 'manual'
          ? 'a manual hold ignores the hold source. Pick auto-out or loop-cycle.'
          : reason === 'no-drivers'
            ? 'no effective hold driver — no ticker, sequence or countdown clock, and no video or Lottie driving the hold. Add one.'
            : 'the hold is timed. Set hold to Content-driven.'}
    </StateLine>
  );
}

/**
 * The three loops, said once. This is TEACHING — read once, ever — so it lives behind the
 * `i` at reading size rather than in parentheses at the end of every active caption.
 */
function ThreeLoopsTip(): JSX.Element {
  return (
    <InfoTip title="The three loops">
      <p>
        <strong>Hold loop</strong> — during a <em>content-driven</em> hold the composition replays
        the range from the content start to the out point until the content finishes. The content
        itself keeps running across every repeat; it never restarts. It has no effect under a manual
        or static hold, under a timed hold, or when nothing drives the hold.
      </p>
      <p>
        <strong>Loop cycle</strong> — the playout mode that repeats the whole in → hold → out cycle
        on air.
      </p>
      <p>
        <strong>Preview loop</strong> — the transport bar’s toggle, which loops the editor’s
        playhead over the ruler. It never reaches air.
      </p>
    </InfoTip>
  );
}

/**
 * D-020 — no-code "Playout" inspector section. Picks the composition's playout
 * `mode` (the design-time decision: what kind of template this is), wired to
 * `designerStore.setPlayout`. The single `outPoint` marker is dragged on the
 * timeline (this section just reports it). B-032 — the TIMED `holdMs` is authored
 * here too (a stored default that EXPORTS, still overridable in the preview);
 * `repeat` remains a preview/control-surface session override.
 */
export function PlayoutSection({ scene }: { scene: Scene }): JSX.Element {
  const playout = playoutOf(scene);
  const mode = playout.mode;
  const lifecycle = scene.lifecycle;
  // D-028/D-027 — the Hold-source select only exists when the composition
  // actually contains a content source (a ticker or a countdown clock): a
  // dead control teaches nothing (same principle as Next disabled at steps=1).
  const hasContent = hasContentElement(scene);
  // B-032 — the TIMED hold duration (`holdMs`) is an AUTHORABLE default stored on the
  // composition's playout, so a content-less `auto-out` / `loop-cycle` EXPORTS and plays
  // back with the hold (the preview session override still layers on top via
  // `effectivePlayoutFor`). Offered only for a TIMED hold under `auto-out` / `loop-cycle`
  // (a content-driven hold ignores `holdMs`).
  // B-032 — resolve exactly like the runtime/exporter: a content-driven hold with NO effective
  // content drivers (own + nested, drivesHold-aware) is really a TIMED hold, so the holdMs input
  // shows AND applies (the runtime now honors it). For the zero-content case this equals `hasContent`.
  const hasDrivers = hasEffectiveHoldDrivers(scene, scene.compositions);
  const holdSourceEff: HoldSource = hasDrivers ? (playout.holdSource ?? 'timed') : 'timed';
  const showHoldMs = (mode === 'auto-out' || mode === 'loop-cycle') && holdSourceEff === 'timed';

  /** Default out-point at 75 % of the active region (leaves room for the exit). */
  function defaultMarker(): { outPoint: number } {
    const r = activeRangeOf(scene);
    const span = Math.max(1, r.out - r.in);
    return { outPoint: r.in + Math.round(span * 0.75) };
  }

  /**
   * D-104 follow-up — the content-start marker's DEFAULT frame: the LATEST entrance
   * keyframe strictly inside `(active.in, outPoint)`. This matches the runtime's
   * `entranceSettleFrame()` heuristic for a normal (monotonic, possibly multi-track)
   * entrance, so PINNING the marker makes the current behavior explicit without a jump;
   * the operator then drags it.
   *
   * The walk itself lives in `content-start-default.ts` (media-phases-follow-composition
   * extracted it: the follow hint derives its entrance span from the SAME default — one
   * definition, two callers).
   */
  function contentStartDefault(): number {
    const r = activeRangeOf(scene);
    const out = lifecycle?.outPoint ?? r.out;
    return contentStartDefaultFrom(scene.layers, r.in, out);
  }

  function changeMode(next: PlayoutMode): void {
    // `auto-out` / `loop-cycle` need an out-point (an exit segment) — seed a
    // sensible one so the mode does something out of the box (the operator
    // then drags it).
    if ((next === 'auto-out' || next === 'loop-cycle') && lifecycle === undefined) {
      designerStore.setLifecycle(defaultMarker());
    }
    designerStore.setPlayout({ mode: next });
  }

  return (
    <CollapseSection title="Playout" defaultExpanded>
      <div className={s.row}>
        <span className={s.label}>mode</span>
        <Select
          style={selectStyle}
          value={mode}
          aria-label="Playout mode"
          onChange={(e) => changeMode(e.target.value as PlayoutMode)}
        >
          {(Object.keys(MODE_LABELS) as PlayoutMode[]).map((m) => {
            // D-114 — `static` is the no-out-point mode; the animated modes require an out-point.
            // With no out-point only `static` is enabled; with one, `static` is disabled (you go
            // static by clearing the out-point, and leave it by adding one).
            const disabled = lifecycle === undefined ? m !== 'static' : m === 'static';
            return (
              <option key={m} value={m} disabled={disabled}>
                {MODE_LABELS[m]}
              </option>
            );
          })}
        </Select>
      </div>

      {hasContent && mode !== 'manual' && mode !== 'static' && (
        <div className={s.row}>
          <span className={s.label}>hold</span>
          <Select
            style={selectStyle}
            value={playout.holdSource ?? 'timed'}
            aria-label="Hold source"
            onChange={(e) => designerStore.setPlayout({ holdSource: e.target.value as HoldSource })}
          >
            {(Object.keys(HOLD_LABELS) as HoldSource[]).map((h) => (
              <option key={h} value={h}>
                {HOLD_LABELS[h]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {hasContent &&
        mode !== 'manual' &&
        mode !== 'static' &&
        playout.holdSource === 'content-driven' && <ContentHoldChecklist scene={scene} />}

      {showHoldMs && (
        <div className={s.row}>
          <span className={s.label}>hold ms</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RealtimeNumberInput
              style={holdMsNumStyle}
              scrub={false}
              min={0}
              step={100}
              value={playout.holdMs ?? 0}
              onCommit={(n) => designerStore.setPlayout({ holdMs: Math.max(0, Math.round(n)) })}
              ariaLabel="Hold duration in milliseconds"
            />
            <span style={mutedStyle}>ms</span>
          </div>
        </div>
      )}

      {lifecycle !== undefined ? (
        <>
          <div className={cls.actionRow}>
            <span className={cls.actionLabel}>Out point</span>
            <span className={cls.actionValue}>frame {String(lifecycle.outPoint)}</span>
            <Button variant="danger" size="sm" onClick={() => designerStore.setLifecycle(null)}>
              Clear out point
            </Button>
          </div>
          <p className={cls.caption}>
            Drag the marker on the timeline. Repeat is tuned live in the preview.
          </p>
        </>
      ) : (
        <>
          <div className={cls.actionRow}>
            <span className={cls.actionLabel}>Out point</span>
            <span className={cls.actionValue}>none — static</span>
            <Button
              variant="markerOut"
              size="sm"
              onClick={() => designerStore.setLifecycle(defaultMarker())}
            >
              Add out point
            </Button>
          </div>
          {/* `DESIGNER-FIX-0905` — the STATE stays inline; what the other modes are is read
              once, behind the `i`. The remedy is the button beside it. */}
          <StateLine
            tip={
              <InfoTip title="The out point and the modes">
                <p>
                  With no out point a composition is <strong>static</strong>: it plays in, holds its
                  last frame, and cuts on stop — no animated exit.
                </p>
                <p>
                  Adding an out point splits the timeline into an entrance, a hold and an exit, and
                  enables the other modes: <strong>manual</strong> (hold until the operator stops
                  it, then play the exit), <strong>auto-out</strong> (exit by itself after the hold)
                  and <strong>loop cycle</strong> (repeat in → hold → out). Drag the marker on the
                  timeline to move it.
                </p>
              </InfoTip>
            }
          >
            Static: plays in, holds, cuts on stop.
          </StateLine>
        </>
      )}

      {/*
       * D-133 — the HOLD LOOP range, offered on EVERY composition that has an out-point.
       * The `hasContent` half of this gate is GONE (design §9.2 / §3.5): a shapes-only
       * scene can pin its content start, because the loop range is the two SHIPPED
       * markers and needs no content element to exist. The `lifecycle !== undefined`
       * half is KEPT deliberately — `contentStart` is schema-constrained to
       * `[activeRange.in, outPoint]`, and creating an out-point changes what the
       * composition does ON AIR at stop time, so it stays the explicit "Add out point"
       * step above. NOTHING here calls `setLifecycle`.
       */}
      {lifecycle !== undefined && (
        <>
          {lifecycle.contentStart !== undefined ? (
            <>
              <div className={cls.actionRow}>
                <span className={cls.actionLabel}>Content start</span>
                <span className={cls.actionValue}>frame {String(lifecycle.contentStart)}</span>
                <Button
                  variant="danger"
                  size="sm"
                  // `title`, NOT `aria-label`: an aria-label would REPLACE the accessible
                  // name, leaving the visible text absent from it (WCAG 2.5.3 Label in Name)
                  // and breaking name-based locators. The tooltip supplements instead.
                  title="Reset the content start to automatic (entrance completion)"
                  onClick={() => designerStore.setContentStart(null)}
                >
                  Reset to auto
                </Button>
              </div>
              <p className={cls.caption}>Drag the cyan marker on the timeline.</p>
            </>
          ) : (
            <>
              <div className={cls.actionRow}>
                <span className={cls.actionLabel}>Content start</span>
                <span className={cls.actionValue}>auto (entrance)</span>
                <Button
                  variant="markerIn"
                  size="sm"
                  onClick={() => designerStore.setContentStart(contentStartDefault())}
                >
                  Pin content start
                </Button>
              </div>
              <p className={cls.caption}>
                Auto is the entrance’s completion. Pin it for an exact frame, then drag it on the
                timeline.
              </p>
            </>
          )}
          <HoldLoopRow
            reason={holdLoopInertReason(mode, playout.holdSource, hasDrivers)}
            from={lifecycle.contentStart ?? contentStartDefault()}
            to={lifecycle.outPoint}
          />
        </>
      )}
    </CollapseSection>
  );
}

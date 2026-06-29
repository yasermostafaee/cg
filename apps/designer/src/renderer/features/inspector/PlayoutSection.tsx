import type { CSSProperties } from 'react';
import {
  activeRangeOf,
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
import { CollapseSection } from './CollapseSection.js';
import { RealtimeNumberInput } from './controls.js';
import * as s from './InspectorPanel.css.js';
import * as cls from './PlayoutSection.css.js';

const MODE_LABELS: Record<PlayoutMode, string> = {
  manual: 'Manual — hold until stop',
  'auto-out': 'Auto-out — outro after hold',
  'loop-cycle': 'Loop cycle — repeat in → hold → out',
  // D-114 — the no-out-point mode: play in → hold → hard cut on stop, no animated exit.
  static: 'Static — plays in, holds, cut on stop (no out-point)',
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
function hasContentElement(scene: Scene): boolean {
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

type ContentKind = 'ticker' | 'sequence' | 'clock';
interface ContentHoldItem {
  id: string;
  name: string;
  type: ContentKind;
  drivesHold: boolean;
  /**
   * D-111 — a ticker/sequence authored with `repeat: 'infinite'`. Such a driver never
   * completes, so while it participates (`drivesHold`) the content-driven hold runs until
   * `stop()` (the graphic won't auto-close). A countdown clock is always finite ⇒ never true.
   */
  infinite: boolean;
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
function contentHoldElementsOf(scene: Scene): ContentHoldItem[] {
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
const linkBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.accent,
  cursor: 'pointer',
  fontSize: '0.66rem',
  padding: 0,
  textDecoration: 'underline',
};

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
  color: colors.danger,
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
  // D-111/D-112 — a content-driven hold is `Promise.all` over its EFFECTIVE drivers, so ANY
  // infinite-repeat driver (still effectively participating) keeps the graphic on air until stop().
  // Flag each such row; escalate to a prominent alert when EVERY effective driver (own + nested,
  // per-instance overrides applied) is infinite, so nothing can end the hold on content.
  const ownDrivers = items.filter((it) => it.drivesHold);
  const totalDrivers = ownDrivers.length + nested.reduce((n, g) => n + g.effectiveCount, 0);
  const infiniteDrivers =
    ownDrivers.filter((it) => it.infinite).length +
    nested.reduce((n, g) => n + g.effectiveInfinite, 0);
  const allInfinite = infiniteDrivers > 0 && infiniteDrivers === totalDrivers;
  const labels = disambiguate(items.map((it) => it.name));
  const nestedLabels = disambiguate(nested.map((g) => g.name));
  return (
    <>
      {allInfinite && (
        <div className={s.row} style={{ display: 'block' }}>
          <Callout variant="danger">
            This graphic won’t auto-close — every content driver repeats forever, so the
            content-driven hold runs until stop. Give a driver a finite repeat, exclude one below,
            or switch to a timed hold.
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
   * keyframe strictly inside `(active.in, outPoint)` across the comp's animated elements
   * — i.e. where the entrance has finished moving. This matches the runtime's
   * `entranceSettleFrame()` heuristic for a normal (monotonic, possibly multi-track)
   * entrance, so PINNING the marker makes the current behavior explicit without a jump;
   * the operator then drags it. Falls back to `outPoint` when there is no entrance to
   * settle (a continuous in→out animation, or none).
   */
  function contentStartDefault(): number {
    const r = activeRangeOf(scene);
    const out = lifecycle?.outPoint ?? r.out;
    let settle = -1;
    const walk = (els: readonly Element[]): void => {
      for (const el of els) {
        if (el.animation !== undefined) {
          for (const track of Object.values(el.animation.tracks)) {
            if (track === undefined) continue;
            for (const kf of track.keyframes) {
              if (kf.frame > r.in && kf.frame < out && kf.frame > settle) settle = kf.frame;
            }
          }
        }
        if (el.type === 'container') walk(el.children);
      }
    };
    for (const layer of scene.layers) walk(layer.children);
    return settle < 0 ? out : settle;
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
        <p style={hintStyle}>
          Out point @ frame {String(lifecycle.outPoint)} — drag the marker on the timeline. Repeat
          is tuned live in the preview.{' '}
          <Button
            variant="bare"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(null)}
          >
            Clear
          </Button>
        </p>
      ) : (
        <p style={hintStyle}>
          No out point — this composition is <strong>static</strong> (plays in, holds, cut on stop).{' '}
          <Button
            variant="bare"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(defaultMarker())}
          >
            Add an out point
          </Button>{' '}
          to enable manual / auto-out / loop-cycle (in → hold → out), then drag it on the timeline.
        </p>
      )}

      {lifecycle !== undefined &&
        hasContent &&
        (lifecycle.contentStart !== undefined ? (
          <p style={hintStyle}>
            Content start @ frame {String(lifecycle.contentStart)} — drag the cyan marker on the
            timeline.{' '}
            <Button
              variant="bare"
              style={linkBtnStyle}
              onClick={() => designerStore.setContentStart(null)}
            >
              Reset to auto
            </Button>
          </p>
        ) : (
          <p style={hintStyle}>
            Content starts automatically at the entrance completion.{' '}
            <Button
              variant="bare"
              style={linkBtnStyle}
              onClick={() => designerStore.setContentStart(contentStartDefault())}
            >
              Pin a content start
            </Button>{' '}
            to set the exact frame, then drag it on the timeline.
          </p>
        ))}
    </CollapseSection>
  );
}

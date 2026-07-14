import { compositionInstancesOf, type Element, type Scene } from '@cg/shared-schema';
import {
  effectiveMode,
  PreviewCountdownTimingRow,
  PreviewSequenceTimingRow,
  PreviewTickerTimingRow,
  PreviewTimingControls,
  TIMING_RELEVANT_MODES,
  type CountdownTimingOverride,
  type SequenceTimingOverride,
  type TickerTimingOverride,
  type TimingOverride,
  type TimingSource,
} from './PreviewTimingControls.js';

/**
 * D-026 — one node in the preview's per-scope timing tree: a composition instance
 * scope, addressed by the SAME instance-name path the runtime + D-025 field scopes
 * use (`''` = root/this composition, `'home'` a child instance, `'home.inner'` a
 * grandchild). `source` carries the scope's stored playout/lifecycle so the control
 * shows the effective mode + out-point.
 */
export interface TimingScopeNode {
  path: string;
  /** Display label — the composition name for the root, else the instance name. */
  label: string;
  source: TimingSource;
  depth: number;
  /** D-102 Phase 1 — EVERY ticker in the scope (recursing containers); each is tuned on its own row. */
  tickers: TickerInfo[];
  /** D-102 Phase 2 — EVERY sequence in the scope; each is tuned on its own row. */
  sequences: SequenceInfo[];
  /** D-102 Phase 2 — EVERY COUNTDOWN clock in the scope (wall / countup are never listed). */
  countdowns: CountdownInfo[];
  /**
   * B-031 — whether the scope has ANY content source (ticker / countdown clock /
   * sequence) — directly OR inside a nested composition instance (cycle-guarded) — so a
   * parent whose closing content is entirely nested IS offered the content-driven hold,
   * matching the inspector's recursive `hasContentElement`.
   */
  hasContent: boolean;
}

/** D-102 Phase 1 — a ticker in a scope: element id + name + authored resting repeat/boundary. */
export interface TickerInfo {
  id: string;
  name: string;
  repeat: number | 'infinite';
  cycleBoundary: 'seamless' | 'drain';
}

/** D-102 Phase 2 — a sequence in a scope: element id + name + authored passes / per-item dwell. */
export interface SequenceInfo {
  id: string;
  name: string;
  repeat: number | 'infinite';
  defaultDwellMs: number;
}

/**
 * D-102 Phase 2 — a COUNTDOWN clock in a scope: element id + name + its authored target, either a
 * `durationMs` or an absolute `deadline` (ISO). `wall` / `countup` clocks never complete, so they
 * have no timing to tune and are never collected.
 */
export interface CountdownInfo {
  id: string;
  name: string;
  durationMs?: number | undefined;
  deadline?: string | undefined;
}

/** D-102 Phase 2 — the tunable content elements of ONE scope, by kind. */
export interface ScopeContent {
  tickers: TickerInfo[];
  sequences: SequenceInfo[];
  countdowns: CountdownInfo[];
}

const MAX_DEPTH = 8;

/**
 * D-102 Phase 1 — suffix DUPLICATE ticker names so each per-ticker row is distinguishable. There
 * is no element-rename UI yet, so two fresh tickers both read "Ticker"; without this the operator
 * couldn't tell the two timing rows apart (the whole point of per-ticker control). Unique names
 * are left untouched.
 */
export function disambiguateNames(names: readonly string[]): string[] {
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

/**
 * D-102 — every TUNABLE content element of a doc, in document order: tickers (Phase 1) plus
 * sequences and COUNTDOWN clocks (Phase 2). Recurses containers, and — Phase 2 — descends a
 * REPEATER into its child composition (depth-/cycle-guarded like the scene-builder), because the
 * runtime STAMPS that composition's content into row subtrees that the composition-instance tree
 * below never visits: without this descent a ticker that exists only inside a repeater's child is
 * invisible in the panel and cannot be tuned. Every stamped row is built from the SAME authored
 * element, so ONE row governs them all (see the runtime's inherited element-timing map).
 *
 * Composition INSTANCES are deliberately NOT descended — each is its own scope node with its own
 * timing section. `wall` / `countup` clocks are never collected: they never complete, so there is
 * no timing to tune (the same rule the content-driven hold uses).
 */
function contentOf(doc: { layers: Scene['layers'] }, scene: Scene): ScopeContent {
  const out: ScopeContent = { tickers: [], sequences: [], countdowns: [] };
  const walk = (
    children: readonly Element[],
    depth: number,
    visited: ReadonlySet<string>,
  ): void => {
    for (const el of children) {
      // B-034 — a HIDDEN element (`visible: false`) is inert: neither it nor (for a container /
      // repeater) its whole subtree is shown in the preview timing list.
      if (el.visible === false) continue;
      if (el.type === 'ticker') {
        out.tickers.push({
          id: el.id,
          name: el.name,
          repeat: el.repeat,
          cycleBoundary: el.cycleBoundary,
        });
      } else if (el.type === 'sequence') {
        out.sequences.push({
          id: el.id,
          name: el.name,
          repeat: el.repeat,
          defaultDwellMs: el.defaultDwellMs,
        });
      } else if (el.type === 'clock' && el.mode === 'countdown') {
        out.countdowns.push({
          id: el.id,
          name: el.name,
          durationMs: el.target?.kind === 'duration' ? el.target.ms : undefined,
          deadline: el.target?.kind === 'datetime' ? el.target.iso : undefined,
        });
      } else if (el.type === 'container') {
        walk(el.children, depth, visited);
      } else if (el.type === 'repeater') {
        // D-102 Phase 2 — descend the stamped child composition (the rows the runtime builds), with
        // the scene-builder's depth + cycle guards so a self/mutually-referencing repeater can't loop.
        if (depth >= MAX_DEPTH || visited.has(el.compositionId)) continue;
        const comp = scene.compositions?.find((c) => c.id === el.compositionId);
        if (comp === undefined) continue;
        const nested = new Set([...visited, el.compositionId]);
        for (const layer of comp.layers) walk(layer.children, depth + 1, nested);
      }
    }
  };
  for (const layer of doc.layers) walk(layer.children, 0, new Set<string>());
  return out;
}

/**
 * B-031 — does the scope have ANY content source (ticker / countdown clock / sequence)
 * — directly OR inside a nested composition instance (resolving `scene.compositions`,
 * cycle-guarded), matching the inspector's recursive `hasContentElement`? A parent
 * whose closing content lives entirely in a nested composition is therefore OFFERED the
 * content-driven hold in the preview (previously a shallow check hid it).
 */
function hasAnyContentIn(doc: { layers: Scene['layers'] }, scene: Scene): boolean {
  const visited = new Set<string>();
  const walk = (children: readonly Element[]): boolean =>
    children.some((el) => {
      if (
        (el.type === 'ticker' ||
          el.type === 'sequence' ||
          (el.type === 'clock' && el.mode === 'countdown')) &&
        // B-034 — a HIDDEN content element is inert (not offered as content-driven in the preview).
        el.visible !== false
      ) {
        return true;
      }
      // B-034 — a HIDDEN container / instance makes its WHOLE subtree inert (mirrors render + runtime).
      if (el.type === 'container') return el.visible !== false && walk(el.children);
      if (el.type === 'composition') {
        if (el.visible === false || visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = scene.compositions?.find((c) => c.id === el.compositionId);
        return comp !== undefined && comp.layers.some((l) => walk(l.children));
      }
      return false;
    });
  return doc.layers.some((l) => walk(l.children));
}

/**
 * Flatten the composition-instance tree (root first, DFS) into per-scope timing
 * nodes. Mirrors the runtime's controller-tree paths and the scene-builder's
 * depth/visited guards so a cyclic graph can't loop forever.
 */
export function timingScopeList(scene: Scene): TimingScopeNode[] {
  const out: TimingScopeNode[] = [
    {
      path: '',
      label: scene.name,
      source: scene,
      depth: 0,
      ...contentOf(scene, scene),
      hasContent: hasAnyContentIn(scene, scene),
    },
  ];
  const walk = (
    doc: { layers: Scene['layers'] },
    parentPath: string,
    depth: number,
    visited: ReadonlySet<string>,
  ): void => {
    if (depth > MAX_DEPTH) return;
    for (const inst of compositionInstancesOf(doc)) {
      // B-034 — a HIDDEN instance's whole subtree is inert: no preview-timing scope (skip + don't
      // recurse), so its tickers/hold offer never surface (mirrors render + the runtime hold).
      if (inst.visible === false || visited.has(inst.compositionId)) continue;
      const comp = scene.compositions?.find((c) => c.id === inst.compositionId);
      if (comp === undefined) continue;
      const path = parentPath === '' ? inst.name : `${parentPath}.${inst.name}`;
      out.push({
        path,
        label: inst.name,
        source: comp,
        depth,
        ...contentOf(comp, scene),
        hasContent: hasAnyContentIn(comp, scene),
      });
      walk(comp, path, depth + 1, new Set([...visited, inst.compositionId]));
    }
  };
  walk(scene, '', 1, new Set<string>());
  return out;
}

/**
 * D-026 / D-102 — PER-SCOPE session-only timing controls, grouped by the
 * composition-instance tree. Each scope gets its own LIFECYCLE override (mode /
 * holdMs / repeat); D-102 — every CONTENT element of a scope gets its own timing row,
 * nested under the scope's lifecycle controls and addressed by the element's id, so
 * two content elements in one composition are tuned independently: tickers (Phase 1 —
 * repeat + cycle-seam), sequences (Phase 2 — passes + item dwell) and COUNTDOWN clocks
 * (Phase 2 — preview duration; wall / countup are never listed). All session-only
 * (stored defaults untouched). The active composition (root) is always shown; a NESTED
 * scope is shown only when its mode is timing-relevant.
 */
export function PreviewScopeTiming({
  scene,
  overrides,
  onChange,
}: {
  scene: Scene;
  overrides: Record<string, TimingOverride>;
  onChange: (path: string, patch: TimingOverride) => void;
}): JSX.Element {
  const scopes = timingScopeList(scene);
  const visible = scopes.filter(
    (node) =>
      node.path === '' ||
      TIMING_RELEVANT_MODES.has(effectiveMode(node.source, overrides[node.path] ?? {})),
  );
  return (
    <>
      {visible.map((node, i) => {
        const scopeOverride = overrides[node.path] ?? {};
        // Display labels only — the override is always keyed by the element's id below. Names are
        // disambiguated WITHIN each kind (the row labels carry the axis, e.g. "— passes"/"— dwell").
        const tickerLabels = disambiguateNames(node.tickers.map((tk) => tk.name));
        const sequenceLabels = disambiguateNames(node.sequences.map((sq) => sq.name));
        const countdownLabels = disambiguateNames(node.countdowns.map((cd) => cd.name));
        // D-102 Phase 1 — deep-merge a per-ticker patch into the scope override's `tickers` map so
        // editing ticker B never clobbers ticker A; the modal's per-scope shallow merge carries it.
        const setTickerOverride = (tickerId: string, patch: TickerTimingOverride): void => {
          onChange(node.path, {
            tickers: {
              ...(scopeOverride.tickers ?? {}),
              [tickerId]: { ...(scopeOverride.tickers?.[tickerId] ?? {}), ...patch },
            },
          });
        };
        // D-102 Phase 2 — same deep-merge, per kind: one element's patch never clobbers another's.
        const setSequenceOverride = (sequenceId: string, patch: SequenceTimingOverride): void => {
          onChange(node.path, {
            sequences: {
              ...(scopeOverride.sequences ?? {}),
              [sequenceId]: { ...(scopeOverride.sequences?.[sequenceId] ?? {}), ...patch },
            },
          });
        };
        const setCountdownOverride = (clockId: string, patch: CountdownTimingOverride): void => {
          onChange(node.path, {
            countdowns: {
              ...(scopeOverride.countdowns ?? {}),
              [clockId]: { ...(scopeOverride.countdowns?.[clockId] ?? {}), ...patch },
            },
          });
        };
        return (
          <div key={node.path} style={node.depth > 0 ? { marginLeft: node.depth * 12 } : undefined}>
            <PreviewTimingControls
              source={node.source}
              title={node.path === '' ? 'Timing (session)' : `Timing — ${node.label}`}
              defaultExpanded={node.path === ''}
              showFooter={i === visible.length - 1}
              hasContent={node.hasContent}
              override={scopeOverride}
              onChange={(patch) => onChange(node.path, patch)}
            >
              {node.tickers.map((tk, ti) => (
                <PreviewTickerTimingRow
                  key={tk.id}
                  name={tickerLabels[ti] ?? tk.name}
                  defaults={{ repeat: tk.repeat, cycleBoundary: tk.cycleBoundary }}
                  override={scopeOverride.tickers?.[tk.id] ?? {}}
                  onChange={(patch) => setTickerOverride(tk.id, patch)}
                />
              ))}
              {node.sequences.map((sq, si) => (
                <PreviewSequenceTimingRow
                  key={sq.id}
                  name={sequenceLabels[si] ?? sq.name}
                  defaults={{ repeat: sq.repeat, defaultDwellMs: sq.defaultDwellMs }}
                  override={scopeOverride.sequences?.[sq.id] ?? {}}
                  onChange={(patch) => setSequenceOverride(sq.id, patch)}
                />
              ))}
              {node.countdowns.map((cd, ci) => (
                <PreviewCountdownTimingRow
                  key={cd.id}
                  name={countdownLabels[ci] ?? cd.name}
                  defaults={{ durationMs: cd.durationMs, deadline: cd.deadline }}
                  override={scopeOverride.countdowns?.[cd.id] ?? {}}
                  onChange={(patch) => setCountdownOverride(cd.id, patch)}
                />
              ))}
            </PreviewTimingControls>
          </div>
        );
      })}
    </>
  );
}

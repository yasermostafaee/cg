import { compositionInstancesOf, type Element, type Scene } from '@cg/shared-schema';
import {
  effectiveMode,
  PreviewTimingControls,
  TIMING_RELEVANT_MODES,
  type TickerTimingDefaults,
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
  /** D-028 — the scope's first ticker's authored repeat/boundary (resting UI values). */
  tickerDefaults: TickerTimingDefaults | null;
  /** D-027 — whether the scope contains a countdown clock (a content source). */
  hasCountdownClock: boolean;
}

const MAX_DEPTH = 8;

/** D-028 — the scope's first ticker element (recursing containers), if any. */
function firstTickerOf(doc: { layers: Scene['layers'] }): TickerTimingDefaults | null {
  const walk = (children: readonly Element[]): TickerTimingDefaults | null => {
    for (const el of children) {
      if (el.type === 'ticker') return { repeat: el.repeat, boundary: el.cycleBoundary };
      if (el.type === 'container') {
        const found = walk(el.children);
        if (found !== null) return found;
      }
    }
    return null;
  };
  for (const layer of doc.layers) {
    const found = walk(layer.children);
    if (found !== null) return found;
  }
  return null;
}

/** D-027 — does the scope contain a countdown clock (recursing containers)? */
function hasCountdownClockIn(doc: { layers: Scene['layers'] }): boolean {
  const walk = (children: readonly Element[]): boolean =>
    children.some(
      (el) =>
        (el.type === 'clock' && el.mode === 'countdown') ||
        (el.type === 'container' && walk(el.children)),
    );
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
      tickerDefaults: firstTickerOf(scene),
      hasCountdownClock: hasCountdownClockIn(scene),
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
      if (visited.has(inst.compositionId)) continue;
      const comp = scene.compositions?.find((c) => c.id === inst.compositionId);
      if (comp === undefined) continue;
      const path = parentPath === '' ? inst.name : `${parentPath}.${inst.name}`;
      out.push({
        path,
        label: inst.name,
        source: comp,
        depth,
        tickerDefaults: firstTickerOf(comp),
        hasCountdownClock: hasCountdownClockIn(comp),
      });
      walk(comp, path, depth + 1, new Set([...visited, inst.compositionId]));
    }
  };
  walk(scene, '', 1, new Set<string>());
  return out;
}

/**
 * D-026 — PER-SCOPE session-only timing controls, grouped by the composition-
 * instance tree (parent + each nested child, by instance name). Each scope gets
 * its own mode / holdMs / repeat override, applied to the preview run only (stored
 * defaults untouched), so a parent can independently test each child's timing
 * (e.g. `home` loops 3×, `away` loops infinitely). The active composition (root) is
 * always shown; a NESTED scope is shown only when its mode is timing-relevant
 * (auto-out / loop-cycle / content-driven), to keep the panel uncluttered.
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
      {visible.map((node, i) => (
        <div key={node.path} style={node.depth > 0 ? { marginLeft: node.depth * 12 } : undefined}>
          <PreviewTimingControls
            source={node.source}
            title={node.path === '' ? 'Timing (session)' : `Timing — ${node.label}`}
            defaultExpanded={node.path === ''}
            showFooter={i === visible.length - 1}
            hasTicker={node.tickerDefaults !== null}
            hasContent={node.tickerDefaults !== null || node.hasCountdownClock}
            tickerDefaults={node.tickerDefaults}
            override={overrides[node.path] ?? {}}
            onChange={(patch) => onChange(node.path, patch)}
          />
        </div>
      ))}
    </>
  );
}

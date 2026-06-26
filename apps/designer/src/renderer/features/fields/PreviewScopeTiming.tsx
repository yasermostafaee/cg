import { compositionInstancesOf, type Element, type Scene } from '@cg/shared-schema';
import {
  effectiveMode,
  PreviewTickerTimingRow,
  PreviewTimingControls,
  TIMING_RELEVANT_MODES,
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
  /** D-027/D-029 — whether the scope contains a non-ticker content source
   *  (a countdown clock or a sequence). */
  hasOtherContent: boolean;
}

/** D-102 Phase 1 — a ticker in a scope: element id + name + authored resting repeat/boundary. */
export interface TickerInfo {
  id: string;
  name: string;
  repeat: number | 'infinite';
  cycleBoundary: 'seamless' | 'drain';
}

const MAX_DEPTH = 8;

/** D-102 Phase 1 — every ticker element of a doc (recursing containers), in document order. */
function tickersOf(doc: { layers: Scene['layers'] }): TickerInfo[] {
  const out: TickerInfo[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'ticker') {
        out.push({ id: el.id, name: el.name, repeat: el.repeat, cycleBoundary: el.cycleBoundary });
      } else if (el.type === 'container') {
        walk(el.children);
      }
    }
  };
  for (const layer of doc.layers) walk(layer.children);
  return out;
}

/** D-027/D-029 — does the scope contain a countdown clock or a sequence? */
function hasOtherContentIn(doc: { layers: Scene['layers'] }): boolean {
  const walk = (children: readonly Element[]): boolean =>
    children.some(
      (el) =>
        (el.type === 'clock' && el.mode === 'countdown') ||
        el.type === 'sequence' ||
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
      tickers: tickersOf(scene),
      hasOtherContent: hasOtherContentIn(scene),
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
        tickers: tickersOf(comp),
        hasOtherContent: hasOtherContentIn(comp),
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
 * holdMs / repeat); D-102 Phase 1 — EVERY ticker of a scope gets its OWN repeat +
 * cycle-seam row, nested under the scope's lifecycle controls, addressed by the
 * ticker's element id, so two tickers in one composition are tuned independently.
 * All session-only (stored defaults untouched). The active composition (root) is
 * always shown; a NESTED scope is shown only when its mode is timing-relevant.
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
        return (
          <div key={node.path} style={node.depth > 0 ? { marginLeft: node.depth * 12 } : undefined}>
            <PreviewTimingControls
              source={node.source}
              title={node.path === '' ? 'Timing (session)' : `Timing — ${node.label}`}
              defaultExpanded={node.path === ''}
              showFooter={i === visible.length - 1}
              hasContent={node.tickers.length > 0 || node.hasOtherContent}
              override={scopeOverride}
              onChange={(patch) => onChange(node.path, patch)}
            >
              {node.tickers.map((tk) => (
                <PreviewTickerTimingRow
                  key={tk.id}
                  name={tk.name}
                  defaults={{ repeat: tk.repeat, cycleBoundary: tk.cycleBoundary }}
                  override={scopeOverride.tickers?.[tk.id] ?? {}}
                  onChange={(patch) => setTickerOverride(tk.id, patch)}
                />
              ))}
            </PreviewTimingControls>
          </div>
        );
      })}
    </>
  );
}

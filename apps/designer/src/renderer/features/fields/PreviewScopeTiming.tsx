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
        el.type === 'ticker' ||
        el.type === 'sequence' ||
        (el.type === 'clock' && el.mode === 'countdown')
      ) {
        return true;
      }
      if (el.type === 'container') return walk(el.children);
      if (el.type === 'composition') {
        if (visited.has(el.compositionId)) return false;
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
      tickers: tickersOf(scene),
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
        // Display labels only — the override is always keyed by the ticker's element id below.
        const tickerLabels = disambiguateNames(node.tickers.map((tk) => tk.name));
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
            </PreviewTimingControls>
          </div>
        );
      })}
    </>
  );
}

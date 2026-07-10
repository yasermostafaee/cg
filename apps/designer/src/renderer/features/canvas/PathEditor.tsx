import { useEffect, useState } from 'react';
import type { AnchorPoint, Element, PathElement } from '@cg/shared-schema';
import { pathVisualBBox } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { normalizePathPoints } from '../../state/element-defaults.js';
import { inverseToLocal } from './hit-test.js';
import { localToScene } from './geometry.js';
import { AnchorContextMenu, type AnchorMenuItem } from './AnchorContextMenu.js';

interface Props {
  element: PathElement;
  scale: number;
}

let insertSeq = 0;
const newAnchorId = (): string => `pt-${Date.now().toString(36)}-i${(insertSeq++).toString(36)}`;

/** Samples per segment for the nearest-point-on-curve search (Issue D inserts). */
const NEAREST_STEPS = 32;
/** B-057 — click-vs-drag guard for insertion, in SCREEN px (zoom-independent). */
const INSERT_SMOOTH_PX = 3;

/** The context menu's target: an anchor (Delete point) or a segment (Add …). */
type MenuState =
  | { kind: 'anchor'; x: number; y: number; anchorId: string }
  | {
      kind: 'segment';
      x: number;
      y: number;
      segIndex: number;
      point: { x: number; y: number };
      tangent: { x: number; y: number };
    };

/** Evaluate the segment a→b (runtime control-point convention) at `t`. */
function segmentAt(a: AnchorPoint, b: AnchorPoint, t: number): { x: number; y: number } {
  const c1x = a.x + (a.out?.x ?? 0);
  const c1y = a.y + (a.out?.y ?? 0);
  const c2x = b.x + (b.in?.x ?? 0);
  const c2y = b.y + (b.in?.y ?? 0);
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y,
  };
}

/** The segment's derivative (tangent direction) at `t`. */
function segmentTangentAt(a: AnchorPoint, b: AnchorPoint, t: number): { x: number; y: number } {
  const c1x = a.x + (a.out?.x ?? 0);
  const c1y = a.y + (a.out?.y ?? 0);
  const c2x = b.x + (b.in?.x ?? 0);
  const c2y = b.y + (b.in?.y ?? 0);
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (c1x - a.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (b.x - c2x),
    y: 3 * mt * mt * (c1y - a.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (b.y - c2y),
  };
}

/**
 * D-109/D-123/D-124/B-061/B-063 — the path edit overlay (POINT-EDIT MODE only,
 * mounted by CanvasOverlay on double-click): draggable anchor squares + bézier
 * handle dots over the selected path. Dragging an anchor moves it; dragging a
 * handle reshapes the adjacent segments (a SMOOTH anchor keeps its two handles
 * mirrored, Alt breaks the pair); Delete removes the active anchor. Insertion is
 * INTENTIONAL: while Ctrl/Cmd is held the segment hit-CURVES show the copy cursor
 * and a click inserts a CORNER / a click-drag a SMOOTH anchor (B-056 semantics,
 * at the NEAREST point on the real curve); right-clicking a segment opens the
 * shared context menu with "Add point" / "Add curve point" (tangent-aligned
 * mirrored handles), and right-clicking an anchor opens it with "Delete point" —
 * all through the same normalize + one-undo-entry route.
 *
 * Coordinates (B-061): `screen()` maps point space → box-local (the visual-bbox
 * frame, `size == pathVisualBBox` under the owner model) → the element's FULL
 * `Scale·Rotate`-about-anchor transform (`localToScene`) → screen px, so the
 * overlay tracks a rotated/scaled shape; pointer deltas run the exact inverse
 * (unscale, unrotate, unmap). Positions invert via `inverseToLocal` (hit-test's
 * shared core).
 */
export function PathEditor({ element, scale }: Props): JSX.Element {
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // D-124 — the segment add-point affordance (copy cursor) shows only while
  // Ctrl/Cmd is held; tracked live from key events, re-synced from pointer moves
  // and cleared on blur. The hit-curves stay interactive regardless so a
  // right-click can open the Add menu — a PLAIN left press falls through
  // (no stopPropagation) to normal select/drag behavior.
  const [insertModifier, setInsertModifier] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Control' || e.key === 'Meta') setInsertModifier(true);
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.key === 'Control' || e.key === 'Meta') setInsertModifier(false);
    }
    function onPointerSync(e: PointerEvent): void {
      setInsertModifier(e.ctrlKey || e.metaKey);
    }
    function onBlur(): void {
      setInsertModifier(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerSync);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerSync);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const pts = element.points;
  const t = element.transform;
  const vb = pathVisualBBox(pts, element.closed);
  const fx = t.size.w / Math.max(vb.w, 1);
  const fy = t.size.h / Math.max(vb.h, 1);

  /** point space → screen px, through the FULL element transform (B-061). */
  const screen = (px: number, py: number): { x: number; y: number } => {
    const s = localToScene(t, (px - vb.x) * fx, (py - vb.y) * fy);
    return { x: s.x * scale, y: s.y * scale };
  };

  /** Pointer DELTA (screen px) → point space: unzoom, unscale, unrotate, unmap. */
  const deltaToPointSpace = (dx: number, dy: number): { x: number; y: number } => {
    let vx = dx / scale / (t.scale.x === 0 ? 1 : t.scale.x);
    let vy = dy / scale / (t.scale.y === 0 ? 1 : t.scale.y);
    if (t.rotation !== 0) {
      const rad = (-t.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = vx * cos - vy * sin;
      const ry = vx * sin + vy * cos;
      vx = rx;
      vy = ry;
    }
    return { x: vx / fx, y: vy / fy };
  };

  /** Pointer POSITION (client px) → point space, via the hit-test inverse. */
  const clientToPointSpace = (e: {
    clientX: number;
    clientY: number;
    currentTarget: unknown;
  }): { x: number; y: number } | null => {
    const node = e.currentTarget as SVGGraphicsElement;
    const svg = node.ownerSVGElement ?? (node as unknown as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const scene = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
    const local = inverseToLocal(element, scene);
    if (local === null) return null;
    return { x: local.x / fx + vb.x, y: local.y / fy + vb.y };
  };

  function applyPoints(next: readonly AnchorPoint[]): void {
    const normalized = normalizePathPoints({ ...element, points: [...next] });
    designerStore.updateElement(element.id, {
      points: normalized.points,
      transform: normalized.transform,
    } as Partial<Element>);
  }

  function removeAnchor(id: string): void {
    if (pts.length <= 2) {
      designerStore.removeElement(element.id); // below 2 anchors → delete the element
      return;
    }
    applyPoints(pts.filter((p) => p.id !== id));
    designerStore.markHistoryBoundary();
    setActive(null);
  }

  /** Insert an anchor into segment `i` at the given point-space spot. */
  function insertAnchorAt(
    i: number,
    at: { x: number; y: number },
    handles?: { in: { x: number; y: number }; out: { x: number; y: number } },
  ): AnchorPoint {
    const mid: AnchorPoint = {
      id: newAnchorId(),
      x: at.x,
      y: at.y,
      smooth: handles !== undefined,
      ...(handles !== undefined ? { in: handles.in, out: handles.out } : {}),
    };
    const next = [...pts];
    next.splice(i + 1, 0, mid);
    applyPoints(next);
    setActive(mid.id);
    return mid;
  }

  /** Nearest sampled point on segment `i` to `pt` (point space) + its tangent. */
  function nearestOnSegment(
    i: number,
    pt: { x: number; y: number },
  ): { point: { x: number; y: number }; tangent: { x: number; y: number } } | null {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a === undefined || b === undefined) return null;
    let bestT = 0.5;
    let bestD = Infinity;
    for (let s = 1; s < NEAREST_STEPS; s++) {
      const tt = s / NEAREST_STEPS;
      const p = segmentAt(a, b, tt);
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) {
        bestD = d;
        bestT = tt;
      }
    }
    return { point: segmentAt(a, b, bestT), tangent: segmentTangentAt(a, b, bestT) };
  }

  // Delete / Backspace removes the active anchor. Capture phase + stopImmediate so it
  // pre-empts the global "delete selected element" shortcut while an anchor is active.
  // D-123 — inert while the context menu is open (the menu owns the keyboard then).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (active === null || menu !== null) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t2 = e.target;
      if (
        t2 instanceof HTMLElement &&
        (t2.tagName === 'INPUT' || t2.tagName === 'TEXTAREA' || t2.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      removeAnchor(active);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, menu, element]);

  function dragAnchor(id: string, e: React.PointerEvent): void {
    if (e.button !== 0) return; // right-press routes to the context menu
    e.stopPropagation();
    setActive(id);
    const base = pts.find((p) => p.id === id);
    if (base === undefined) return;
    const sX = e.clientX;
    const sY = e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const d = deltaToPointSpace(ev.clientX - sX, ev.clientY - sY);
      applyPoints(pts.map((p) => (p.id === id ? { ...p, x: base.x + d.x, y: base.y + d.y } : p)));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      designerStore.markHistoryBoundary();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function dragHandle(id: string, which: 'in' | 'out', e: React.PointerEvent): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    setActive(id);
    const breakPair = e.altKey;
    const base = pts.find((p) => p.id === id);
    if (base === undefined) return;
    const h0 = base[which] ?? { x: 0, y: 0 };
    const sX = e.clientX;
    const sY = e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const d = deltaToPointSpace(ev.clientX - sX, ev.clientY - sY);
      const nh = { x: h0.x + d.x, y: h0.y + d.y };
      applyPoints(
        pts.map((p) => {
          if (p.id !== id) return p;
          const smooth = breakPair ? false : p.smooth;
          const next: AnchorPoint = { ...p, smooth };
          if (which === 'in') {
            next.in = nh;
            if (smooth) next.out = { x: -nh.x, y: -nh.y };
          } else {
            next.out = nh;
            if (smooth) next.in = { x: -nh.x, y: -nh.y };
          }
          return next;
        }),
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      designerStore.markHistoryBoundary();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function insertOnSegment(i: number, e: React.PointerEvent): void {
    // D-124 — Ctrl/Cmd-gated; a plain press falls through (NO stopPropagation) so
    // clicking the outline still selects/drags the element normally.
    if (!e.ctrlKey && !e.metaKey) return;
    e.stopPropagation();
    const clickPt = clientToPointSpace(e);
    const near = clickPt !== null ? nearestOnSegment(i, clickPt) : null;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a === undefined || b === undefined) return;
    const at = near?.point ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mid = insertAnchorAt(i, at);
    // B-056 — drag before release pulls out mirrored handles (SMOOTH insert);
    // corner vs smooth decided at pointer-UP by the total SCREEN-px displacement
    // (the B-057 rule); ONE undo entry (boundary at pointer-up).
    const sX = e.clientX;
    const sY = e.clientY;
    const nextIds = [...pts.slice(0, i + 1), mid, ...pts.slice(i + 1)];
    const withMid = (make: (p: AnchorPoint) => AnchorPoint): void => {
      applyPoints(nextIds.map((p) => (p.id === mid.id ? make(p) : p)));
    };
    const asCorner = (p: AnchorPoint): AnchorPoint => ({
      id: p.id,
      x: p.x,
      y: p.y,
      smooth: false,
    });
    const belowGuard = (ev: PointerEvent): boolean =>
      Math.hypot(ev.clientX - sX, ev.clientY - sY) < INSERT_SMOOTH_PX;
    const onMove = (ev: PointerEvent): void => {
      if (belowGuard(ev)) {
        withMid(asCorner);
        return;
      }
      const h = deltaToPointSpace(ev.clientX - sX, ev.clientY - sY);
      withMid((p) => ({ ...p, smooth: true, out: h, in: { x: -h.x, y: -h.y } }));
    };
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (belowGuard(ev)) withMid(asCorner);
      designerStore.markHistoryBoundary();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /** Issue D — right-click a segment: Add point / Add curve point at the nearest
   *  spot on the real curve under the cursor. */
  function openSegmentMenu(i: number, e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const clickPt = clientToPointSpace(e as unknown as React.PointerEvent);
    const near = clickPt !== null ? nearestOnSegment(i, clickPt) : null;
    if (near === null) return;
    setMenu({
      kind: 'segment',
      x: e.clientX,
      y: e.clientY,
      segIndex: i,
      point: near.point,
      tangent: near.tangent,
    });
  }

  function menuItems(m: MenuState): AnchorMenuItem[] {
    if (m.kind === 'anchor') {
      return [{ label: 'Delete point', onSelect: () => removeAnchor(m.anchorId) }];
    }
    const addCorner = (): void => {
      insertAnchorAt(m.segIndex, m.point);
      designerStore.markHistoryBoundary();
    };
    const addSmooth = (): void => {
      // Tangent-aligned mirrored handles, sized to a modest fraction of the
      // segment chord — pull-out-able afterwards via the handle dots.
      const a = pts[m.segIndex];
      const b = pts[(m.segIndex + 1) % pts.length];
      const chord = a !== undefined && b !== undefined ? Math.hypot(b.x - a.x, b.y - a.y) : 24;
      const len = Math.hypot(m.tangent.x, m.tangent.y) || 1;
      const ux = m.tangent.x / len;
      const uy = m.tangent.y / len;
      const mag = Math.max(chord / 6, 4);
      insertAnchorAt(m.segIndex, m.point, {
        out: { x: ux * mag, y: uy * mag },
        in: { x: -ux * mag, y: -uy * mag },
      });
      designerStore.markHistoryBoundary();
    };
    return [
      { label: 'Add point', onSelect: addCorner },
      { label: 'Add curve point', onSelect: addSmooth },
    ];
  }

  const segCount = element.closed ? pts.length : pts.length - 1;
  return (
    // The context menu is HTML and can't live inside the <svg>, so the fragment
    // renders it as a sibling (position: fixed, viewport coords).
    <>
      {menu !== null && (
        <AnchorContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      <svg
        data-testid="path-editor"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: Math.max(segCount, 0) }, (_, i) => {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          if (a === undefined || b === undefined) return null;
          // B-063 — the hit surface IS the real curve (same control points the
          // runtime renders), mapped through the rotated screen transform —
          // never the straight chord.
          const pa = screen(a.x, a.y);
          const pb = screen(b.x, b.y);
          const straight = a.out === undefined && b.in === undefined;
          const c1 = screen(a.x + (a.out?.x ?? 0), a.y + (a.out?.y ?? 0));
          const c2 = screen(b.x + (b.in?.x ?? 0), b.y + (b.in?.y ?? 0));
          const n = (v: number): string => String(Math.round(v * 100) / 100);
          const d = straight
            ? `M ${n(pa.x)} ${n(pa.y)} L ${n(pb.x)} ${n(pb.y)}`
            : `M ${n(pa.x)} ${n(pa.y)} C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(pb.x)} ${n(pb.y)}`;
          return (
            <path
              key={`seg-${String(i)}`}
              data-cg-segment={String(i)}
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              style={{
                pointerEvents: 'stroke',
                // D-124 — the ADD affordance cursor only while Ctrl/Cmd is held;
                // otherwise the segment is a transparent pass-through for left
                // clicks (insertOnSegment returns without stopPropagation) and a
                // right-click target for the Add menu.
                cursor: insertModifier ? 'copy' : 'inherit',
              }}
              onPointerDown={(e) => {
                insertOnSegment(i, e);
              }}
              onContextMenu={(e) => {
                openSegmentMenu(i, e);
              }}
            />
          );
        })}
        {pts.map((p) =>
          p.id === active
            ? (['in', 'out'] as const).map((w) => {
                const h = p[w];
                if (h === undefined) return null;
                const pa = screen(p.x, p.y);
                const ph = screen(p.x + h.x, p.y + h.y);
                return (
                  <g key={`${p.id}-${w}`}>
                    <line
                      x1={pa.x}
                      y1={pa.y}
                      x2={ph.x}
                      y2={ph.y}
                      stroke="#3b82f6"
                      strokeWidth={1}
                    />
                    <circle
                      cx={ph.x}
                      cy={ph.y}
                      r={4}
                      fill="#ffffff"
                      stroke="#3b82f6"
                      style={{ pointerEvents: 'all', cursor: 'grab' }}
                      onPointerDown={(e) => {
                        dragHandle(p.id, w, e);
                      }}
                    />
                  </g>
                );
              })
            : null,
        )}
        {pts.map((p) => {
          const c = screen(p.x, p.y);
          const isActive = p.id === active;
          return (
            <rect
              key={p.id}
              data-cg-anchor={p.id}
              x={c.x - 4}
              y={c.y - 4}
              width={8}
              height={8}
              rx={p.smooth ? 4 : 0}
              fill={isActive ? '#3b82f6' : '#ffffff'}
              stroke="#3b82f6"
              strokeWidth={1}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onPointerDown={(e) => {
                dragAnchor(p.id, e);
              }}
              onContextMenu={(e) => {
                // D-123 — right-click an anchor: the Delete-point menu (anchor
                // squares only; segments open the Add menu instead).
                e.preventDefault();
                e.stopPropagation();
                setActive(p.id);
                setMenu({ kind: 'anchor', x: e.clientX, y: e.clientY, anchorId: p.id });
              }}
            />
          );
        })}
      </svg>
    </>
  );
}

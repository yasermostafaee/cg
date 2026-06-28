import { useEffect, useState } from 'react';
import type { AnchorPoint, Element, PathElement } from '@cg/shared-schema';
import { pathBBox } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { normalizePathPoints } from '../../state/element-defaults.js';

interface Props {
  element: PathElement;
  scale: number;
}

let insertSeq = 0;
const newAnchorId = (): string => `pt-${Date.now().toString(36)}-i${(insertSeq++).toString(36)}`;

/**
 * D-109 — the path edit overlay (the "edit affordance"): draggable anchor squares
 * and bézier handle dots over the selected path. Dragging an anchor moves it;
 * dragging a handle reshapes the adjacent segments (a SMOOTH anchor keeps its two
 * handles mirrored, Alt breaks the pair into an independent corner); clicking a
 * segment inserts an anchor; Delete removes the active anchor (re-stitching across
 * the gap, deleting the whole element below 2 anchors). Edits route through
 * `updateElement` (one undo per gesture via `markHistoryBoundary`).
 *
 * Coordinates: points are a 0-origin local frame; `screen()` maps them through the
 * element's `position` + the viewBox scale (`size / bbox`) so a resized path still
 * lines up. (Rotation is not reflected in the overlay handles — a v1 limitation.)
 */
export function PathEditor({ element, scale }: Props): JSX.Element {
  const [active, setActive] = useState<string | null>(null);
  const pts = element.points;
  const bbox = pathBBox(pts);
  const { size, position: pos } = element.transform;
  const sx = bbox.w === 0 ? 1 : size.w / bbox.w;
  const sy = bbox.h === 0 ? 1 : size.h / bbox.h;
  const screen = (lx: number, ly: number): { x: number; y: number } => ({
    x: (pos.x + (lx - bbox.x) * sx) * scale,
    y: (pos.y + (ly - bbox.y) * sy) * scale,
  });

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

  // Delete / Backspace removes the active anchor. Capture phase + stopImmediate so it
  // pre-empts the global "delete selected element" shortcut while an anchor is active.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (active === null) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      removeAnchor(active);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, element]);

  function dragAnchor(id: string, e: React.PointerEvent): void {
    e.stopPropagation();
    setActive(id);
    const base = pts.find((p) => p.id === id);
    if (base === undefined) return;
    const sX = e.clientX;
    const sY = e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const dlx = (ev.clientX - sX) / scale / sx;
      const dly = (ev.clientY - sY) / scale / sy;
      applyPoints(pts.map((p) => (p.id === id ? { ...p, x: base.x + dlx, y: base.y + dly } : p)));
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
    e.stopPropagation();
    setActive(id);
    const breakPair = e.altKey;
    const base = pts.find((p) => p.id === id);
    if (base === undefined) return;
    const h0 = base[which] ?? { x: 0, y: 0 };
    const sX = e.clientX;
    const sY = e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const nh = {
        x: h0.x + (ev.clientX - sX) / scale / sx,
        y: h0.y + (ev.clientY - sY) / scale / sy,
      };
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
    e.stopPropagation();
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a === undefined || b === undefined) return;
    const mid: AnchorPoint = {
      id: newAnchorId(),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      smooth: false,
    };
    const next = [...pts];
    next.splice(i + 1, 0, mid);
    applyPoints(next);
    designerStore.markHistoryBoundary();
    setActive(mid.id);
  }

  const segCount = element.closed ? pts.length : pts.length - 1;
  return (
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
        const pa = screen(a.x, a.y);
        const pb = screen(b.x, b.y);
        return (
          <line
            key={`seg-${String(i)}`}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke="transparent"
            strokeWidth={10}
            style={{ pointerEvents: 'stroke', cursor: 'copy' }}
            onPointerDown={(e) => {
              insertOnSegment(i, e);
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
                  <line x1={pa.x} y1={pa.y} x2={ph.x} y2={ph.y} stroke="#3b82f6" strokeWidth={1} />
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
          />
        );
      })}
    </svg>
  );
}

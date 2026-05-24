import { useRef } from 'react';
import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, type DesignerTool } from '../../state/store.js';
import { defaultShape, defaultText } from '../../state/element-defaults.js';
import { topmostHit } from './hit-test.js';
import { Gizmo } from './Gizmo.js';

interface Props {
  scene: Scene;
  tool: DesignerTool;
  selection: ReadonlySet<string>;
  scale: number;
}

const styles = {
  layer: {
    position: 'absolute' as const,
    inset: 0,
    pointerEvents: 'auto' as const,
  },
  toolHint: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    padding: '0.2rem 0.5rem',
    background: 'rgba(0, 0, 0, 0.6)',
    color: colors.textMuted,
    fontSize: '0.75rem',
    borderRadius: '0.25rem',
    pointerEvents: 'none' as const,
    letterSpacing: '0.05em',
  },
} as const;

/**
 * Transparent overlay on top of the cgpreview iframe. Captures clicks,
 * routes them to element-creation (when a creator tool is active) or
 * selection (cursor tool), and hosts the Gizmo for the selected element.
 *
 * The iframe underneath renders the live template-runtime preview; this
 * overlay sits above it and steals pointer events. (The iframe still
 * receives `postMessage` field updates from the Inspector.)
 */
export function CanvasOverlay({ scene, tool, selection, scale }: Props): JSX.Element {
  const layerRef = useRef<HTMLDivElement>(null);

  const allElements: Element[] = [];
  for (const layer of scene.layers) {
    for (const el of layer.children) allElements.push(el);
  }
  const selectedEl =
    selection.size === 1 ? (allElements.find((e) => selection.has(e.id)) ?? null) : null;

  function viewportToScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = layerRef.current?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    const scenePoint = viewportToScene(e.clientX, e.clientY);
    if (tool === 'cursor') {
      const hit = topmostHit(allElements, scenePoint);
      if (hit !== null) {
        designerStore.setSelection([hit.id]);
        beginDrag(hit.id, scale, e.nativeEvent);
      } else {
        designerStore.setSelection([]);
      }
      return;
    }
    if (tool === 'text') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultText(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'shape') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultShape(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'image') {
      // Image needs an asset — for M6.4 we surface a hint; the asset
      // pick flow lands with M6.6 / asset library polish.
      window.alert('Import an image asset via the Library first (M6.4 placeholder).');
    }
  }

  const cursorStyle = tool === 'cursor' ? 'default' : 'crosshair';

  return (
    <div
      ref={layerRef}
      style={{ ...styles.layer, cursor: cursorStyle }}
      onPointerDown={onPointerDown}
    >
      {selectedEl !== null && <Gizmo element={selectedEl} scale={scale} />}
      <div style={styles.toolHint}>{tool.toUpperCase()}</div>
    </div>
  );
}

function beginDrag(elementId: string, scale: number, ev: PointerEvent): void {
  const state = designerStore.get();
  if (state.scene === null) return;
  let element: Element | null = null;
  for (const layer of state.scene.layers) {
    for (const el of layer.children) {
      if (el.id === elementId) {
        element = el;
        break;
      }
    }
  }
  if (element === null) return;
  const startX = ev.clientX;
  const startY = ev.clientY;
  const startPos = { x: element.transform.position.x, y: element.transform.position.y };
  let moved = false;
  const onMove = (e: PointerEvent): void => {
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return; // click vs drag
    moved = true;
    designerStore.updateTransform(elementId, {
      position: { x: startPos.x + dx, y: startPos.y + dy },
    });
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

import type { Element } from './elements.js';
import { migratePathGeometry } from './elements.js';
import type { Composition, Layer, Scene } from './scene.js';

/**
 * B-059/B-062 — walk a whole Scene and migrate every `path` element to the
 * size==visualBBox convention (see {@link migratePathGeometry}). IDENTITY
 * PRESERVING: a scene with no legacy paths returns the SAME object reference —
 * the Designer's dirty tracking compares by identity, and a load must not mark a
 * clean project dirty. Runs at Designer scene load AND runtime scene ingestion
 * (legacy `.vcg` packages render pixel-identically without rewriting the signed
 * package).
 */
export function migrateScenePaths(scene: Scene): Scene {
  // Tolerate minimal/partial fixtures (the schema guarantees layers, but store
  // tests construct hand-rolled scenes).
  if (!Array.isArray(scene.layers)) return scene;
  const layers = migrateLayers(scene.layers);
  let compositions = scene.compositions;
  if (compositions !== undefined) {
    let changed = false;
    const next: Composition[] = compositions.map((c) => {
      const l = migrateLayers(c.layers);
      if (l === c.layers) return c;
      changed = true;
      return { ...c, layers: [...l] };
    });
    if (changed) compositions = next;
  }
  if (layers === scene.layers && compositions === scene.compositions) return scene;
  return {
    ...scene,
    layers: [...layers],
    ...(compositions !== undefined ? { compositions } : {}),
  };
}

function migrateLayers(layers: readonly Layer[]): readonly Layer[] {
  if (!Array.isArray(layers)) return layers; // tolerate partial fixtures
  let changed = false;
  const next = layers.map((layer) => {
    const children = migrateChildren(layer.children);
    if (children === layer.children) return layer;
    changed = true;
    return { ...layer, children: [...children] };
  });
  return changed ? next : layers;
}

function migrateChildren(children: readonly Element[]): readonly Element[] {
  if (!Array.isArray(children)) return children; // tolerate partial fixtures
  let changed = false;
  const next = children.map((el) => {
    const m = migrateElement(el);
    if (m !== el) changed = true;
    return m;
  });
  return changed ? next : children;
}

function migrateElement(el: Element): Element {
  if (el.type === 'path') return migratePathGeometry(el);
  if (el.type === 'container') {
    const children = migrateChildren(el.children);
    if (children === el.children) return el;
    return { ...el, children: [...children] };
  }
  return el;
}

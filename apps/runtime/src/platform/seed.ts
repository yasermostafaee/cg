import {
  TEMPLATE_TIMING_VERSION,
  templateTimingOf,
  resolveDefaultPosition,
  type Scene,
  type StackItemState,
} from '@cg/shared-schema';
import type { ConnectionConfig, ConnectionHealth, TemplateInfo } from '@cg/shared-ipc';
import { collectLiveSources } from '@cg/vcg-format';
import { STARTER_TEMPLATES } from '@cg/starter-templates';

/**
 * Demo seed data for the mock runtime. Until the CasparCG bridge lands
 * (browsers can't open raw TCP/UDP), the playout controller runs against
 * an in-memory simulation: templates come from the starter pack, and the
 * stack starts with a few rows so the operator UI isn't empty.
 */

/**
 * `DELTA B1` — a starter PROJECT scene shaped the way an EXPORT of it would be: the entry
 * composition promoted to the root, which is where the Designer's exporter puts it and where the
 * runtime looks for the graphic.
 *
 * ⚠ MOCK-ONLY. The real import path never calls this — it unpacks a `.vcg` that is already in
 * this shape. It exists so the offline console and the E2E suite see what an operator sees
 * rather than a project scene's empty root.
 */
function asExported(scene: Scene): Scene {
  const comps = scene.compositions ?? [];
  const entry = comps.find((c) => c.id === scene.entryCompositionId) ?? comps[0];
  if (entry === undefined) return scene;
  return {
    ...scene,
    layers: entry.layers,
    ...(entry.playout !== undefined ? { playout: entry.playout } : {}),
    ...(entry.lifecycle !== undefined ? { lifecycle: entry.lifecycle } : {}),
  };
}

/** Available templates, derived from the bundled starter pack. */
export function seedTemplates(): TemplateInfo[] {
  return STARTER_TEMPLATES.map((s) => ({
    templateId: s.id,
    // R-004 — the starter's own display label, so the mock Library reads like the real one
    // (a name, not a raw id) instead of dropping the name the starter pack already carries.
    name: s.label,
    templateType: s.scene.templateType,
    fields: s.scene.fields,
    /*
      🔴 `TIMING-WIRE-22` §4 / `DELTA B1` — the PLAYOUT, through the canonical
      `templateTimingOf` the real import path uses, but over an APPROXIMATION of the shape that
      path actually receives.

      ⚠ **A STARTER IS A PROJECT SCENE, NOT AN EXPORT, and the two differ exactly where this
      matters.** A starter has `layers: []` with its real content in `compositions`; an EXPORTED
      `.vcg` — the only shape the Runtime ever imports — has the chosen composition FLATTENED
      INTO THE ROOT (measured on the plant's saved records: `میان‌برنامه (روی آنتن)` carries
      `layers: 1` at the root with `playout {auto-out, content-driven}`). Handing the resolver a
      project scene would make every seeded starter read `Static` with no controls, which is a
      truthful answer about a shape that never reaches air and a misleading one about the
      product.

      So the seed promotes the entry composition to the root first. That is a MOCK concern and
      deliberately local: it approximates the Designer's export rather than re-implementing it,
      and nothing on the real path reads this.

      Without a `playout` at all the console's whole Timing section would be invisible offline
      and in every E2E — the `mock-bridge-parity` divergence, in the one direction a
      method-tree guard cannot see.
    */
    playout: (() => {
      const t = templateTimingOf(asExported(s.scene));
      return {
        v: TEMPLATE_TIMING_VERSION,
        mode: t.mode,
        ...(t.holdSource !== undefined ? { holdSource: t.holdSource } : {}),
        ...(t.holdMs !== undefined ? { holdMs: t.holdMs } : {}),
        ...(t.loop !== undefined ? { loops: true } : {}),
        ...(t.loop?.repeat !== undefined ? { repeat: t.loop.repeat } : {}),
        ...(t.loop?.delayMs !== undefined ? { delayMs: t.loop.delayMs } : {}),
      };
    })(),
    // D-137 / C-015 — DERIVED here, not omitted. A seeded starter is synthesised
    // from a scene this function is holding, so it is not a "pre-carrier" record
    // and must not wear that state: leaving the block off would make every
    // starter read "Re-import required" in the offline mock, which is the mock
    // wearing a signal that means something real (R-006's own doctrine).
    liveSources: {
      resolution: s.scene.resolution,
      defaultPosition: resolveDefaultPosition(s.scene),
      sources: collectLiveSources(s.scene),
    },
  }));
}

/** A small starting stack referencing seeded templates. */
export function seedStack(): StackItemState[] {
  const pick = (id: string): string => STARTER_TEMPLATES.find((s) => s.id === id)?.id ?? id;
  return [
    {
      itemId: 'item-irib-news',
      templateId: pick('irib-news'),
      fields: {},
      status: 'loaded',
      pending: false,
    },
    {
      itemId: 'item-ticker',
      templateId: pick('ticker'),
      fields: {},
      status: 'idle',
      pending: false,
    },
    {
      itemId: 'item-logo-bug',
      templateId: pick('logo-bug'),
      fields: {},
      status: 'idle',
      pending: false,
    },
  ];
}

export function seedConfig(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 },
      B: { host: '127.0.0.1', amcpPort: 5251, oscPort: 6251 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/**
 * R-006 — the mock reports NO connected server, because there is none.
 *
 * This used to seed BOTH servers as `state: 'healthy', amcpAxisOk: true`. So in test mode
 * the footer showed an amber "OFFLINE (mock)" pill sitting directly beside a green
 * "PRIMARY A HEALTHY" — two contradictory claims, same size, same row — and the reassuring
 * one won. The operator pressed PLAY, saw ON AIR, and believed a graphic was up. Nothing
 * was, and no server had ever existed to put it there.
 *
 * A simulation may simulate playout. It may NOT claim a healthy link to hardware that is
 * not there: that is the claim the operator actually trusts.
 */
export function seedHealth(currentPrimary: 'A' | 'B' = 'A'): ConnectionHealth {
  return {
    primary: { label: 'A', state: 'disconnected', amcpAxisOk: false },
    backup: { label: 'B', state: 'disconnected', amcpAxisOk: false },
    currentPrimary,
    strategy: 'mirror-sync',
  };
}

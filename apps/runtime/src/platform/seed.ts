import { resolveDefaultPosition, type StackItemState } from '@cg/shared-schema';
import type { ConnectionConfig, ConnectionHealth, TemplateInfo } from '@cg/shared-ipc';
import { collectLiveSources } from '@cg/vcg-format';
import { STARTER_TEMPLATES } from '@cg/starter-templates';

/**
 * Demo seed data for the mock runtime. Until the CasparCG bridge lands
 * (browsers can't open raw TCP/UDP), the playout controller runs against
 * an in-memory simulation: templates come from the starter pack, and the
 * stack starts with a few rows so the operator UI isn't empty.
 */

/** Available templates, derived from the bundled starter pack. */
export function seedTemplates(): TemplateInfo[] {
  return STARTER_TEMPLATES.map((s) => ({
    templateId: s.id,
    // R-004 — the starter's own display label, so the mock Library reads like the real one
    // (a name, not a raw id) instead of dropping the name the starter pack already carries.
    name: s.label,
    templateType: s.scene.templateType,
    fields: s.scene.fields,
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

import type { StackItemState } from '@cg/shared-schema';
import type { ConnectionConfig, ConnectionHealth, TemplateInfo } from '@cg/shared-ipc';
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
    templateType: s.scene.templateType,
    fields: s.scene.fields,
  }));
}

/** A small starting stack referencing seeded templates. */
export function seedStack(): StackItemState[] {
  const pick = (id: string): string => STARTER_TEMPLATES.find((s) => s.id === id)?.id ?? id;
  return [
    {
      itemId: 'item-lower-third',
      templateId: pick('persian-reference'),
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
      itemId: 'item-breaking',
      templateId: pick('breaking-news'),
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
 * Simulated "both servers healthy" snapshot. This is mock state — there is
 * no real CasparCG behind it until the bridge tool is wired up.
 */
export function seedHealth(currentPrimary: 'A' | 'B' = 'A'): ConnectionHealth {
  const at = new Date().toISOString();
  return {
    primary: { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: at },
    backup: { label: 'B', state: 'healthy', amcpAxisOk: true, oscFreshAt: at },
    currentPrimary,
    strategy: 'mirror-sync',
  };
}

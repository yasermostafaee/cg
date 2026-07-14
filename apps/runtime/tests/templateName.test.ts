import { describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { STARTER_TEMPLATES } from '@cg/starter-templates';
import {
  pickTemplateName,
  templateDisplayName,
} from '../src/renderer/features/library/templateName.js';
import { seedTemplates } from '../src/platform/seed.js';

/**
 * R-004 — the Library must name a template, not show its UUID. The name exists at every
 * hop (manifest, scene, starter label); these pin the two rules that decide what the
 * operator actually reads: which name wins at import, and what happens when none is usable.
 */

function info(over: Partial<TemplateInfo> = {}): TemplateInfo {
  return { templateId: 'tpl-uuid-1', templateType: 'lower-third', fields: [], ...over };
}

describe('pickTemplateName — what gets recorded at import', () => {
  it('prefers the manifest name', () => {
    expect(pickTemplateName('Lower Third — News', 'scene-name')).toBe('Lower Third — News');
  });

  it('falls back to the scene name when the manifest has none', () => {
    expect(pickTemplateName(undefined, 'scene-name')).toBe('scene-name');
  });

  it('treats a blank manifest name as unusable and falls through to the scene', () => {
    // `ManifestSchema.name` is `z.string()` with no `.min(1)` — "" is schema-valid.
    expect(pickTemplateName('   ', 'scene-name')).toBe('scene-name');
  });

  it('yields undefined when NO name is usable, so the caller omits the key', () => {
    expect(pickTemplateName('', '  ')).toBeUndefined();
    expect(pickTemplateName(undefined, undefined)).toBeUndefined();
  });

  it('trims the name it records', () => {
    expect(pickTemplateName('  Padded Name  ', undefined)).toBe('Padded Name');
  });
});

describe('templateDisplayName — what the operator reads', () => {
  it('shows the name when there is one', () => {
    expect(templateDisplayName(info({ name: 'Breaking News' }))).toBe('Breaking News');
  });

  it('falls back to the id when the name is absent — a row is never blank', () => {
    // A TemplateInfo registered before the field existed: `name` is optional for this case.
    expect(templateDisplayName(info())).toBe('tpl-uuid-1');
  });

  it('falls back to the id when the name is blank after trimming', () => {
    expect(templateDisplayName(info({ name: '   ' }))).toBe('tpl-uuid-1');
  });
});

describe('seedTemplates — the mock library reads like the real one', () => {
  it('carries every starter label as the display name', () => {
    const seeded = seedTemplates();
    expect(seeded.length).toBe(STARTER_TEMPLATES.length);
    for (const s of seeded) {
      const starter = STARTER_TEMPLATES.find((t) => t.id === s.templateId);
      expect(starter).toBeDefined();
      expect(s.name).toBe(starter?.label);
      // The point of the whole item: the operator sees a name, not the raw id.
      expect(templateDisplayName(s)).not.toBe(s.templateId);
    }
  });
});

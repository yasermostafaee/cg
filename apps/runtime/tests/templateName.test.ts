import { describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { STARTER_TEMPLATES } from '@cg/starter-templates';
import {
  cleanFileName,
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

describe('cleanFileName — the imported file name, made readable', () => {
  it('strips the .vcg extension and turns separators into spaces', () => {
    expect(cleanFileName('news-lower-third.vcg')).toBe('news lower third');
    expect(cleanFileName('news_lower_third.vcg')).toBe('news lower third');
    expect(cleanFileName('news-lower_third.vcg')).toBe('news lower third');
  });

  it('does NOT change case — these names are Persian, or mixed', () => {
    // There is no correct "capitalize" for an Arabic-script string, and title-casing the
    // Latin half would make the two halves disagree. Leave the operator's text alone.
    expect(cleanFileName('زیرنویس-خبر.vcg')).toBe('زیرنویس خبر');
    expect(cleanFileName('BBC-news_LOWER-third.vcg')).toBe('BBC news LOWER third');
    expect(cleanFileName('news-lower-third.vcg')).not.toBe('News Lower Third');
  });

  it('strips the extension case-insensitively, and only at the end', () => {
    expect(cleanFileName('promo.VCG')).toBe('promo');
    // A ".vcg" inside the name is part of the name, not an extension.
    expect(cleanFileName('my.vcg.backup.vcg')).toBe('my.vcg.backup');
  });

  it('collapses the runs a separator sweep leaves behind', () => {
    expect(cleanFileName('news--lower__third.vcg')).toBe('news lower third');
    expect(cleanFileName('  padded-name.vcg  ')).toBe('padded name');
  });

  it('yields undefined for nothing usable, so the caller falls through', () => {
    expect(cleanFileName(undefined)).toBeUndefined();
    expect(cleanFileName('.vcg')).toBeUndefined();
    expect(cleanFileName('---.vcg')).toBeUndefined();
  });
});

describe('templateDisplayName — what the operator reads, on every surface', () => {
  it('prefers the imported FILE NAME over the manifest name', () => {
    // The file name is the string the operator chose and recognises. The manifest's name is
    // the entry composition's — frequently a Designer-internal label.
    const t = info({ name: 'Comp 1', sourceFileName: 'news-lower-third.vcg' });
    expect(templateDisplayName(t)).toBe('news lower third');
  });

  it('uses the manifest name when there is no file — a bundled starter keeps its label', () => {
    expect(templateDisplayName(info({ name: 'Breaking News' }))).toBe('Breaking News');
  });

  it('falls through an unusable file name to the manifest name', () => {
    expect(templateDisplayName(info({ name: 'Breaking News', sourceFileName: '.vcg' }))).toBe(
      'Breaking News',
    );
  });

  it('NEVER shows the raw id — a UUID is not a label', () => {
    // This is the whole point of the item. A row with neither a file nor a usable name says
    // so in words, rather than showing an identifier the operator cannot act on.
    expect(templateDisplayName(info())).toBe('Unnamed template');
    expect(templateDisplayName(info({ name: '   ' }))).toBe('Unnamed template');
    expect(templateDisplayName(info())).not.toBe('tpl-uuid-1');
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

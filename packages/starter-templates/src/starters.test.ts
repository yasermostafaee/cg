import { describe, expect, it } from 'vitest';
import { SceneSchema } from '@cg/shared-schema';
import { STARTER_TEMPLATES, getStarter, persianReferenceScene } from './index.js';

describe('starter templates', () => {
  it('every starter has a Zod-valid Scene', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(() => SceneSchema.parse(s.scene)).not.toThrow();
    }
  });

  it('every starter id is unique', () => {
    const ids = STARTER_TEMPLATES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getStarter returns the matching starter by id', () => {
    expect(getStarter('persian-reference')?.id).toBe('persian-reference');
    expect(getStarter('nope')).toBeNull();
  });

  it('Persian reference defaults are non-empty Persian copy', () => {
    const anchor = persianReferenceScene.fields.find((f) => f.id === 'anchor');
    const role = persianReferenceScene.fields.find((f) => f.id === 'role');
    expect(anchor?.type).toBe('text');
    expect(role?.type).toBe('text');
    if (anchor?.type === 'text') expect(anchor.default).not.toBe('');
    if (role?.type === 'text') expect(role.default).not.toBe('');
  });
});

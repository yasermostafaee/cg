import { describe, expect, it } from 'vitest';
import {
  DynamicFieldSchema,
  fieldAllowsFileSource,
  fieldTypeTakesFileSource,
} from '../src/fields.js';

/**
 * TEXT-FILE-OPT-01 — the authored per-field grant that decides whether the Runtime
 * operator may source a field's value from a text file.
 *
 * The grant exists ONLY on the three variants that can carry file content. That is
 * the whole of "un-settable rather than silently ignored": on a `number` field the
 * key cannot be written (TypeScript), cannot be stored (Zod strips it) and cannot be
 * read back — so there is no state in which a set flag is being ignored.
 */

const base = { id: 'crawl', label: 'Crawl', required: false };

describe('the file-source grant rides the field, on the eligible variants only', () => {
  it.each(['text', 'multiline'] as const)('%s carries the grant', (type) => {
    const f = { ...base, type, default: '', allowFileSource: true };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });

  it('list carries the grant', () => {
    const f = { ...base, type: 'list' as const, default: [], allowFileSource: true };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });

  it('absent is the OFF default — the key stays absent, it is not defaulted in', () => {
    const parsed = DynamicFieldSchema.parse({ ...base, type: 'text', default: '' });
    expect('allowFileSource' in parsed).toBe(false);
    expect(fieldAllowsFileSource(parsed)).toBe(false);
  });

  it('an explicit false is a grant that is OFF', () => {
    const parsed = DynamicFieldSchema.parse({
      ...base,
      type: 'text',
      default: '',
      allowFileSource: false,
    });
    expect(fieldAllowsFileSource(parsed)).toBe(false);
  });

  it.each([
    ['number', { default: 0 }],
    ['color', { default: '#FFFFFF' }],
    ['boolean', { default: true }],
    ['select', { default: 'a', options: [{ value: 'a', label: 'A' }] }],
    ['image', { accept: ['png'] }],
  ] as const)('%s STRIPS the grant — it cannot be expressed there', (type, extra) => {
    const parsed = DynamicFieldSchema.parse({ ...base, type, ...extra }) as Record<string, unknown>;
    const withFlag = DynamicFieldSchema.parse({
      ...base,
      type,
      ...extra,
      allowFileSource: true,
    }) as Record<string, unknown>;
    expect('allowFileSource' in withFlag).toBe(false);
    expect(withFlag).toEqual(parsed);
    expect(fieldAllowsFileSource(withFlag as never)).toBe(false);
  });
});

describe('the ONE predicate — nobody re-derives the kind list (golden rule 6)', () => {
  it('names exactly the kinds that can carry file content', () => {
    expect(
      (
        ['text', 'multiline', 'image', 'color', 'boolean', 'number', 'select', 'list'] as const
      ).filter(fieldTypeTakesFileSource),
    ).toEqual(['text', 'multiline', 'list']);
  });

  it('the grant predicate implies the kind gate — a granted field is always eligible', () => {
    const granted = DynamicFieldSchema.parse({
      ...base,
      type: 'list',
      default: [],
      allowFileSource: true,
    });
    expect(fieldAllowsFileSource(granted)).toBe(true);
    expect(fieldTypeTakesFileSource(granted.type)).toBe(true);
  });

  it('an ABSENT field grants nothing — an inferred row was never authored', () => {
    expect(fieldAllowsFileSource(null)).toBe(false);
    expect(fieldAllowsFileSource(undefined)).toBe(false);
  });
});

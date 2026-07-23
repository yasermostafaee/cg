import { describe, expect, it } from 'vitest';
import type { ListItem } from '@cg/shared-schema';
import {
  contentToFieldValue,
  parseDelimiter,
  splitContent,
} from '../src/renderer/features/inspector/fromFileContent.js';

/**
 * R-018 — the pure content→value transforms behind the from-file control.
 * VERBATIM is the contract under test: whole-file mode never trims, never
 * splits, and NEVER digit-normalizes (file content is newsroom copy that goes
 * on air; R-020's `latinDigits` is for numeric INPUT fields only).
 */

describe('parseDelimiter', () => {
  it('resolves the \\n and \\t escapes; everything else is literal', () => {
    expect(parseDelimiter('\\n')).toBe('\n');
    expect(parseDelimiter('\\t')).toBe('\t');
    expect(parseDelimiter('|')).toBe('|');
    expect(parseDelimiter('،')).toBe('،');
    expect(parseDelimiter('--\\n--')).toBe('--\n--');
  });
});

describe('splitContent', () => {
  it('splits, trims entries, and skips entries empty after trimming', () => {
    expect(splitContent('a | b ||  | c', '|')).toEqual(['a', 'b', 'c']);
  });

  it('an empty delimiter cannot split — the whole content is one entry', () => {
    expect(splitContent('a|b', '')).toEqual(['a|b']);
  });

  it('splits on newline for one-entry-per-line files', () => {
    expect(splitContent('خبر اول\nخبر دوم\n\n', '\n')).toEqual(['خبر اول', 'خبر دوم']);
  });
});

describe('contentToFieldValue — text/multiline', () => {
  it('the ENTIRE content becomes the value verbatim (split config is irrelevant)', () => {
    const content = '  عنوان خبر | با جداکنندهٔ خودِ تایپیست  \nخط دوم';
    expect(contentToFieldValue(content, 'text', { split: true, delimiter: '|' })).toBe(content);
    expect(contentToFieldValue(content, 'multiline', { split: false, delimiter: '|' })).toBe(
      content,
    );
  });
});

describe('contentToFieldValue — list, split OFF (the default)', () => {
  it('the whole file becomes ONE item, embedded separators exactly as typed', () => {
    const content = 'خبر اول *** خبر دوم *** خبر سوم';
    const value = contentToFieldValue(content, 'list', {
      split: false,
      delimiter: '\\n',
    }) as ListItem[];
    expect(value).toEqual([{ id: 'file-1', text: content }]);
  });

  it('never trims in whole-file mode — verbatim includes whitespace', () => {
    const content = '  padded  ';
    const value = contentToFieldValue(content, 'list', {
      split: false,
      delimiter: '|',
    }) as ListItem[];
    expect(value[0]?.text).toBe('  padded  ');
  });
});

describe('contentToFieldValue — list, split ON', () => {
  it('splits into items on the operator delimiter, skipping empty entries', () => {
    const value = contentToFieldValue('a | b ||  | c', 'list', {
      split: true,
      delimiter: '|',
    }) as ListItem[];
    expect(value).toEqual([
      { id: 'file-1', text: 'a' },
      { id: 'file-2', text: 'b' },
      { id: 'file-3', text: 'c' },
    ]);
  });

  it('the \\n escape splits one entry per line', () => {
    const value = contentToFieldValue('one\ntwo\n', 'list', {
      split: true,
      delimiter: '\\n',
    }) as ListItem[];
    expect(value.map((i) => i.text)).toEqual(['one', 'two']);
  });

  it('ids are deterministic and position-stable across reloads (ticker reconcile)', () => {
    const first = contentToFieldValue('a|b', 'list', {
      split: true,
      delimiter: '|',
    }) as ListItem[];
    const second = contentToFieldValue('a2|b2', 'list', {
      split: true,
      delimiter: '|',
    }) as ListItem[];
    expect(first.map((i) => i.id)).toEqual(['file-1', 'file-2']);
    expect(second.map((i) => i.id)).toEqual(['file-1', 'file-2']);
  });
});

describe('Persian / RTL content is VERBATIM — never digit-normalized', () => {
  it('Persian digits in file content survive untouched (no latinDigits pass)', () => {
    // R-020 normalizes digits on numeric INPUT fields; file content is
    // broadcast copy and must keep ۱۴۰۳ exactly as the typist wrote it.
    const content = 'قیمت دلار: ۱۲۳٬۴۵۶ ریال — سال ۱۴۰۳';
    expect(contentToFieldValue(content, 'text', { split: false, delimiter: '|' })).toBe(content);
    const value = contentToFieldValue(content, 'list', {
      split: false,
      delimiter: '|',
    }) as ListItem[];
    expect(value[0]?.text).toBe(content);
  });

  it('mixed RTL/LTR with bidi controls round-trips byte-for-byte', () => {
    const content = 'خبر ‏فوری‎ BREAKING ۱۲:۳۰';
    const value = contentToFieldValue(content, 'list', {
      split: false,
      delimiter: '\\n',
    }) as ListItem[];
    expect(value[0]?.text).toBe(content);
  });
});

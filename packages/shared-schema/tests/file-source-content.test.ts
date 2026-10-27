import { describe, expect, it } from 'vitest';
import {
  fileSourceContentToFieldValue,
  parseFileDelimiter,
  splitFileSourceContent,
} from '../src/index.js';

describe('file-source content shared by Designer and Runtime', () => {
  it('resolves printable newline/tab escapes and leaves custom strings literal', () => {
    expect(parseFileDelimiter('\\n')).toBe('\n');
    expect(parseFileDelimiter('\\t')).toBe('\t');
    expect(parseFileDelimiter('::')).toBe('::');
  });

  it('trims split list rows, omits empties and assigns stable ids', () => {
    expect(splitFileSourceContent(' one | | two ', '|')).toEqual(['one', 'two']);
    expect(
      fileSourceContentToFieldValue(' one | | two ', 'list', {
        split: true,
        delimiter: '|',
      }),
    ).toEqual([
      { id: 'file-1', text: 'one' },
      { id: 'file-2', text: 'two' },
    ]);
  });

  it('keeps scalar bytes verbatim and an unsplit list as one item', () => {
    expect(
      fileSourceContentToFieldValue('  خبر\n', 'multiline', {
        split: true,
        delimiter: '\\n',
      }),
    ).toBe('  خبر\n');
    expect(
      fileSourceContentToFieldValue('one|two', 'list', { split: false, delimiter: '|' }),
    ).toEqual([{ id: 'file-1', text: 'one|two' }]);
  });
});

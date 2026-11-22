import { describe, expect, it } from 'vitest';
import { mirroredPageState } from '../src/mirrored-page-state.js';

const expected = {
  templateUrl: 'http://127.0.0.1:7911/template/template~0123456789abcdef',
  itemId: 'item-1',
  pass: 'background' as const,
};
const empty = '<producer>empty</producer>';
const html = (url: string) => `<producer>html</producer><file><path>${url}</path></file>`;
const info = (front: string, back = empty) =>
  `<channel><stage><layer><layer_59><foreground>${front}</foreground><background>${back}</background></layer_59></layer></stage></channel>`;

describe('mirroredPageState', () => {
  it('requires both foreground and queued producer to be empty', () => {
    expect(mirroredPageState(info(empty), 59, expected)).toBe('empty');
    expect(mirroredPageState(info(empty, html('http://other/page')), 59, expected)).toBe(
      'occupied',
    );
  });

  it('identifies only the held template version, item and output pass', () => {
    const url = `${expected.templateUrl}?cw=1920&amp;cgpass=background&amp;cgsync=item-1`;
    expect(mirroredPageState(info(html(url)), 59, expected)).toBe('owned');
    for (const foreign of [
      url.replace('item-1', 'item-2'),
      url.replace('background', 'foreground'),
      url.replace('0123456789abcdef', 'fedcba9876543210'),
    ])
      expect(mirroredPageState(info(html(foreign)), 59, expected)).toBe('occupied');
  });

  it('preserves unknown for truncated or incomplete stage readback', () => {
    for (const xml of [
      '<channel><stage>',
      '<channel><stage><layer_59></stage></channel>',
      '<channel><stage><layer_59><foreground/></layer_59></stage></channel>',
      '<channel><stage><layer_59><foreground><producer>route</producer><channel>1</channel>',
    ])
      expect(mirroredPageState(xml, 59, expected)).toBe('unknown');
  });

  it('reads empty omitted layers without mistaking a nested route channel for the root', () => {
    expect(mirroredPageState('<channel></channel>', 59, expected)).toBe('empty');
    expect(
      mirroredPageState(
        '<channel><stage><layer_74><foreground><producer>route</producer><channel>1</channel></foreground><background><producer>empty</producer></background></layer_74></stage></channel>',
        59,
        expected,
      ),
    ).toBe('empty');
  });
});

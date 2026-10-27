import { describe, expect, it } from 'vitest';
import { TextSourcesReadChannel } from '../src/channels/textSources.js';

describe('R-102 — textSources.read contract', () => {
  it('has the stable wire name and accepts a safe relative path', () => {
    expect(TextSourcesReadChannel.name).toBe('textSources.read');
    expect(TextSourcesReadChannel.request.parse({ path: 'newsroom/crawl.txt' })).toEqual({
      path: 'newsroom/crawl.txt',
    });
  });

  it.each(['../secret.txt', '/secret.txt', 'C:\\secret.txt', '\\\\server\\share\\x.txt'])(
    'rejects unsafe request %s before dispatch',
    (path) => {
      expect(TextSourcesReadChannel.request.safeParse({ path }).success).toBe(false);
    },
  );

  it('carries the canonical source path with current content and accepts an older response', () => {
    const response = {
      name: 'newsroom/crawl.txt',
      sourcePath: String.raw`\\newsroom\CG Text\newsroom\crawl.txt`,
      content: 'خبر',
    };
    expect(TextSourcesReadChannel.response.parse(response)).toEqual(response);
    expect(
      TextSourcesReadChannel.response.parse({ name: 'newsroom/crawl.txt', content: 'خبر' }),
    ).toEqual({ name: 'newsroom/crawl.txt', content: 'خبر' });
    expect(TextSourcesReadChannel.response.safeParse({ name: '', content: 'خبر' }).success).toBe(
      false,
    );
  });
});

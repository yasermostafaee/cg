import type { ParsedAmcpResponse } from '@cg/caspar-client';

export const STANDALONE_CHANNEL_UNAVAILABLE = 'caspar-channel-unavailable';

/** Global INFO lists one row per running channel, for example `1 1080p5000 PLAYING`. */
export function parseStandaloneCoreChannels(response: ParsedAmcpResponse): number[] | null {
  const body =
    response.kind === 'ok-multi'
      ? response.lines.join('\n')
      : response.kind === 'ok-line'
        ? response.data
        : '';
  const text = body.trim();
  if (text === '') return null;
  const channels = new Set<number>();
  for (const row of text.split(/\r?\n/)) {
    const match = /^([1-9][0-9]*)\s+[A-Z0-9][A-Z0-9_-]*\s+[A-Z][A-Z_-]*$/i.exec(row.trim());
    if (match === null) return null;
    const channel = Number(match[1]);
    if (!Number.isSafeInteger(channel) || channels.has(channel)) return null;
    channels.add(channel);
  }
  return [...channels].sort((a, b) => a - b);
}

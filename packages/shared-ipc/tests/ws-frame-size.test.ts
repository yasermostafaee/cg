import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_MEDIA_MAX_BYTES,
  TEMPLATE_PAGE_ALLOWANCE_BYTES,
  WS_MAX_FRAME_BYTES,
  fitsWsFrame,
  wsFrameBytes,
} from '../src/index.js';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-351`) — ONE number for CG Bridge's frame, and the arithmetic both ends
 * judge a frame by. Measured: a 141 MB book's page crossed the bridge's cap, the socket closed, and
 * the operator read "Bridge disconnected" about a bridge that was fine.
 */
describe('the frame CG Bridge accepts', () => {
  it('is 64 MiB, and the media a template can carry is what fits in it after base64 and the page', () => {
    expect(WS_MAX_FRAME_BYTES).toBe(64 * 1024 * 1024);
    expect(TEMPLATE_MEDIA_MAX_BYTES).toBe(
      ((WS_MAX_FRAME_BYTES - TEMPLATE_PAGE_ALLOWANCE_BYTES) * 3) / 4,
    );
  });

  it('counts bytes as the socket does: UTF-8, a Persian letter two, an astral one four', () => {
    expect(wsFrameBytes('abc')).toBe(3);
    expect(wsFrameBytes('سلام')).toBe(8);
    expect(wsFrameBytes('😀')).toBe(4);
    expect(wsFrameBytes('\u20ac')).toBe(3);
  });

  it('fits a frame exactly at the cap and refuses one byte over — counted, not estimated, near the line', () => {
    expect(fitsWsFrame('x'.repeat(WS_MAX_FRAME_BYTES))).toBe(true);
    expect(fitsWsFrame('x'.repeat(WS_MAX_FRAME_BYTES + 1))).toBe(false);
    // Near the line, two-byte letters decide it: the length alone would say "fits".
    const twoByte = 'س'.repeat(WS_MAX_FRAME_BYTES / 2 + 1);
    expect(twoByte.length).toBeLessThan(WS_MAX_FRAME_BYTES);
    expect(fitsWsFrame(twoByte)).toBe(false);
  });
});

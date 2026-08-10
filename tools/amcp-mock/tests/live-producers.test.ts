import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import { renderedRect } from '../src/mixer-rect.js';
import { FULL_FRAME, type MockHandle } from '../src/types.js';

/**
 * D-137 / C-015 phase 3 — the MOCK is what makes `design.md` §6's arithmetic and
 * §4's ownership work checkable without a capture card. Its fidelity is the
 * deliverable here, not a convenience.
 *
 * Three things are pinned:
 *
 *  1. **The producer CLASSIFIER.** A routed Live Source used to be recorded as
 *     `'ffmpeg'` — indistinguishable from a foreign video layer, which is the
 *     exact discriminator the ownership phases turn on.
 *  2. **REFUSAL of an unrecognised form.** `handleMixer`'s own doctrine —
 *     "an unimplemented sub-verb that silently 202s would let a wrong command
 *     look correct" — did not reach `handlePlay`, which refused only on
 *     addressing. A mock that accepts what the real server refuses makes phase
 *     5's tests pass against behaviour that cannot happen.
 *  3. **`FILL` and `CLIP` as an INTERSECTION**, including the DISJOINT case,
 *     which is the on-air failure mode: a black hole where a guest should be.
 */

let mock: MockHandle | undefined;

afterEach(async () => {
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

async function boot(): Promise<MockHandle> {
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  return mock;
}

const L = (layer: number): { channel: number; layer: number } => ({ channel: 1, layer });

describe('the producer classifier', () => {
  it('records a route:// producer as ROUTE, not as ffmpeg', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-11 "route://1-10"')).toBe('202 PLAY\r\n');
    // Before this, a live guest box and a foreign video layer were the same
    // signal, so the ownership doors could not be tested at all.
    expect(m.layerState(L(11))?.producer).toBe('route');
  });

  it('accepts a channel-only route target', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-11 "route://1"')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(11))?.producer).toBe('route');
  });

  it('records DECKLINK DEVICE <n> as DECKLINK, with the device no longer discarded', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-12 DECKLINK DEVICE 1')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(12))?.producer).toBe('decklink');
  });

  it('records NDI NAME <source> as NDI', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-13 NDI NAME "STUDIO (CAM1)"')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(13))?.producer).toBe('ndi');
  });

  it('still records a bare media file name as ffmpeg', async () => {
    const m = await boot();
    // The existing foreign-layer fixtures depend on this, and it is what real
    // CasparCG does: no scheme, no keyword ⇒ a file name.
    expect(await send(m.amcpPort, 'PLAY 1-14 "program-feed.mov"')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(14))?.producer).toBe('ffmpeg');
  });

  it('records an http(s) URL as html', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-15 "http://127.0.0.1:9/template/x"')).toBe(
      '202 PLAY\r\n',
    );
    expect(m.layerState(L(15))?.producer).toBe('html');
  });

  it('matches CasparCG’s real [HTML] tag, not only the bare word', async () => {
    const m = await boot();
    // The old comparison was `a.toUpperCase() === 'HTML'`, so the bracketed form
    // CasparCG actually writes never matched — which is why every mock-facing
    // test had to use a non-CasparCG argument order to get an html producer.
    expect(await send(m.amcpPort, 'PLAY 1-16 "some/page" [HTML]')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(16))?.producer).toBe('html');
    expect(await send(m.amcpPort, 'PLAY 1-17 "some/page" HTML')).toBe('202 PLAY\r\n');
    expect(m.layerState(L(17))?.producer).toBe('html');
  });

  it('LOAD classifies through the SAME rule as PLAY', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'LOAD 1-18 "route://1-10"')).toBe('202 LOAD\r\n');
    expect(m.layerState(L(18))).toMatchObject({ producer: 'route', paused: true, onAir: false });
  });
});

describe('an unrecognised producer form is REFUSED, not silently acked', () => {
  it('refuses a typo in the scheme, and leaves the layer untouched', async () => {
    const m = await boot();
    const reply = await send(m.amcpPort, 'PLAY 1-20 "rout://1-10"');
    expect(reply).toContain('404 ERROR');
    expect(reply).toContain('UNKNOWN PRODUCER SCHEME');
    // A refused PLAY that had already written the producer would be the
    // "looks acked, renders nothing" gap in reverse.
    expect(m.layerState(L(20))).toBeUndefined();
  });

  it('refuses a malformed route target', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-21 "route://studio-a"')).toContain('404 ERROR');
    expect(m.layerState(L(21))).toBeUndefined();
  });

  it('refuses DECKLINK without a device number', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-22 DECKLINK')).toContain('DECKLINK NEEDS DEVICE');
    expect(await send(m.amcpPort, 'PLAY 1-22 DECKLINK DEVIC 3')).toContain('404 ERROR');
    expect(m.layerState(L(22))).toBeUndefined();
  });

  it('refuses NDI without a source name', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-23 NDI')).toContain('NDI NEEDS NAME');
    expect(m.layerState(L(23))).toBeUndefined();
  });

  it('refuses a PLAY with no producer argument at all', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'PLAY 1-24')).toContain('402 ERROR');
    expect(m.layerState(L(24))).toBeUndefined();
  });

  it('refuses the same forms on LOAD', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'LOAD 1-25 "rout://1-10"')).toContain('404 ERROR');
    expect(m.layerState(L(25))).toBeUndefined();
  });
});

describe('MIXER FILL and CLIP', () => {
  it('records a FILL as a channel-normalized rect', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-30 "route://1-10"');
    expect(await send(m.amcpPort, 'MIXER 1-30 FILL 0.1 0.2 0.3 0.4')).toBe('202 MIXER\r\n');
    // Per-axis against the raster — the basis measured on hardware.
    expect(m.layerState(L(30))?.fill).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('records a CLIP separately — it does not travel with the FILL', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-31 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-31 FILL 0.5 0.5 0.5 0.5');
    await send(m.amcpPort, 'MIXER 1-31 CLIP 0 0 0.5 0.5');
    const state = m.layerState(L(31));
    expect(state?.fill).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    expect(state?.clip).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
  });

  it('🔴 THE case: a DISJOINT fill and clip render NOTHING', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-32 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-32 FILL 0.5 0.5 0.5 0.5');
    await send(m.amcpPort, 'MIXER 1-32 CLIP 0 0 0.5 0.5');

    // Measured on 2.5.0 and re-confirmed on the plant's 2.3.2: the box
    // DISAPPEARS ENTIRELY. On air that is a black rectangle where a guest should
    // be — and because the template's hole is transparent by design, it looks
    // exactly like a correctly-authored empty region. This is the assertion that
    // can tell the two apart.
    expect(m.layerRenderedRect(L(32))).toBeNull();
    // …and a test that read only the FILL would see a perfectly good box.
    expect(m.layerState(L(32))?.fill).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it('a PARTIALLY overlapping clip masks to the intersection — the crop-to-fill case', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-33 "route://1-10"');
    // Crop-to-fill oversizes the FILL on ONE axis and clips the overflow, so the
    // rects are neither disjoint nor contained. That is the geometry §6 emits.
    await send(m.amcpPort, 'MIXER 1-33 FILL 0.1 0.2 0.6 0.4');
    await send(m.amcpPort, 'MIXER 1-33 CLIP 0.3 0.2 0.6 0.4');
    const rect = m.layerRenderedRect(L(33));
    expect(rect?.x).toBeCloseTo(0.3, 9);
    expect(rect?.y).toBeCloseTo(0.2, 9);
    expect(rect?.width).toBeCloseTo(0.4, 9);
    expect(rect?.height).toBeCloseTo(0.4, 9);
  });

  it('an untouched layer fills the frame and masks nothing', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-34 "route://1-10"');
    expect(m.layerState(L(34))?.fill).toEqual(FULL_FRAME);
    expect(m.layerState(L(34))?.clip).toEqual(FULL_FRAME);
    expect(m.layerRenderedRect(L(34))).toEqual(FULL_FRAME);
  });

  it('MIXER geometry SURVIVES a CLEAR — which is why teardown must reset it', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-35 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-35 FILL 0.5 0.5 0.25 0.25');
    await send(m.amcpPort, 'CLEAR 1-35');

    // Mixer state belongs to the channel's mixer, not to the producer, exactly
    // as it does for VOLUME. A teardown that omits `MIXER … CLEAR` leaves this
    // for the next, unrelated graphic to inherit.
    expect(m.layerState(L(35))).toMatchObject({ producer: 'empty' });
    expect(m.layerState(L(35))?.fill).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 });
  });

  it('MIXER CLEAR resets BOTH geometry terms', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-36 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-36 FILL 0.5 0.5 0.25 0.25');
    await send(m.amcpPort, 'MIXER 1-36 CLIP 0 0 0.5 0.5');
    expect(await send(m.amcpPort, 'MIXER 1-36 CLEAR')).toBe('202 MIXER\r\n');
    expect(m.layerState(L(36))?.fill).toEqual(FULL_FRAME);
    expect(m.layerState(L(36))?.clip).toEqual(FULL_FRAME);
  });

  it('refuses a FILL with fewer than four numbers, and one with a non-number', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-37 "route://1-10"');
    expect(await send(m.amcpPort, 'MIXER 1-37 FILL 0.1 0.2 0.3')).toBe('401 ERROR\r\n');
    expect(await send(m.amcpPort, 'MIXER 1-37 FILL 0.1 0.2 0.3 wide')).toBe('401 ERROR\r\n');
    // Half a placement is worse than none: it looks applied.
    expect(m.layerState(L(37))?.fill).toEqual(FULL_FRAME);
  });

  it('still refuses an unimplemented MIXER sub-verb', async () => {
    const m = await boot();
    expect(await send(m.amcpPort, 'MIXER 1-38 OPACITY 0.5')).toBe('400 ERROR\r\n');
  });

  it('does NOT clamp a FILL to the frame — an off-raster box is the bridge’s bug to show', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-39 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-39 FILL -0.2 0 0.5 0.5');
    expect(m.layerState(L(39))?.fill.x).toBe(-0.2);
  });
});

describe('renderedRect', () => {
  it('is null for edge-touching rects — zero area is nothing rendered', () => {
    expect(
      renderedRect({ x: 0, y: 0, width: 0.5, height: 1 }, { x: 0.5, y: 0, width: 0.5, height: 1 }),
    ).toBeNull();
  });

  it('is the fill when the clip contains it', () => {
    const fill = { x: 0.25, y: 0.25, width: 0.25, height: 0.25 };
    expect(renderedRect(fill, FULL_FRAME)).toEqual(fill);
  });

  it('is the clip when the fill contains it', () => {
    const clip = { x: 0.25, y: 0.25, width: 0.25, height: 0.25 };
    expect(renderedRect(FULL_FRAME, clip)).toEqual(clip);
  });

  it('FULL_FRAME is frozen — every untouched layer shares this one object', () => {
    // Not pedantry: the registry seeds `fill` and `clip` BY REFERENCE, so a
    // mutation here would change the default for every other layer in the
    // process, and the damage would surface nowhere near the write.
    expect(Object.isFrozen(FULL_FRAME)).toBe(true);
  });

  it('setting one layer’s geometry does not disturb another’s', async () => {
    const m = await boot();
    await send(m.amcpPort, 'PLAY 1-40 "route://1-10"');
    await send(m.amcpPort, 'PLAY 1-41 "route://1-10"');
    await send(m.amcpPort, 'MIXER 1-40 FILL 0.5 0.5 0.25 0.25');
    expect(m.layerState(L(41))?.fill).toEqual(FULL_FRAME);
  });
});

/** Send one AMCP line and return the raw reply. */
function send(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    let buf = '';
    sock.setEncoding('utf-8');
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('connect', () => {
      sock.write(`${line}\r\n`);
      setTimeout(() => sock.end(), 60);
    });
    sock.on('end', () => resolve(buf));
    sock.on('error', reject);
  });
}

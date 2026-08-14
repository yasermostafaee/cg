import { describe, expect, it } from 'vitest';
import { CommandBuilder, type CommandSlot } from '../src/command-builder.js';

const slot: CommandSlot = { channel: 1, layer: 10 };
const builder = new CommandBuilder();

describe('CommandBuilder (ADR 0006 seam — amcp-mock-validated)', () => {
  it('load → CG ADD with play-on-load OFF (0): loaded, NOT playing (B-039)', () => {
    // The play-on-load flag is `0` — load only ADDs the producer; the operator's
    // take issues the CG PLAY. (Was `1`, which auto-played on load.)
    expect(builder.load(slot, 'lower-third', {})).toBe('CG 1-10 ADD 0 "lower-third" 0 "{}"');
  });

  it('take → CG PLAY', () => {
    expect(builder.take(slot)).toBe('CG 1-10 PLAY 0');
  });

  it('update → CG UPDATE with escaped JSON data', () => {
    // JSON quotes are AMCP-escaped via quote(): {"title":"Hi"} → "{\"title\":\"Hi\"}"
    expect(builder.update(slot, { title: 'Hi' })).toBe('CG 1-10 UPDATE 0 "{\\"title\\":\\"Hi\\"}"');
  });

  it('update → the data arg carries the two-layer escaping: each JSON \\ → 4 wire \\ (B-041)', () => {
    // value `a\b` → JSON `"a\\b"` → each of the 2 JSON backslashes ×4 → 8 on the wire.
    expect(builder.update(slot, { text: 'a\\b' })).toBe(
      'CG 1-10 UPDATE 0 "{\\"text\\":\\"a\\\\\\\\\\\\\\\\b\\"}"',
    );
    // a newline value → JSON two-char `\n` → 4 wire backslashes + literal n.
    expect(builder.update(slot, { text: 'x\ny' })).toBe(
      'CG 1-10 UPDATE 0 "{\\"text\\":\\"x\\\\\\\\ny\\"}"',
    );
  });

  it('out → CLEAR', () => {
    expect(builder.out(slot)).toBe('CLEAR 1-10');
  });

  it('R-028 (o2) — next → CG NEXT: the wire gap is closed at the one construction seam', () => {
    // The template side (`window.next`, the sequence drivers) has existed all
    // along; this is the verb the bridge could never send. Channel/UI wiring
    // is part B — but the capability is no longer designed out.
    expect(builder.next(slot)).toBe('CG 1-10 NEXT 0');
  });

  it('escapes embedded quotes/backslashes so the wire never desyncs', () => {
    const line = builder.update(slot, { text: 'a"b\\c' });
    expect(line.startsWith('CG 1-10 UPDATE 0 "')).toBe(true);
    // No bare (unescaped) double-quote inside the payload body.
    const body = line.slice('CG 1-10 UPDATE 0 "'.length, -1);
    expect(/(?<!\\)"/.test(body)).toBe(false);
    // And no raw control byte ever rides the line (AMCP framing).
    expect(/[\n\r]/.test(builder.update(slot, { text: 'x\ny' }))).toBe(false);
  });
});

/**
 * C-015 phase 6 (task 6.1) — the three Live Source verbs.
 *
 * Before these, this builder emitted seven commands, every one of them `CG …` on
 * an html producer or `MIXER … VOLUME`. `take()` is `CG … PLAY 0` — it plays a
 * template INSIDE an already-ADDed html producer — so the bridge had no way to put
 * a route, a card or a clip on a layer at all.
 */
describe('CommandBuilder — Live Source verbs (C-015 phase 6, task 6.1)', () => {
  describe('playSource — the argument is built from a PARSED SHAPE', () => {
    it('route: the channel-only form, quoted as one argument', () => {
      expect(builder.playSource(slot, { kind: 'route', channel: 2 })).toBe('PLAY 1-10 "route://2"');
    });

    it('route: the channel-AND-LAYER form, which is a safety term and not just grammar', () => {
      // On a single-channel install, `route://<channel>` pointed at its own channel
      // is a feedback loop; the studio plate can only be addressed this way (§9a.2).
      expect(builder.playSource(slot, { kind: 'route', channel: 1, layer: 20 })).toBe(
        'PLAY 1-10 "route://1-20"',
      );
    });

    it('🔴 ZERO IS FALSY — `layer: 0` is a real layer and must NOT be dropped', () => {
      // The schema is `nonnegative()`, so 0 is addressable. A truthiness check here
      // would emit `route://1` — the WHOLE CHANNEL — which on a single-channel
      // install is precisely the feedback loop the layer form exists to avoid.
      // This project has been bitten twice by a falsy zero; this is the third place
      // it could have been.
      expect(builder.playSource(slot, { kind: 'route', channel: 1, layer: 0 })).toBe(
        'PLAY 1-10 "route://1-0"',
      );
    });

    it('media: a bare file name, quoted', () => {
      expect(builder.playSource(slot, { kind: 'media', file: 'guest.mp4' })).toBe(
        'PLAY 1-10 "guest.mp4"',
      );
    });

    it('decklink: keywords and the index are AMCP SYNTAX, so they are NOT quoted', () => {
      // Parse-verified only on this installation — no capture card exists (C-021).
      expect(builder.playSource(slot, { kind: 'decklink', device: 3 })).toBe(
        'PLAY 1-10 DECKLINK DEVICE 3',
      );
    });

    it('decklink: `keyDevice` is NOT read here — a fill+key pair is TWO layers', () => {
      // Reading it here would put a key signal on the fill layer. How many
      // producers to seat, and where, is the caller's decision from the ledger's
      // `role`; this method only spells one.
      expect(builder.playSource(slot, { kind: 'decklink', device: 3, keyDevice: 4 })).toBe(
        'PLAY 1-10 DECKLINK DEVICE 3',
      );
    });

    it('ndi: the NAME is a value and IS quoted, the keywords are not', () => {
      expect(builder.playSource(slot, { kind: 'ndi', source: 'STUDIO A' })).toBe(
        'PLAY 1-10 NDI NAME "STUDIO A"',
      );
    });

    it('every user-supplied value is quoted exactly once — no framing break', () => {
      const line = builder.playSource(slot, { kind: 'media', file: 'a"b\\c' });
      const body = line.slice('PLAY 1-10 "'.length, -1);
      expect(/(?<!\\)"/.test(body)).toBe(false);
      expect(/[\n\r]/.test(line)).toBe(false);
    });

    it('is LAYER-scoped, like every other verb — the channel-scoped form is forbidden', () => {
      // `MIXER <ch> …` and `CLEAR ALL` wipe things this app does not manage. Every
      // method routes through `target()`, so this holds by construction.
      expect(builder.playSource({ channel: 2, layer: 34 }, { kind: 'route', channel: 1 })).toBe(
        'PLAY 2-34 "route://1"',
      );
    });
  });

  describe('mixerFit — FILL and CLIP as ONE pair, never two methods', () => {
    const fit = {
      fill: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
      clip: { x: 0.3, y: 0.5, width: 0.4, height: 0.5 },
    };

    it('emits BOTH commands from one call, FILL first', () => {
      expect(builder.mixerFit(slot, fit)).toEqual([
        'MIXER 1-10 FILL 0.25 0.5 0.5 0.5',
        'MIXER 1-10 CLIP 0.3 0.5 0.4 0.5',
      ]);
    });

    it('🔴 THE PAIRING IS THE POINT — there is no way to emit one without the other', () => {
      // Measured (design.md §3): CLIP masks in channel space and does not travel
      // with FILL, so a fill box outside its clip window renders NOTHING AT ALL —
      // a black hole on air, with a 202 on the wire. Two builder methods would make
      // that a caller mistake; one method makes it unrepresentable. Asserted as a
      // property of the API surface, not of one output.
      const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(builder));
      expect(surface).not.toContain('mixerFill');
      expect(surface).not.toContain('mixerClip');
      expect(builder.mixerFit(slot, fit)).toHaveLength(2);
    });

    it('emits at most 6 decimals and NEVER exponential notation', () => {
      // §6 emits computed fractions, not round numbers, and no AMCP parser is known
      // to accept `1e-7` — which is exactly what `String(1e-7)` produces. What
      // rounding the server DOES accept is unmeasured (6.3a(b)); 6 decimals matches
      // what the page uses for the same geometry so the two sides round alike.
      const [fill] = builder.mixerFit(slot, {
        fill: { x: 1 / 3, y: 1e-7, width: 2 / 3, height: 0.1 + 0.2 },
        clip: { x: 0, y: 0, width: 1, height: 1 },
      });
      expect(fill).toBe('MIXER 1-10 FILL 0.333333 0 0.666667 0.3');
      expect(fill).not.toMatch(/e-/i);
    });
  });

  describe('mixerClear — teardown, not tidiness', () => {
    it('resets the layer’s mixer geometry, layer-scoped', () => {
      expect(builder.mixerClear(slot)).toBe('MIXER 1-10 CLEAR');
    });

    it('is addressed to the LAYER and never to the channel', () => {
      // `MIXER <ch> CLEAR` would reset the whole channel's mixer, including the
      // program signal this app does not manage. The ban is by construction.
      expect(builder.mixerClear({ channel: 3, layer: 0 })).toBe('MIXER 3-0 CLEAR');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { bomIn, commitMsgVerdict } from '../src/commit-msg-decision.mjs';

/**
 * `P-025` — the commit-message BOM guard's PURE decision.
 *
 * The hook itself reads `.git/COMMIT_EDITMSG` and turns this function's answer into an exit
 * code, so everything worth trusting is here. That the real `git commit` actually refuses is
 * proven END TO END and recorded in the change (`design.md` §17.3, both directions against a
 * throwaway repository) — a unit test cannot show that the hook is WIRED.
 *
 * ⚠ Every case below is written in BYTES, never in a string literal. A literal `U+FEFF` in
 * the source would be testing whatever this file's own encoding happened to produce, and the
 * defect it guards is precisely one that a text round trip makes invisible. That is also why
 * the mark is never spelled literally in this file — golden rule 9's NUL clause, one
 * character over: a file about an invisible byte must not contain one.
 */

/** The mark itself, built from its code point — never typed into the source. */
const BOM_CHAR = String.fromCharCode(0xfeff);

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'utf8'));
const withMark = (mark: readonly number[], text: string): Uint8Array =>
  Uint8Array.from([...mark, ...Buffer.from(text, 'utf8')]);

const UTF8 = [0xef, 0xbb, 0xbf] as const;
const MESSAGE = 'docs(runtime): record the Linux e2e';

describe('bomIn — which mark the message begins with', () => {
  it('names the UTF-8 BOM PowerShell prepends', () => {
    expect(bomIn(withMark(UTF8, MESSAGE))).toBe('UTF-8');
  });

  it('names both UTF-16 marks, which are the same accident in another encoding', () => {
    expect(bomIn(bytes(0xff, 0xfe, 0x64, 0x00))).toBe('UTF-16 LE');
    expect(bomIn(bytes(0xfe, 0xff, 0x00, 0x64))).toBe('UTF-16 BE');
  });

  it('🔴 a clean message has none — and neither does a NON-ASCII one', () => {
    expect(bomIn(ascii(MESSAGE))).toBeNull();
    // The commits this repo actually writes: em-dashes, Persian, the lot. Refusing those
    // would make the guard useless within a day, so it is asserted rather than assumed.
    expect(bomIn(ascii('feat(runtime): the caution token — split, سلام'))).toBeNull();
  });

  it('🔴 the mark must be at the START — one later is a different thing and passes', () => {
    // A quoted file or a paste can carry a BOM mid-message. That is not this defect, and a
    // guard that refused it would be refusing text it has no business judging.
    expect(bomIn(withMark([...ascii('fix: quoting a file')], `${BOM_CHAR} tail`))).toBeNull();
  });
});

describe('commitMsgVerdict — the exit code the hook takes', () => {
  it('refuses a BOM-led message and names the mark', () => {
    expect(commitMsgVerdict(withMark(UTF8, MESSAGE))).toEqual({ ok: false, mark: 'UTF-8' });
  });

  it('lets a clean message through', () => {
    expect(commitMsgVerdict(ascii(MESSAGE))).toEqual({ ok: true });
  });

  it('🔴 FAILS OPEN on anything it cannot read — a guard must never block every commit', () => {
    expect(commitMsgVerdict(null)).toEqual({ ok: true });
    expect(commitMsgVerdict(undefined)).toEqual({ ok: true });
    // An empty message is git's own business (it refuses one itself); not this guard's.
    expect(commitMsgVerdict(bytes())).toEqual({ ok: true });
  });

  it('a message SHORTER than a mark is not mistaken for one', () => {
    // `EF BB` alone is a truncated read, not a UTF-8 BOM — the `every` must not pass on
    // `undefined === undefined` for the third byte.
    expect(commitMsgVerdict(bytes(0xef, 0xbb))).toEqual({ ok: true });
  });
});

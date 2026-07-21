import { describe, expect, it } from 'vitest';
import { isDeletionOnlyPush, parsePrePushRef } from '../src/pre-push-decision.mjs';

/**
 * P-010 — the `.husky/pre-push` guard's PURE decision logic. The hook itself is three
 * lines of shell (read stdin, ask the CLI, run `pnpm gate` or don't), so everything
 * worth trusting is here.
 *
 * The bias under test is asymmetric on purpose: a wrong `true` SKIPS the only merge
 * gate this repo has while Actions billing is out, whereas a wrong `false` merely costs
 * two minutes. So every ambiguous input must come back `false`.
 */

const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_B = '0f1e2d3c4b5a69788796a5b4c3d2e1f098765432';
const ZERO = '0'.repeat(40);
const ZERO_256 = '0'.repeat(64);

/** A normal "push my commits" line, as git writes it. */
const update = (branch = 'main', local = SHA_A, remote = SHA_B) =>
  `refs/heads/${branch} ${local} refs/heads/${branch} ${remote}`;

/** A deletion line, as git writes it: literal `(delete)` + an all-zero local oid. */
const deletion = (branch = 'main', zero = ZERO, remote = SHA_B) =>
  `(delete) ${zero} refs/heads/${branch} ${remote}`;

describe('parsePrePushRef', () => {
  it('reads the four fields of a normal update', () => {
    expect(parsePrePushRef(update('feat/x'))).toEqual({
      localRef: 'refs/heads/feat/x',
      localOid: SHA_A,
      remoteRef: 'refs/heads/feat/x',
      remoteOid: SHA_B,
      isDeletion: false,
    });
  });

  it('flags the `(delete)` + zero-oid pair as a deletion', () => {
    expect(parsePrePushRef(deletion('docs/old'))?.isDeletion).toBe(true);
  });

  it('accepts sha256 object ids', () => {
    expect(parsePrePushRef(deletion('x', ZERO_256, 'a'.repeat(64)))?.isDeletion).toBe(true);
  });

  it('rejects HALF a deletion in either direction — the two signals must agree', () => {
    expect(parsePrePushRef(`refs/heads/x ${ZERO} refs/heads/x ${SHA_B}`)).toBeNull();
    expect(parsePrePushRef(`(delete) ${SHA_A} refs/heads/x ${SHA_B}`)).toBeNull();
  });

  it('rejects wrong field counts, non-hex oids, and non-`refs/` remotes', () => {
    expect(parsePrePushRef(`refs/heads/x ${SHA_A} refs/heads/x`)).toBeNull();
    expect(parsePrePushRef(`refs/heads/x ${SHA_A} refs/heads/x ${SHA_B} extra`)).toBeNull();
    expect(parsePrePushRef(`refs/heads/x zzzz refs/heads/x ${SHA_B}`)).toBeNull();
    expect(parsePrePushRef(`refs/heads/x ${SHA_A} heads/x ${SHA_B}`)).toBeNull();
  });
});

describe('isDeletionOnlyPush — skip only when there is provably no content', () => {
  it('3.1 skips a push whose every ref is a deletion', () => {
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\n`)).toBe(true);
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\n${deletion('fix/b')}\n`)).toBe(true);
  });

  it('3.2 gates a single normal push', () => {
    expect(isDeletionOnlyPush(`${update('feat/x')}\n`)).toBe(false);
  });

  it('3.3 gates a MIXED push — one real update alongside deletions still carries content', () => {
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\n${update('feat/x')}\n`)).toBe(false);
    expect(isDeletionOnlyPush(`${update('feat/x')}\n${deletion('docs/a')}\n`)).toBe(false);
  });

  it('3.4 gates on EMPTY stdin — unknown must mean "gate it"', () => {
    expect(isDeletionOnlyPush('')).toBe(false);
    expect(isDeletionOnlyPush('\n\n')).toBe(false);
    expect(isDeletionOnlyPush(null)).toBe(false);
    expect(isDeletionOnlyPush(undefined)).toBe(false);
  });

  it('3.5 gates when ANY line is malformed, even if the rest are deletions', () => {
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\nnot a ref line\n`)).toBe(false);
    expect(isDeletionOnlyPush('garbage')).toBe(false);
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\nrefs/heads/x ${SHA_A}\n`)).toBe(false);
  });

  it('tolerates CRLF and trailing whitespace — git bash on Windows writes both', () => {
    expect(isDeletionOnlyPush(`${deletion('docs/a')}\r\n${deletion('fix/b')}\r\n`)).toBe(true);
    expect(isDeletionOnlyPush(`  ${deletion('docs/a')}  \n`)).toBe(true);
  });

  it('is pure — the same input decides the same way every time', () => {
    const input = `${deletion('docs/a')}\n`;
    expect(isDeletionOnlyPush(input)).toBe(isDeletionOnlyPush(input));
  });
});

import { describe, expect, it } from 'vitest';
import {
  PlayoutSignInError,
  REFRESH_LEAD_MS,
  RECORD_BODY_MAX,
  refreshDelayMs,
  refreshPlayoutToken,
  signInToPlayout,
  type PlayoutFetchLike,
  type PlayoutResponseLike,
} from '../src/playout-session.js';

/**
 * `CENTRAL-BRIDGE-01` (D7) — the Playout's D1 and D2, once, for the console and for CG Bridge's own
 * session. Driven by a scripted `fetch`, so every answer the contract defines — and the three it
 * does not (no answer, no JSON, no lifetime) — is read the one way.
 */

function answer(status: number, body: unknown): PlayoutResponseLike {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
  };
}

/** A fetch that answers once, recording what it was sent. */
function scripted(
  reply: PlayoutResponseLike | Error,
  sent: { url: string; body: unknown }[] = [],
): PlayoutFetchLike {
  return (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) as unknown });
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  };
}

const NOW = 1_000_000;
const TOKENS = {
  access_token: 'jwt.a.b',
  refresh_token: 'refresh-2',
  expires_in: 43_200,
  principal: { name: 'زهرا موسوی' },
};

async function failureOf(p: Promise<unknown>): Promise<PlayoutSignInError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof PlayoutSignInError) return err;
    throw err;
  }
  throw new Error('it resolved');
}

describe('D1 — sign in', () => {
  it('POSTs the pair once and reads the tokens, the lifetime and the name echo', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const out = await signInToPlayout('http://p/api/cg/auth/token', 'cg-admin', 'pw', {
      fetchImpl: scripted(answer(200, TOKENS), sent),
      nowMs: () => NOW,
    });
    expect(sent).toEqual([
      { url: 'http://p/api/cg/auth/token', body: { username: 'cg-admin', password: 'pw' } },
    ]);
    expect(out).toEqual({
      session: { accessToken: 'jwt.a.b', refreshToken: 'refresh-2', expiresAtMs: NOW + 43_200_000 },
      echo: { name: 'زهرا موسوی' },
    });
  });

  it('the body’s CODE decides, over the status — two 401s are two different facts', async () => {
    const wrong = await failureOf(
      signInToPlayout('u', 'a', 'b', {
        fetchImpl: scripted(answer(401, { error: 'invalid_credentials', message: 'فارسی' })),
      }),
    );
    expect(wrong.code).toBe('invalid_credentials');
    // The Playout's own text is kept for the RECORD, never shown.
    expect(wrong.detail).toEqual({
      status: 401,
      body: JSON.stringify({ error: 'invalid_credentials', message: 'فارسی' }),
    });
    const spent = await failureOf(
      refreshPlayoutToken('u', 'r', {
        fetchImpl: scripted(answer(401, { error: 'invalid_refresh_token' })),
      }),
    );
    expect(spent.code).toBe('invalid_refresh_token');
  });

  it('with no code in the body, the STATUS is the fallback — each of the contract’s four, and anything else', async () => {
    for (const [status, code] of [
      [401, 'invalid_credentials'],
      [403, 'no_cg_access'],
      [423, 'account_locked'],
      [429, 'rate_limited'],
      [500, 'unexpected'],
    ] as const) {
      const err = await failureOf(
        signInToPlayout('u', 'a', 'b', { fetchImpl: scripted(answer(status, 'not json')) }),
      );
      expect(err.code, String(status)).toBe(code);
    }
  });

  it('the kept body is cut to the record’s bound', async () => {
    const err = await failureOf(
      signInToPlayout('u', 'a', 'b', {
        fetchImpl: scripted(answer(502, 'x'.repeat(RECORD_BODY_MAX + 50))),
      }),
    );
    expect(err.detail?.body.length).toBe(RECORD_BODY_MAX);
  });

  it('NO answer at all is `unreachable` — a different place to look than a wrong password', async () => {
    const err = await failureOf(
      signInToPlayout('u', 'a', 'b', { fetchImpl: scripted(new Error('ECONNREFUSED')) }),
    );
    expect(err.code).toBe('unreachable');
    expect(err.detail).toEqual({ status: null, body: '' });
  });

  it('an answer the contract does not define is `unexpected` — no token, no lifetime, no JSON', async () => {
    for (const body of [
      { refresh_token: 'r', expires_in: 60 },
      { access_token: 'a', expires_in: 0 },
      { access_token: 'a' },
    ]) {
      const err = await failureOf(
        signInToPlayout('u', 'a', 'b', { fetchImpl: scripted(answer(200, body)) }),
      );
      expect(err.code, JSON.stringify(body)).toBe('unexpected');
    }
    const notJson = await failureOf(
      signInToPlayout('u', 'a', 'b', { fetchImpl: scripted(answer(200, '<html>')) }),
    );
    expect(notJson.code).toBe('unexpected');
  });

  it('with no fetch passed it uses the runtime’s own — and says so when there is none', async () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    try {
      (globalThis as { fetch?: unknown }).fetch = scripted(answer(200, TOKENS));
      const out = await signInToPlayout('u', 'a', 'b', { nowMs: () => NOW });
      expect(out.session.accessToken).toBe('jwt.a.b');
      (globalThis as { fetch?: unknown }).fetch = undefined;
      expect((await failureOf(signInToPlayout('u', 'a', 'b'))).code).toBe('unreachable');
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe('D2 — refresh', () => {
  it('a rotated token REPLACES the old one; a Playout that does not rotate leaves it absent', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const rotated = await refreshPlayoutToken('http://p/api/cg/auth/refresh', 'refresh-1', {
      fetchImpl: scripted(answer(200, TOKENS), sent),
      nowMs: () => NOW,
    });
    expect(sent[0]?.body).toEqual({ refresh_token: 'refresh-1' });
    expect(rotated.refreshToken).toBe('refresh-2');
    const kept = await refreshPlayoutToken('u', 'refresh-1', {
      fetchImpl: scripted(answer(200, { access_token: 'a', expires_in: 60 })),
      nowMs: () => NOW,
    });
    expect(kept).toEqual({ accessToken: 'a', refreshToken: null, expiresAtMs: NOW + 60_000 });
  });
});

describe('when to refresh', () => {
  it('ten minutes before `exp`, and never in the past', () => {
    expect(refreshDelayMs(NOW + REFRESH_LEAD_MS + 5_000, NOW)).toBe(5_000);
    expect(refreshDelayMs(NOW + 60_000, NOW)).toBe(0);
  });
});

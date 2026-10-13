import { describe, expect, it } from 'vitest';
import {
  PLAYOUT_MESSAGE_MAX,
  PlayoutSignInError,
  REFRESH_LEAD_MS,
  RECORD_BODY_MAX,
  refreshDelayMs,
  refreshPlayoutToken,
  refreshTokenFate,
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

/**
 * `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §2, §8) — `cg_not_licensed`, the Playout's own message, and
 * what a failed D2 did to its token.
 */
describe('CENTRAL-BRIDGE-01-A — `cg_not_licensed`', () => {
  const MESSAGE = 'لایسنسِ این Playout شاملِ CG Control نیست.';

  it('D1 and D2 read the code AND keep the Playout’s message', async () => {
    const body = { error: 'cg_not_licensed', message: MESSAGE };
    const d1 = await failureOf(
      signInToPlayout('u', 'a', 'b', { fetchImpl: scripted(answer(403, body)) }),
    );
    expect(d1.code).toBe('cg_not_licensed');
    expect(d1.playoutMessage).toBe(MESSAGE);
    const d2 = await failureOf(
      refreshPlayoutToken('u', 'r', { fetchImpl: scripted(answer(403, body)) }),
    );
    expect(d2.code).toBe('cg_not_licensed');
    expect(d2.playoutMessage).toBe(MESSAGE);
  });

  it('the message is kept as it is, in ONE line and one line’s length — and absent when blank', async () => {
    const of = async (message: unknown): Promise<string | null> =>
      (
        await failureOf(
          signInToPlayout('u', 'a', 'b', {
            fetchImpl: scripted(answer(403, { error: 'cg_not_licensed', message })),
          }),
        )
      ).playoutMessage;
    expect(await of(`  لایسنس\n  منقضی   شده است.\r\n`)).toBe('لایسنس منقضی شده است.');
    expect((await of('x'.repeat(PLAYOUT_MESSAGE_MAX + 40)))?.length).toBe(PLAYOUT_MESSAGE_MAX);
    expect(await of('   ')).toBeNull();
    expect(await of(42)).toBeNull();
  });

  it('a request that failed carries WHY — the caller tells "never reached" from "answer lost"', async () => {
    const refused = new Error('connect ECONNREFUSED');
    const err = await failureOf(refreshPlayoutToken('u', 'r', { fetchImpl: scripted(refused) }));
    expect(err.code).toBe('unreachable');
    expect(err.cause).toBe(refused);
  });

  it('a bounded wait: a Playout that never answers is given up on, as `unreachable`', async () => {
    /** The part of an `AbortSignal` this reads — typed structurally, as the package does. */
    interface SignalLike {
      readonly reason: unknown;
      addEventListener(type: 'abort', listener: () => void, options: { once: boolean }): void;
    }
    const hanging: PlayoutFetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const { signal } = init as { signal?: SignalLike };
        if (signal === undefined) return; // unbounded: hangs, and the test times out
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const err = await failureOf(
      refreshPlayoutToken('u', 'r', { fetchImpl: hanging, timeoutMs: 20 }),
    );
    expect(err.code).toBe('unreachable');
    expect((err.cause as Error).name).toBe('TimeoutError');
  });
});

describe('CENTRAL-BRIDGE-01-A — what a failed D2 did to its token', () => {
  async function fateOf(reply: PlayoutResponseLike | Error): Promise<string> {
    try {
      await refreshPlayoutToken('u', 'r', { fetchImpl: scripted(reply) });
    } catch (err) {
      return refreshTokenFate(err);
    }
    return 'resolved';
  }

  it('401 is SPENT — gone; only a full sign-in goes on (a disabled or deleted user too, their §4)', async () => {
    expect(await fateOf(answer(401, { error: 'invalid_refresh_token' }))).toBe('spent');
  });

  /*
    🔴 `RELEASE-0112-01-C` C2 — the Playout team's own table (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md`
    §4): every one of these comes BEFORE the token is used, so the token is KEPT.
  */
  it('🔴 their table’s refusals before use are KEPT — 400, 415, 403, 404, 429', async () => {
    for (const [status, error] of [
      [400, 'invalid_request'],
      [415, 'unsupported_media_type'],
      [403, 'cg_not_licensed'],
      [403, 'no_cg_access'],
      [404, 'not_found'],
      [429, 'rate_limited'],
    ] as const) {
      expect(await fateOf(answer(status, { error })), `${String(status)} ${error}`).toBe('kept');
    }
    // A bare 404 too — CG Control switched off answers with no body of ours.
    expect(await fateOf(answer(404, '')), 'a bare 404').toBe('kept');
  });

  it('🔴 an answer that does not say is UNKNOWN — never sent again; 423 is D1’s alone, so at D2 it is unknown', async () => {
    expect(await fateOf(answer(500, 'boom')), '5xx').toBe('unknown');
    expect(await fateOf(answer(502, '')), 'a gateway').toBe('unknown');
    // A status their table does not name is not assumed to be a refusal before use: a wrong `kept`
    // resends a used token past the 10 s grace, and that signs the whole account out.
    expect(await fateOf(answer(423, { error: 'account_locked' })), '423 at D2').toBe('unknown');
    expect(await fateOf(answer(409, '')), 'a 409').toBe('unknown');
    expect(await fateOf(new Error('socket hang up')), 'no answer').toBe('unknown');
    // A 200 the Playout sent means it USED the token — and the successor could not be read.
    expect(await fateOf(answer(200, { expires_in: 60 })), 'an unreadable 200').toBe('unknown');
    expect(refreshTokenFate(new Error('not ours')), 'not a sign-in failure').toBe('unknown');
  });
});

describe('when to refresh', () => {
  it('ten minutes before `exp`, and never in the past', () => {
    expect(refreshDelayMs(NOW + REFRESH_LEAD_MS + 5_000, NOW)).toBe(5_000);
    expect(refreshDelayMs(NOW + 60_000, NOW)).toBe(0);
  });
});

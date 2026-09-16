/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { TEMPLATE_COMPLETE_PATH } from '@cg/shared-schema';
import { installCompletionPing } from '../src/adapters/completion-ping.js';
import { EventBus } from '../src/event-bus.js';
import type { SelfEndEvent, TemplateRuntime } from '../src/types.js';

/**
 * 🔴 `SELF-STOP-24` §2.1 — **THE REPORTER: one request per take, and silence everywhere else.**
 *
 * This is the only code in the tree that opens a network connection from a broadcast template,
 * so every guard on it is load-bearing rather than defensive-by-habit:
 *
 *  - **no token ⇒ no connection.** The token is the ARMING KEY, and it is what makes the served
 *    page's `connect-src 'self'` safe: a template opened anywhere that is not this bridge — a
 *    `file://` drop, a third-party host, the Designer's own preview — never receives one and
 *    therefore never opens a socket.
 *  - **`file://` ⇒ no connection**, belt to the token's braces. An opaque origin has nothing to
 *    post to, and `C-017` scopes the manually-dropped artifact out explicitly.
 *  - **every failure is swallowed.** A page that throws towards air is worse than a row that
 *    goes on claiming it. A refusal, a network error and a 500 are all the same silent outcome.
 *  - **once per token.** A second self-end on the same token sends nothing; a NEW token re-arms.
 */

/** A minimal stand-in for the runtime's event surface — the adapter uses nothing else. */
function fakeRuntime(): { rt: TemplateRuntime; selfEnd: (e: SelfEndEvent) => void } {
  const bus = new EventBus();
  return {
    rt: { on: bus.on.bind(bus) } as unknown as TemplateRuntime,
    selfEnd: (e) => {
      bus.emit('self-end', e);
    },
  };
}

interface FakeWin {
  location: { protocol: string; origin: string };
  fetch?: unknown;
}

function fakeWin(over: Partial<FakeWin> = {}): FakeWin {
  return {
    location: { protocol: 'http:', origin: 'http://10.0.0.5:9271' },
    fetch: vi.fn(() => Promise.resolve({ ok: true })),
    ...over,
  };
}

const install = (rt: TemplateRuntime, win: FakeWin): (() => void) =>
  installCompletionPing(rt, win as unknown as Window & typeof globalThis);

describe('SELF-STOP-24 — the served page reports its own completion', () => {
  it('posts once, to its own origin, naming the take', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin();
    install(rt, win);

    selfEnd({ take: 'tok-1' });

    const fetchMock = win.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(`http://10.0.0.5:9271${TEMPLATE_COMPLETE_PATH}`);
    expect(init['method']).toBe('POST');
    expect(JSON.parse(String(init['body'])) as unknown).toEqual({ take: 'tok-1' });
  });

  it('a page with NO token opens no connection', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin();
    install(rt, win);

    selfEnd({});

    expect(win.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('a page over file:// opens no connection', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({ location: { protocol: 'file:', origin: 'null' } });
    install(rt, win);

    selfEnd({ take: 'tok-1' });

    expect(win.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it.each([
    ['about:', 'about:srcdoc', "the console's PVW / rehearsal frame"],
    ['blob:', 'blob:http://localhost/abc', 'a blob-URL preview host'],
  ])('🔴 REPLY 1 §R2 — a %s page opens no connection (%s — %s)', (protocol, origin, _host) => {
    /*
        The PREVIEW HOSTS, refused by the same guard as `file://` and named here so the refusal
        is a decision rather than a side effect.

        `pvw-holds-no-take-token.spec.ts` proves in Chromium that the console's rehearsal frame
        reports exactly `about:srcdoc`, and that PVW is handed no token in the first place. This
        is the second half of that belt: even if a token ever reached a preview host, the
        reporter would not open a socket for it. Two independent reasons, on different axes —
        which is what "only a CasparCG page may hold a live token" needs to survive one of them
        being edited by somebody who did not read this.
      */
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({ location: { protocol, origin } });
    install(rt, win);

    selfEnd({ take: 'tok-1' });

    expect(win.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('the SAME token twice sends one request', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin();
    install(rt, win);

    selfEnd({ take: 'tok-1' });
    selfEnd({ take: 'tok-1' });

    expect(win.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('a NEW token re-arms — a re-taken row reports its second run too', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin();
    install(rt, win);

    selfEnd({ take: 'tok-1' });
    selfEnd({ take: 'tok-2' });

    const fetchMock = win.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[1] as [string, Record<string, unknown>])[1]['body']),
      ) as unknown,
    ).toEqual({
      take: 'tok-2',
    });
  });

  it('a THROWING transport does not reach the caller', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({
      fetch: vi.fn(() => {
        throw new Error('CSP refused the connection');
      }),
    });
    install(rt, win);

    expect(() => selfEnd({ take: 'tok-1' })).not.toThrow();
  });

  it('a REJECTING transport does not produce an unhandled rejection', async () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({ fetch: vi.fn(() => Promise.reject(new Error('network'))) });
    install(rt, win);

    selfEnd({ take: 'tok-1' });
    // If the adapter did not attach a catch, this microtask drain surfaces the rejection.
    await Promise.resolve();
    await Promise.resolve();
    expect(win.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('a host with NO fetch falls back to XHR rather than going silent', () => {
    // CEF is full Chromium and has `fetch`, but this adapter is the one piece of the feature
    // whose failure mode is "nothing happens, nowhere, with no error" — so the fallback exists
    // and is pinned rather than assumed away (the B-066 class: verify, never assume).
    interface Rec {
      method?: string;
      url?: string;
      body?: unknown;
      headers: [string, string][];
    }
    const sent: Rec[] = [];
    class FakeXhr {
      #rec: Rec = { headers: [] };
      open(method: string, url: string): void {
        this.#rec.method = method;
        this.#rec.url = url;
      }
      setRequestHeader(key: string, value: string): void {
        this.#rec.headers.push([key, value]);
      }
      send(body?: unknown): void {
        this.#rec.body = body;
        sent.push(this.#rec);
      }
    }
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({ fetch: undefined });
    (win as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
    install(rt, win);

    selfEnd({ take: 'tok-1' });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toBe(`http://10.0.0.5:9271${TEMPLATE_COMPLETE_PATH}`);
    expect(JSON.parse(String(sent[0]?.body)) as unknown).toEqual({ take: 'tok-1' });
    // The same content type as the fetch path — the bridge parses one body shape, not two.
    expect(sent[0]?.headers).toEqual([['content-type', 'application/json']]);
  });

  it('a host with NEITHER transport is silent, not broken', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin({ fetch: undefined });
    install(rt, win);

    expect(() => selfEnd({ take: 'tok-1' })).not.toThrow();
  });

  it('the returned cleanup unsubscribes', () => {
    const { rt, selfEnd } = fakeRuntime();
    const win = fakeWin();
    const stop = install(rt, win);

    stop();
    selfEnd({ take: 'tok-1' });

    expect(win.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

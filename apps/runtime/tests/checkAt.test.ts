import { describe, expect, it } from 'vitest';
import { normalisePlayoutAddress, parseWsFrame, serializeWsFrame } from '@cg/shared-ipc';
import {
  bridgeAnswersAt,
  bridgePortProblems,
  BridgeNotAnsweringError,
  checkOnItsOwnSocket,
  playoutAsBridgeNamesIt,
  stationBridgeAnswers,
  type CheckSocket,
} from '../src/platform/checkAt.js';
import { bridgeAddressFor, rebaseLoopback } from '../src/platform/bridgeUrl.js';

/**
 * 🔴 `B-317` (`RELEASE-0114-01` A3/A4) — **THE CHECK RUNS WHERE `Connect` WILL GO**, on a socket of its
 * own when that is not the console's; and the addresses it names are the ones the console would dial.
 */

/** A socket that opens (or never does) and answers each request with what `answer` says. */
class FakeSocket implements CheckSocket {
  readyState = 0;
  readonly sent: { type: string; channel?: string; payload?: unknown; token?: string }[] = [];
  closed = false;
  readonly #listeners = new Map<string, ((ev: { data: unknown }) => void)[]>();
  constructor(
    readonly url: string,
    private readonly answer: (channel: string, payload: unknown) => unknown,
    opens: boolean,
  ) {
    if (opens) {
      setTimeout(() => {
        this.readyState = 1;
        this.#emit('open', { data: null });
      }, 1);
    }
  }
  addEventListener(type: string, listener: (ev: { data: unknown }) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }
  send(data: string): void {
    const frame = parseWsFrame(data);
    if (frame === null) throw new Error(`bad frame ${data}`);
    if (frame.type === 'auth') {
      this.sent.push({ type: 'auth', token: frame.token });
      this.#reply(frame.id, { principal: null, permittedChannels: [] });
      return;
    }
    if (frame.type !== 'request') return;
    this.sent.push({ type: 'request', channel: frame.channel, payload: frame.payload });
    this.#reply(frame.id, this.answer(frame.channel, frame.payload));
  }
  close(): void {
    this.closed = true;
  }
  #reply(id: string, payload: unknown): void {
    setTimeout(() => {
      this.#emit('message', { data: serializeWsFrame({ type: 'response', id, payload }) });
    }, 1);
  }
  #emit(type: string, ev: { data: unknown }): void {
    for (const l of this.#listeners.get(type) ?? []) l(ev);
  }
}

const RESULT = { lines: [{ id: 'api', status: 'pass', text: 'ok' }], localAddress: null };

function bridgeThatAnswers(signInUrl: string | null) {
  return (channel: string): unknown =>
    channel === 'bridge.capabilities'
      ? {
          channels: [],
          bridgeVersion: '0.11.4',
          ...(signInUrl !== null ? { auth: 'playout', signInUrl } : {}),
        }
      : RESULT;
}

describe('B-317 — a check on CG Bridge’s own socket', () => {
  it('nothing opens there: the operator’s sentence naming WHERE, never the console’s refusal of a command', async () => {
    const sockets: FakeSocket[] = [];
    const err = await checkOnItsOwnSocket({
      url: 'ws://127.0.0.1:5280',
      address: '127.0.0.1:5280',
      request: { playoutAddress: 'http://127.0.0.1:8080', origin: 'http://tauri.localhost' },
      createSocket: (url) => {
        const s = new FakeSocket(url, () => null, false);
        sockets.push(s);
        return s;
      },
      token: null,
      waitMs: 500,
      connectMs: 30,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeNotAnsweringError);
    expect((err as Error).message).toBe('CG Bridge is not answering at 127.0.0.1:5280.');
    expect((err as Error).message).not.toMatch(/command rejected|Not sent to CasparCG/);
    expect(sockets.map((s) => s.url)).toEqual(['ws://127.0.0.1:5280']);
    expect(sockets[0]?.closed).toBe(true);
  });

  it('it answers: capabilities, then the check, on THAT socket — which is closed after', async () => {
    let socket: FakeSocket | null = null;
    const { result, capabilities } = await checkOnItsOwnSocket({
      url: 'ws://10.0.0.5:5280',
      address: '10.0.0.5:5280',
      request: { playoutAddress: 'http://10.0.0.7:8080', origin: 'http://tauri.localhost' },
      createSocket: (url) => (socket = new FakeSocket(url, bridgeThatAnswers(null), true)),
      token: null,
      waitMs: 500,
    });
    expect(result).toEqual(RESULT);
    expect(capabilities?.bridgeVersion).toBe('0.11.4');
    const s = socket as FakeSocket | null;
    expect(s?.sent.map((f) => f.channel)).toEqual(['bridge.capabilities', 'setup.check']);
    expect(s?.closed).toBe(true);
  });

  it('a signed-in console presents its token first; an unsigned one does not', async () => {
    const run = async (token: string | null): Promise<FakeSocket> => {
      let socket: FakeSocket | null = null;
      await checkOnItsOwnSocket({
        url: 'ws://10.0.0.5:5280',
        address: '10.0.0.5:5280',
        request: { playoutAddress: 'http://10.0.0.7:8080', origin: 'http://tauri.localhost' },
        createSocket: (url) => (socket = new FakeSocket(url, bridgeThatAnswers(null), true)),
        token,
        waitMs: 500,
      });
      if (socket === null) throw new Error('no socket');
      return socket;
    };
    expect((await run('jwt')).sent[0]).toEqual({ type: 'auth', token: 'jwt' });
    expect((await run(null)).sent.map((f) => f.type)).toEqual(['request', 'request']);
  });

  it('🔴 CG Bridge on the Playout’s machine names its Playout by loopback: the check asks by THAT name', async () => {
    let socket: FakeSocket | null = null;
    await checkOnItsOwnSocket({
      url: 'ws://192.168.21.111:5280',
      address: '192.168.21.111:5280',
      request: { playoutAddress: 'http://192.168.21.111:8080', origin: 'http://tauri.localhost' },
      createSocket: (url) =>
        (socket = new FakeSocket(
          url,
          bridgeThatAnswers('http://127.0.0.1:8080/api/cg/auth/token'),
          true,
        )),
      token: null,
      waitMs: 500,
    });
    const asked = (socket as FakeSocket | null)?.sent.find((f) => f.channel === 'setup.check');
    expect((asked?.payload as { playoutAddress: string }).playoutAddress).toBe(
      'http://127.0.0.1:8080',
    );
  });
});

describe('B-317 — asking by CG Bridge’s own name, only for the same Playout', () => {
  const ITS = 'http://127.0.0.1:8080/api/cg/auth/token';
  it('the typed host IS CG Bridge’s, CG Bridge names its Playout by loopback on the same port', () => {
    expect(playoutAsBridgeNamesIt('http://192.168.21.111:8080', '192.168.21.111', ITS)).toBe(
      'http://127.0.0.1:8080',
    );
  });
  it('CONTROL — another host, another port, or a CG Bridge that names a real address: asked as typed', () => {
    expect(playoutAsBridgeNamesIt('http://192.168.21.114:8080', '192.168.21.111', ITS)).toBe(
      'http://192.168.21.114:8080',
    );
    expect(playoutAsBridgeNamesIt('http://192.168.21.111:9090', '192.168.21.111', ITS)).toBe(
      'http://192.168.21.111:9090',
    );
    expect(
      playoutAsBridgeNamesIt(
        'http://192.168.21.111:8080',
        '192.168.21.111',
        'http://192.168.21.111:8080/api/cg/auth/token',
      ),
    ).toBe('http://192.168.21.111:8080');
    expect(playoutAsBridgeNamesIt('http://192.168.21.111:8080', '192.168.21.111', null)).toBe(
      'http://192.168.21.111:8080',
    );
  });
});

describe('B-317 — a loopback address CG Bridge advertises names CG Bridge’s machine', () => {
  it('rebased onto the host the console reaches CG Bridge at', () => {
    expect(rebaseLoopback('http://127.0.0.1:8080/api/cg/auth/token', '192.168.21.111')).toBe(
      'http://192.168.21.111:8080/api/cg/auth/token',
    );
    expect(rebaseLoopback('http://localhost:8080/api/cg/auth/refresh', '10.0.0.5')).toBe(
      'http://10.0.0.5:8080/api/cg/auth/refresh',
    );
  });
  it('CONTROL — a real address, or a console on CG Bridge’s own machine (loopback), is left as it is', () => {
    const real = 'http://192.168.21.111:8080/api/cg/auth/token';
    expect(rebaseLoopback(real, '10.0.0.5')).toBe(real);
    const loop = 'http://127.0.0.1:8080/api/cg/auth/token';
    expect(rebaseLoopback(loop, '127.0.0.1')).toBe(loop);
    expect(rebaseLoopback(null, '10.0.0.5')).toBeNull();
  });
});

describe('B-317 — the one address the fields resolve to', () => {
  it('the CG Bridge field when typed, else the Playout’s host on 5280; a three-part IPv4 read as the parser reads it', () => {
    expect(bridgeAddressFor('http://127.0.0.1:8080', '')).toBe('127.0.0.1:5280');
    expect(bridgeAddressFor('http://127.0.0.1:8080', '192.168.21.111')).toBe('192.168.21.111:5280');
    expect(bridgeAddressFor('http://10.0.0.7:8080', '10.0.0.5:5281')).toBe('10.0.0.5:5281');
    // The owner's `192.168.111`: the address the console would really dial, said back to him.
    const typo = normalisePlayoutAddress('192.168.111:8000');
    expect(typo).not.toBeNull();
    expect(bridgeAddressFor(typo ?? '', '')).toBe('192.168.0.111:5280');
  });
});

describe('R-090 / B-317 — CG Bridge’s /health, read with no credentials', () => {
  const json = (body: unknown) => () => Promise.resolve({ json: () => Promise.resolve(body) });
  it('the address gate: CG Bridge answers → null; nothing, or something else → the sentence naming where', async () => {
    expect(
      await bridgeAnswersAt('ws://10.0.0.5:5280', '10.0.0.5:5280', json({ app: 'cg-bridge' })),
    ).toBeNull();
    expect(
      await bridgeAnswersAt('ws://10.0.0.5:5280', '10.0.0.5:5280', json({ app: 'nginx' })),
    ).toBe('CG Bridge is not answering at 10.0.0.5:5280.');
    expect(
      await bridgeAnswersAt('ws://10.0.0.5:5280', '10.0.0.5:5280', () =>
        Promise.reject(new Error('refused')),
      ),
    ).toBe('CG Bridge is not answering at 10.0.0.5:5280.');
  });

  it('a record that names no Playout is refused before anything is read', async () => {
    expect(await stationBridgeAnswers({ playoutAddress: 'http://' })).toBe(
      'That is not a Playout address.',
    );
  });

  it('only CG Bridge’s OWN port problems are taken, in its words', async () => {
    const problems = await bridgePortProblems(
      'ws://10.0.0.5:5280',
      json({
        problems: [
          {
            code: 'port-refused',
            message: 'cannot open UDP 6251 (OSC from CasparCG): held by x (PID 1).',
          },
          { code: 'playout-session', message: 'CG Bridge needs a station admin to sign in.' },
        ],
      }),
    );
    expect(problems).toEqual([
      {
        code: 'port-refused',
        message: 'cannot open UDP 6251 (OSC from CasparCG): held by x (PID 1).',
      },
    ]);
    expect(
      await bridgePortProblems('ws://10.0.0.5:5280', () => Promise.reject(new Error('x'))),
    ).toEqual([]);
  });
});

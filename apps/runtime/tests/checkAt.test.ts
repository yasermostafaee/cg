import { describe, expect, it } from 'vitest';
import {
  normalisePlayoutAddress,
  parseWsFrame,
  serializeWsFrame,
  type ConnectionCheckResult,
} from '@cg/shared-ipc';
import {
  bridgeAnswersAt,
  BridgeNotAnsweringError,
  checkByBridgeName,
  checkOnItsOwnSocket,
  linesInTheGivenName,
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

/**
 * 🔴 `B-321` (`SIGNIN-ESCAPE-01` A3) — **THE ANSWER, SAID BACK IN THE NAME THE CONSOLE WAS GIVEN.** The owner's
 * gate read `127.0.0.1 answers, but nothing listens on port 8080.` under a card reading
 * `http://192.168.21.93:8080`: the console asked by CG Bridge's name (above) and showed CG Bridge's words as they
 * came back.
 */
describe('B-321 — the check’s answer in the name the console was given', () => {
  const ITS = 'http://127.0.0.1:8080/api/cg/auth/token';
  /** CG Bridge on the owner's PC, about its own loopback, with nothing listening there. */
  const OWNERS_ANSWER: ConnectionCheckResult = {
    lines: [
      {
        id: 'route',
        status: 'pass',
        text: "CG Bridge's route to 127.0.0.1 leaves through Loopback Pseudo-Interface 1 (127.0.0.1).",
      },
      { id: 'amcp', status: 'fail', text: '127.0.0.1 refused the connection on port 5250.' },
      { id: 'api', status: 'fail', text: '127.0.0.1 answers, but nothing listens on port 8080.' },
      {
        id: 'cors',
        status: 'skip',
        text: 'Sign-in from this console: not checked — the Playout does not answer.',
      },
    ],
    localAddress: '127.0.0.1',
  };
  const textOf = (result: ConnectionCheckResult, id: string): string | undefined =>
    result.lines.find((l) => l.id === id)?.text;

  it('🔴 the owner’s gate: asked as 127.0.0.1, the lines about the Playout and CasparCG name 192.168.21.93', async () => {
    const asked: string[] = [];
    const result = await checkByBridgeName(
      { playoutAddress: 'http://192.168.21.93:8080', origin: 'http://tauri.localhost' },
      '192.168.21.93',
      ITS,
      (request) => {
        asked.push(request.playoutAddress);
        return Promise.resolve(OWNERS_ANSWER);
      },
    );
    // `B-317`'s half is unchanged: CG Bridge is asked by its own name.
    expect(asked).toEqual(['http://127.0.0.1:8080']);
    expect(textOf(result, 'api')).toBe('192.168.21.93 answers, but nothing listens on port 8080.');
    expect(textOf(result, 'amcp')).toBe('192.168.21.93 refused the connection on port 5250.');
    // CG Bridge's own machine keeps CG Bridge's words.
    expect(textOf(result, 'route')).toBe(textOf(OWNERS_ANSWER, 'route'));
    // Only words change: every status — what decides a sign-in — is CG Bridge's.
    expect(result.lines.map((l) => l.status)).toEqual(OWNERS_ANSWER.lines.map((l) => l.status));
    expect(result.localAddress).toBe('127.0.0.1');
  });

  it('a URL in a line names the origin given', () => {
    const result = linesInTheGivenName(
      {
        lines: [
          {
            id: 'api',
            status: 'fail',
            text: 'The Playout answered 404 at http://127.0.0.1:8080/api/cg/auth/jwks.',
          },
        ],
        localAddress: null,
      },
      'http://127.0.0.1:8080',
      'http://192.168.21.93:8080',
    );
    expect(textOf(result, 'api')).toBe(
      'The Playout answered 404 at http://192.168.21.93:8080/api/cg/auth/jwks.',
    );
  });

  it('CONTROL — only the whole name: 127.0.0.10 and 10.127.0.0.1 are other hosts', () => {
    const result = linesInTheGivenName(
      {
        lines: [
          {
            id: 'api',
            status: 'fail',
            text: 'No answer from 127.0.0.10 on port 8080; 10.127.0.0.1 too; and 127.0.0.1.',
          },
        ],
        localAddress: null,
      },
      'http://127.0.0.1:8080',
      '192.168.21.93',
    );
    expect(textOf(result, 'api')).toBe(
      'No answer from 127.0.0.10 on port 8080; 10.127.0.0.1 too; and 192.168.21.93.',
    );
  });

  it('CONTROL — a check asked as given comes back untouched', async () => {
    const answer: ConnectionCheckResult = {
      lines: [
        {
          id: 'api',
          status: 'fail',
          text: '192.168.21.114 answers, but nothing listens on port 8080.',
        },
      ],
      localAddress: null,
    };
    const result = await checkByBridgeName(
      { playoutAddress: 'http://192.168.21.114:8080', origin: 'http://tauri.localhost' },
      '192.168.21.111',
      ITS,
      () => Promise.resolve(answer),
    );
    expect(result).toBe(answer);
  });

  it('the second door renames back too: a check on CG Bridge’s own socket', async () => {
    const { result } = await checkOnItsOwnSocket({
      url: 'ws://192.168.21.93:5280',
      address: '192.168.21.93:5280',
      request: { playoutAddress: 'http://192.168.21.93:8080', origin: 'http://tauri.localhost' },
      createSocket: (url) =>
        new FakeSocket(
          url,
          (channel) =>
            channel === 'bridge.capabilities'
              ? { channels: [], bridgeVersion: '0.11.4', auth: 'playout', signInUrl: ITS }
              : OWNERS_ANSWER,
          true,
        ),
      token: null,
      waitMs: 500,
    });
    expect(textOf(result, 'api')).toBe('192.168.21.93 answers, but nothing listens on port 8080.');
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

describe('B-317 — the address gate asks CG Bridge over a socket (never loopback HTTP from the page)', () => {
  const socketFor =
    (opens: boolean, answer: (channel: string) => unknown) =>
    (url: string): FakeSocket =>
      new FakeSocket(url, answer, opens);
  it('CG Bridge answers its capabilities → null; nothing opens, or something that is not CG Bridge → the sentence naming where', async () => {
    expect(
      await bridgeAnswersAt(
        'ws://10.0.0.5:5280',
        '10.0.0.5:5280',
        socketFor(true, bridgeThatAnswers(null)),
        200,
      ),
    ).toBeNull();
    expect(
      await bridgeAnswersAt(
        'ws://10.0.0.5:5280',
        '10.0.0.5:5280',
        socketFor(false, () => null),
        30,
      ),
    ).toBe('CG Bridge is not answering at 10.0.0.5:5280.');
    // A socket that opens and answers something else: not CG Bridge.
    expect(
      await bridgeAnswersAt(
        'ws://10.0.0.5:5280',
        '10.0.0.5:5280',
        socketFor(true, () => ({ hello: 'nginx' })),
        200,
      ),
    ).toBe('CG Bridge is not answering at 10.0.0.5:5280.');
  });

  it('a record that names no Playout is refused before anything is dialled', async () => {
    expect(await stationBridgeAnswers({ playoutAddress: 'http://' })).toBe(
      'That is not a Playout address.',
    );
  });
});

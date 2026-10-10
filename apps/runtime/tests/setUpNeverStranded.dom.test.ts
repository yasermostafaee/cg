// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalisePlayoutAddress } from '@cg/shared-ipc';
import { FirstRunScreen } from '../src/renderer/features/firstRun/FirstRunScreen.js';
import { bridgeAddressFor } from '../src/platform/bridgeUrl.js';
import { BridgeNotAnsweringError } from '../src/platform/checkAt.js';
import type { AuthSessionState, SetupCheckAnswer } from '../src/shared/runtime-bridge.js';
import { authStub, fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `B-317` (`RELEASE-0114-01` A3/A4) — **SET UP NEVER STRANDS THE OPERATOR, AND NAMES THE CG BRIDGE
 * THE CHECK REALLY RAN ON.** The owner's `0.11.3`: with no CG Bridge answering, Set up said `Bridge
 * disconnected — command rejected. Not sent to CasparCG.` and kept Sign in locked with no reason; with a
 * stale station, it called `.111` "found" for a typed `127.0.0.1`, and Connect then went elsewhere.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const SIGN_IN_URL = 'http://192.168.21.111:8080/api/cg/auth/token';

const answered = (address: string, extra: Partial<SetupCheckAnswer> = {}): SetupCheckAnswer => ({
  lines: [
    { id: 'api', status: 'pass', text: 'The Playout answers and publishes 1 signing key.' },
    { id: 'cors', status: 'pass', text: 'The Playout accepts sign-in from this console.' },
  ],
  localAddress: null,
  bridge: { address, version: '0.11.4', problems: [] },
  ...extra,
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

type Reply = SetupCheckAnswer | Error;

async function mount(opts: {
  phase: 'target' | 'channel';
  reply: Reply;
  /** The CG Bridge this console is connected to now — "last used". */
  lastUsed?: string;
}) {
  let reply = opts.reply;
  const checks = vi.fn((_req: unknown, _where?: { bridgeAddress: string }) =>
    reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply),
  );
  const setPlayoutAddress = vi.fn((_address: string, _bridge?: string) => Promise.resolve('saved'));
  const signedOut: AuthSessionState = { kind: 'signed-out' };
  const stub = fillBridgeStub({
    auth: authStub(signedOut),
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      bridgeAddress: () => opts.lastUsed ?? null,
    },
    setup: {
      ...setupStub(),
      check: checks,
      canSetPlayoutAddress: () => true,
      setPlayoutAddress,
      bridgeAddressFor: (playout: string, bridge: string) => {
        const normal = normalisePlayoutAddress(playout);
        return normal === null ? null : bridgeAddressFor(normal, bridge);
      },
    },
  });
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(FirstRunScreen, {
          phase: opts.phase,
          signInUrl: opts.phase === 'channel' ? SIGN_IN_URL : null,
        }),
      ),
    );
  });
  await flush();
  const el = container;
  const button = (label: RegExp): HTMLButtonElement | undefined =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      label.test(b.textContent ?? ''),
    );
  return {
    el,
    checks,
    setPlayoutAddress,
    setReply: (next: Reply) => {
      reply = next;
    },
    button,
    lineText: (id: string): string | null =>
      el.querySelector(`[data-check="${id}"]`)?.textContent ?? null,
    lineStatus: (id: string): string | null =>
      el.querySelector(`[data-check="${id}"]`)?.getAttribute('data-status') ?? null,
    type: async (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (input === null) throw new Error(`no ${selector}`);
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    press: async (label: RegExp) => {
      const b = button(label);
      if (b === undefined) throw new Error(`no button ${String(label)}`);
      await act(async () => {
        b.click();
      });
      await flush();
    },
  };
}

describe('B-317 — no CG Bridge, then one, then none: never stranded', () => {
  it('🔴 each time the state is said in words, and Check, the fields and Sign in stay usable', async () => {
    const h = await mount({
      phase: 'channel',
      reply: new BridgeNotAnsweringError('192.168.21.111:5280'),
      lastUsed: '192.168.21.111:5280',
    });
    // The check on open found nobody: said as its own CG Bridge line — never the command refusal.
    expect(h.lineText('bridge')).toBe('CG Bridge is not answering at 192.168.21.111:5280.');
    expect(h.lineStatus('bridge')).toBe('fail');
    expect(h.el.textContent).not.toMatch(
      /Bridge disconnected|command rejected|Not sent to CasparCG/,
    );
    const usable = (): boolean[] => [
      h.button(/^Check$/)?.disabled === false,
      h.el.querySelector<HTMLInputElement>('#cg-first-run-user')?.disabled === false,
      h.el.querySelector<HTMLInputElement>('#cg-first-run-pass')?.disabled === false,
    ];
    expect(usable()).toEqual([true, true, true]);

    // CG Bridge appears: Check finds it, and its lines stand.
    h.setReply(answered('192.168.21.111:5280'));
    await h.press(/^Check$/);
    expect(h.lineText('bridge')).toBe('CG Bridge found at 192.168.21.111:5280.');
    expect(h.lineStatus('api')).toBe('pass');
    expect(usable()).toEqual([true, true, true]);

    // …and disappears: said again, and still nothing is locked.
    h.setReply(new BridgeNotAnsweringError('192.168.21.111:5280'));
    await h.press(/^Check$/);
    expect(h.lineText('bridge')).toBe('CG Bridge is not answering at 192.168.21.111:5280.');
    expect(h.lineStatus('api')).toBeNull();
    expect(usable()).toEqual([true, true, true]);
  });

  it('CONTROL — a check that SAYS the Playout cannot sign anyone in still locks the form, with its line', async () => {
    const h = await mount({
      phase: 'channel',
      reply: answered('192.168.21.111:5280', {
        lines: [
          { id: 'api', status: 'fail', text: 'No answer from 192.168.21.111 on port 8080.' },
          {
            id: 'cors',
            status: 'skip',
            text: 'Sign-in from this console: not checked — the Playout does not answer.',
          },
        ],
      }),
    });
    expect(h.el.querySelector<HTMLInputElement>('#cg-first-run-user')?.disabled).toBe(true);
  });
});

/*
  ⚠ REWRITTEN by `SERVERS-SIMPLIFY-01` (T1). These pinned that `Connect` was ABSENT until a check had found CG
  Bridge at the fields' own address. The owner's rule now is one commit, offered the moment a field changed, that
  runs the check itself — so what `B-317` protects is asserted where it actually lives: NOTHING IS SAVED unless
  CG Bridge answered at the address the fields resolve to. The rule is unchanged; only the button's visibility is.
*/
describe('B-317 — one address: Connect saves only where CG Bridge answered; the last used one is a choice', () => {
  it('🔴 a stale .111 and a typed 127.0.0.1: Connect checks 127.0.0.1 and saves nothing there; .111 is OFFERED — never a line', async () => {
    const h = await mount({
      phase: 'target',
      reply: new BridgeNotAnsweringError('127.0.0.1:5280'),
      lastUsed: '192.168.21.111:5280',
    });
    await h.type('#cg-playout-address', '127.0.0.1');
    // The choice is offered, by its host, outside the check's lines.
    const offer = h.button(/^Use 192\.168\.21\.111 \(last used\)$/);
    expect(offer).toBeDefined();
    expect(h.el.querySelector('[aria-label="Connection check"]')?.textContent ?? '').not.toMatch(
      /192\.168\.21\.111/,
    );
    // T1 — the one commit is offered as soon as the fields say something, beside the fact that it is not done.
    expect(h.button(/^Connect$/)).toBeDefined();
    expect(h.el.textContent).toContain('Not connected yet');

    // Pressed while nothing answers at 127.0.0.1: the check runs THERE, its line says so, and nothing is saved.
    await h.press(/^Connect$/);
    expect(h.checks.mock.calls.at(-1)?.[1]).toEqual({ bridgeAddress: '' });
    expect(h.lineText('bridge')).toBe('CG Bridge is not answering at 127.0.0.1:5280.');
    expect(h.setPlayoutAddress).not.toHaveBeenCalled();

    // Choosing the last used one fills the CG Bridge field and checks THERE.
    h.setReply(answered('192.168.21.111:5280'));
    await h.press(/^Use 192\.168\.21\.111 \(last used\)$/);
    expect(h.checks.mock.calls.at(-1)?.[1]).toEqual({ bridgeAddress: '192.168.21.111' });
    expect(h.el.querySelector<HTMLInputElement>('#cg-bridge-address')?.value).toBe(
      '192.168.21.111',
    );
    expect(h.lineText('bridge')).toBe('CG Bridge on a separate server: 192.168.21.111:5280.');

    // …and Connect saves exactly the fields, where CG Bridge answered — never the address it remembered.
    await h.press(/^Connect$/);
    expect(h.setPlayoutAddress).toHaveBeenCalledWith('http://127.0.0.1:8080', '192.168.21.111');
  });

  it('an answer from ANOTHER address than the fields resolve to never saves', async () => {
    const h = await mount({ phase: 'target', reply: answered('192.168.21.111:5280') });
    await h.type('#cg-playout-address', '127.0.0.1');
    await h.press(/^Connect$/);
    expect(h.checks).toHaveBeenCalled();
    expect(h.setPlayoutAddress).not.toHaveBeenCalled();
  });

  it('CONTROL — CG Bridge answering at the fields’ own address: Connect saves, and the card reads as a fact again', async () => {
    const h = await mount({ phase: 'target', reply: answered('127.0.0.1:5280') });
    await h.type('#cg-playout-address', '127.0.0.1');
    await h.press(/^Connect$/);
    expect(h.setPlayoutAddress).toHaveBeenCalledWith('http://127.0.0.1:8080', '');
    expect(h.el.querySelector('#cg-playout-address')).toBeNull();
  });

  it('R-090 — a port CG Bridge cannot open is said naming CG Bridge’s host', async () => {
    const h = await mount({
      phase: 'target',
      reply: answered('127.0.0.1:5280', {
        bridge: {
          address: '127.0.0.1:5280',
          version: '0.11.4',
          problems: [
            {
              code: 'port-refused',
              message: 'cannot open UDP 6251 (OSC from CasparCG): held by casparcg.exe (PID 4321).',
            },
          ],
        },
      }),
    });
    await h.type('#cg-playout-address', '127.0.0.1');
    await h.press(/^Check$/);
    expect(h.lineText('bridge-ports')).toBe(
      'CG Bridge on 127.0.0.1 cannot open UDP 6251 (OSC from CasparCG): held by casparcg.exe (PID 4321).',
    );
    expect(h.lineStatus('bridge-ports')).toBe('fail');
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { PgmTopology } from '@cg/shared-ipc';
import type { AuthSessionState, BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import { useProgramTopology } from '../src/renderer/hooks/useProgramTopology.js';
import { signedInStub } from './support/authStub.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('programme topology resource scope', () => {
  it('preserves a current topology during same-scope token updates and clears on changed grants', async () => {
    const previous = window.cg;
    const signedIn = signedInStub('Operator', [1, 2]);
    if (signedIn.kind !== 'signed-in') throw new Error('Expected a signed-in fixture');
    let auth: AuthSessionState = signedIn;
    let publishAuth: (state: AuthSessionState) => void = () => undefined;
    let publishConfig: () => void = () => undefined;
    const readTopology = vi.fn(() =>
      Promise.resolve<PgmTopology>({
        channel: 1,
        members: [{ engine: 'A', name: 'Main', physicalChannel: 1, resourceKey: 'active' }],
        active: 'A',
      }),
    );
    (window as unknown as { cg: unknown }).cg = {
      link: { status: () => 'live', onStatusChanged: () => () => undefined },
      auth: {
        state: () => auth,
        onStateChanged(handler: typeof publishAuth) {
          publishAuth = handler;
          return () => undefined;
        },
      },
      connections: {
        onConfigChanged(handler: typeof publishConfig) {
          publishConfig = handler;
          return () => undefined;
        },
      },
      pgmReturn: { topology: readTopology },
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    function Probe(): JSX.Element {
      const topology = useProgramTopology(1);
      return createElement('span', {}, topology?.members[0]?.resourceKey ?? 'waiting');
    }
    const changeAuth = (next: AuthSessionState) =>
      act(async () => {
        auth = next;
        publishAuth(next);
      });
    try {
      await act(async () => root.render(createElement(Probe)));
      expect(host.textContent).toBe('active');
      readTopology.mockImplementationOnce(() => new Promise(() => undefined));
      await changeAuth({
        ...signedIn,
        principal: { ...signedIn.principal, expiresAt: '2030-02-01T00:00:00.000Z' },
        permittedChannels: [1],
      });
      expect(host.textContent).toBe('active');
      expect(readTopology).toHaveBeenCalledTimes(1);

      await changeAuth({ ...signedIn, permittedChannels: [2] });
      expect(host.textContent).toBe('waiting');
      expect(readTopology).toHaveBeenCalledTimes(2);

      await changeAuth(signedInStub('Second operator', [1]));
      expect(host.textContent).toBe('active');
      expect(readTopology).toHaveBeenCalledTimes(3);
      await act(async () => publishConfig());
      expect(readTopology).toHaveBeenCalledTimes(4);
      await changeAuth({ kind: 'signed-out' });
      expect(host.textContent).toBe('waiting');
      expect(readTopology).toHaveBeenCalledTimes(4);
    } finally {
      await act(async () => root.unmount());
      window.cg = previous;
    }
  });

  it('drops stale topology across channel and bridge-link changes until that scope answers', async () => {
    const pending: { channel: number; reply: (topology: PgmTopology) => void }[] = [];
    let link: BridgeLinkStatus = 'live';
    let publishLink: (status: BridgeLinkStatus) => void = () => undefined;
    (window as unknown as { cg: unknown }).cg = {
      link: {
        status: () => link,
        onStatusChanged(handler: typeof publishLink) {
          publishLink = handler;
          return () => undefined;
        },
      },
      auth: {
        state: () => ({ kind: 'off' }),
        onStateChanged: () => () => undefined,
      },
      pgmReturn: {
        topology: (channel: number) =>
          new Promise<PgmTopology>((reply) => pending.push({ channel, reply })),
      },
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    function Probe({ channel }: { channel: number }): JSX.Element {
      const topology = useProgramTopology(channel);
      return createElement('span', {}, topology?.members[0]?.resourceKey ?? 'waiting');
    }
    const render = (channel: number) =>
      act(async () => root.render(createElement(Probe, { channel })));
    const reply = (index: number, resourceKey: string) =>
      act(async () => {
        const request = pending[index]!;
        request.reply({
          channel: request.channel,
          members: [{ engine: 'A', name: 'Main', physicalChannel: 1, resourceKey }],
          active: 'A',
        });
      });
    const changeLink = (value: BridgeLinkStatus) =>
      act(async () => {
        link = value;
        publishLink(value);
      });

    try {
      await render(1);
      await reply(0, 'first A');
      expect(host.textContent).toBe('first A');

      await render(2);
      await render(1);
      expect(pending.map(({ channel }) => channel)).toEqual([1, 2, 1]);
      expect(host.textContent).toBe('waiting');
      await reply(1, 'late B');
      expect(host.textContent).toBe('waiting');
      await reply(2, 'second A');
      expect(host.textContent).toBe('second A');

      await changeLink('disconnected');
      expect(host.textContent).toBe('waiting');
      await changeLink('live');
      expect(host.textContent).toBe('waiting');
      await reply(3, 'fresh after reconnect');
      expect(host.textContent).toBe('fresh after reconnect');
    } finally {
      await act(async () => root.unmount());
    }
  });
});

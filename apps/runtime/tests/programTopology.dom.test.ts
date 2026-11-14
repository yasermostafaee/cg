// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import type { PgmTopology } from '@cg/shared-ipc';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import { useProgramTopology } from '../src/renderer/hooks/useProgramTopology.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('programme topology resource scope', () => {
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

// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupChannelsState, PgmMeterReading } from '@cg/shared-ipc';
import { NO_AIR } from '../src/renderer/features/channels/channelAir.js';
import { MonitorPanel } from '../src/renderer/features/monitors/MonitorPanel.js';
import { BackupChannelsCard } from '../src/renderer/features/stationSetup/BackupChannelsCard.js';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { usePgmAudio } from '../src/renderer/hooks/usePgmAudio.js';
import type { ProgramReturn } from '../src/renderer/hooks/useProgramReturn.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **WHERE EACH CHANNEL'S LINES GO ON THE BACKUP ENGINE, SAID ON THE
 * THREE SURFACES THAT SAY IT**: the status bar's count, the channel's own PROGRAM pane, and Station setup's
 * `Backup engine` card. Words only. (Where they sit on screen is measured in a browser:
 * `backup-channel-map.spec.ts`.)
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  const r = root;
  root = null;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

const setEntries = vi.fn((_req: { entries: { channel: number; backupChannel: number }[] }) =>
  Promise.resolve({ ok: true }),
);

function stub(link: 'live' | 'disconnected' = 'live', currentPrimary: 'A' | 'B' = 'A'): void {
  installMemoryStorage();
  const health = {
    primary: { label: currentPrimary, state: 'healthy', amcpAxisOk: true },
    backup: { label: currentPrimary === 'A' ? 'B' : 'A', state: 'healthy', amcpAxisOk: true },
    currentPrimary,
    strategy: 'mirror-sync',
  };
  (window as unknown as { cg: unknown }).cg = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: {
      health: () => Promise.resolve(health),
      onHealthChanged: () => () => undefined,
    },
    auth: { state: () => ({ kind: 'off' as const }), onStateChanged: () => () => undefined },
    lock: {
      state: () => Promise.resolve({ engaged: false }),
      onStateChanged: () => () => undefined,
    },
    meters: { onReading: (_h: (r: PgmMeterReading) => void) => () => undefined },
    pgmReturn: { audioUrl: () => Promise.resolve(null) },
    backupChannels: { setEntries },
  };
}

const TWO_OF_TWO: BackupChannelsState = {
  backup: {
    backupHost: '192.0.2.21',
    channels: [
      { channel: 1, state: 'mapped', backupChannel: 2, source: 'playout' },
      { channel: 2, state: 'mapped', backupChannel: 3, source: 'entry', entry: 3 },
    ],
  },
};
const ONE_OF_TWO: BackupChannelsState = {
  backup: {
    backupHost: '192.0.2.21',
    channels: [
      { channel: 1, state: 'mapped', backupChannel: 2, source: 'playout' },
      {
        channel: 2,
        state: 'not-mapped',
        entry: 3,
        entryRefusal: 'Video mode differs: CH 2 is 1080i5000, backup CH 3 is 720p5000.',
        reason: 'Video mode differs: CH 2 is 1080i5000, backup CH 3 is 720p5000.',
      },
    ],
  },
};

describe('R-089 — the status bar: `BACKUP B · n of m channels mapped`', () => {
  const count = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-backup-mapped]');

  it('🔴 all mapped reads plainly; one of two in the warning tone; none in the alarm tone', async () => {
    stub();
    let el = await mount(createElement(StatusBar, { backupChannels: TWO_OF_TWO }));
    expect(count(el)?.textContent).toBe('BACKUP B · 2 of 2 channels mapped');
    expect(count(el)?.getAttribute('data-backup-mapped')).toBe('ok');
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    el = await mount(createElement(StatusBar, { backupChannels: ONE_OF_TWO }));
    expect(count(el)?.textContent).toBe('BACKUP B · 1 of 2 channels mapped');
    expect(count(el)?.getAttribute('data-backup-mapped')).toBe('warn');
  });

  it('CONTROL — no backup state, or the link down: no count', async () => {
    stub();
    expect(count(await mount(createElement(StatusBar, { backupChannels: { backup: null } })))).toBe(
      null,
    );
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    stub('disconnected');
    expect(count(await mount(createElement(StatusBar, { backupChannels: TWO_OF_TWO })))).toBe(null);
  });
});

describe('R-089 — the channel’s own view: its backup line, and the backup engine on air', () => {
  function Pane(props: {
    backupLine: { text: string; title?: string; mapped: boolean } | null;
    onBackupEngine?: boolean;
  }): ReactElement {
    const sound = usePgmAudio(null);
    const programReturn: ProgramReturn = { src: null, signal: 'none', onError: () => undefined };
    return createElement(MonitorPanel, {
      id: 'pgm',
      title: 'PROGRAM (PGM)',
      word: 'PROGRAM',
      channel: 1,
      onAirRows: 0,
      programReturn,
      programSound: sound,
      air: NO_AIR,
      backupLine: props.backupLine,
      onBackupEngine: props.onBackupEngine ?? false,
    });
  }

  it('🔴 the mapped line names the backup’s OWN channel and host; an unmapped one says nothing is sent, its reason on the title', async () => {
    stub();
    let el = await mount(
      createElement(Pane, { backupLine: { text: 'Backup: CH 2 on 192.0.2.21', mapped: true } }),
    );
    const line = () => el.querySelector<HTMLElement>('[data-backup-channel-line]');
    expect(line()?.textContent).toBe('Backup: CH 2 on 192.0.2.21');
    expect(line()?.getAttribute('data-backup-channel-line')).toBe('mapped');
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    el = await mount(
      createElement(Pane, {
        backupLine: {
          text: 'Backup: not mapped — nothing is sent to the backup',
          title: 'The backup engine names no mirror of CH 1.',
          mapped: false,
        },
      }),
    );
    expect(line()?.textContent).toBe('Backup: not mapped — nothing is sent to the backup');
    expect(line()?.getAttribute('title')).toBe('The backup engine names no mirror of CH 1.');
  });

  it('🔴 after a failover the pane says plainly that the return, sound and meter are not available — the toggle and the meter are absent; CONTROL: present on the primary', async () => {
    stub();
    let el = await mount(createElement(Pane, { backupLine: null, onBackupEngine: true }));
    expect(el.querySelector('[data-pgm-screen]')?.textContent).toContain(
      'Not available on the backup engine',
    );
    expect(el.querySelector('[data-pgm-audio]')).toBe(null);
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    el = await mount(createElement(Pane, { backupLine: null }));
    expect(el.querySelector('[data-pgm-screen]')?.textContent).toContain('No return signal');
    expect(el.querySelector('[data-pgm-audio]')).not.toBe(null);
  });
});

describe('R-089 — Station setup → Servers → Backup engine: one line per channel', () => {
  const rows = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLElement>('[data-backup-entry-row]'),
  ];

  it('🔴 each line: `CH N (primary) → CH [M] (backup)` and its state — a refused entry says why beside it', async () => {
    stub();
    const el = await mount(
      createElement(BackupChannelsCard, { state: ONE_OF_TWO, mayChange: true }),
    );
    expect(rows(el).map((r) => r.querySelector('[data-backup-entry-state]')?.textContent)).toEqual([
      'CH 2 in force · from the backup engine',
      'Not mapped · Video mode differs: CH 2 is 1080i5000, backup CH 3 is 720p5000.',
    ]);
    expect(rows(el)[0]?.textContent).toContain('CH 1 (primary) → CH');
    expect(rows(el)[0]?.textContent).toContain('(backup)');
    // The admin's own entry is in its field.
    expect(el.querySelector<HTMLInputElement>('#backup-channel-2')?.value).toBe('3');
  });

  it('🔴 a station admin types M and saves: the bridge is sent the complete entries', async () => {
    stub();
    setEntries.mockClear();
    const el = await mount(
      createElement(BackupChannelsCard, { state: ONE_OF_TWO, mayChange: true }),
    );
    const field = el.querySelector<HTMLInputElement>('#backup-channel-1');
    if (field === null) throw new Error('no field');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(field, '2');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save backup channels'),
    );
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    expect(setEntries).toHaveBeenCalledWith({
      entries: [
        { channel: 1, backupChannel: 2 },
        { channel: 2, backupChannel: 3 },
      ],
    });
  });

  it('CONTROL — anyone else reads the lines: no field, no save', async () => {
    stub();
    const el = await mount(
      createElement(BackupChannelsCard, { state: TWO_OF_TWO, mayChange: false }),
    );
    expect(el.querySelector('input')).toBe(null);
    expect(el.textContent).not.toContain('Save backup channels');
    expect(rows(el)).toHaveLength(2);
  });

  it('no server B: no card', async () => {
    stub();
    const el = await mount(
      createElement(BackupChannelsCard, { state: { backup: null }, mayChange: true }),
    );
    expect(el.querySelector('[data-backup-channels-card]')).toBe(null);
  });
});

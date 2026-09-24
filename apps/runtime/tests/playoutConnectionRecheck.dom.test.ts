// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_CHECK_IDS, type ConnectionCheckResult } from '@cg/shared-ipc';
import { ConnectionCheckList } from '../src/renderer/features/firstRun/ConnectionCheckList.js';
import { PlayoutConnection } from '../src/renderer/features/firstRun/PlayoutConnection.js';
import type { ShownCheckLine } from '../src/renderer/features/firstRun/firstRunStation.js';
import { colors } from '../src/renderer/theme.js';
import { fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `CHECK-RERUN-01` A — **A RE-CHECK STARTS CLEAN, AND ONLY THE LATEST RUN MAY WRITE.**
 *
 * The owner, 2026-09-24, with the Playout off: pressed Check, then again, and while the button read
 * "Checking…" the dialog still showed the last run's ticks and crosses as though they were current.
 * Each absence here has its positive control — the state it clears is shown on screen first, and
 * the reply it waits for does then fill the lines in.
 */

const ORIGIN = 'http://127.0.0.1:8080';

/** The Playout off: its API does not answer, CORS is not checked, AMCP is its own result. */
const PLAYOUT_OFF: ConnectionCheckResult = {
  lines: [
    { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' },
    {
      id: 'route',
      status: 'pass',
      text: 'The route to 127.0.0.1 leaves through Loopback (127.0.0.1).',
    },
    { id: 'amcp', status: 'fail', text: '127.0.0.1 refused the connection on port 5250.' },
    { id: 'api', status: 'fail', text: 'No answer from 127.0.0.1 on port 8080.' },
    {
      id: 'cors',
      status: 'skip',
      text: 'Sign-in from this console: not checked — the Playout does not answer.',
    },
    {
      id: 'ports',
      status: 'pass',
      text: 'Ports 5174, 5280, 7911 and 6250/udp are free for this station.',
    },
    { id: 'topology', status: 'pass', text: 'The Playout and CasparCG run on other machines.' },
  ],
  localAddress: '127.0.0.1',
};

/** The Playout on, signed in and let in: every line passes. */
const PLAYOUT_ON: ConnectionCheckResult = {
  lines: [
    { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' },
    {
      id: 'route',
      status: 'pass',
      text: 'The route to 127.0.0.1 leaves through Loopback (127.0.0.1).',
    },
    { id: 'amcp', status: 'pass', text: 'CasparCG on 127.0.0.1 answered VERSION: 2.3.2.' },
    { id: 'api', status: 'pass', text: 'The Playout answers and publishes 1 signing key.' },
    { id: 'cors', status: 'pass', text: 'The Playout accepts sign-in from this console.' },
    {
      id: 'ports',
      status: 'pass',
      text: 'Ports 5174, 5280, 7911 and 6250/udp are free for this station.',
    },
    { id: 'topology', status: 'pass', text: 'The Playout and CasparCG run on other machines.' },
  ],
  localAddress: '127.0.0.1',
};

interface Reply {
  resolve: (result: ConnectionCheckResult) => void;
  reject: (err: unknown) => void;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let replies: Reply[] = [];

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
  replies = [];
  vi.restoreAllMocks();
});

/** A bridge whose every `setup.check` waits until the spec answers it, by run. */
function stub(): ReturnType<typeof vi.fn> {
  const check = vi.fn(
    () =>
      new Promise<ConnectionCheckResult>((resolve, reject) => {
        replies.push({ resolve, reject });
      }),
  );
  (window as unknown as { cg: unknown }).cg = fillBridgeStub({ setup: { ...setupStub(), check } });
  return check;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function render(
  props: { judgeNow?: boolean; onJudged?: () => void } = {},
): Promise<(next: { judgeNow?: boolean; onJudged?: () => void }) => Promise<void>> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  const draw = async (next: { judgeNow?: boolean; onJudged?: () => void }): Promise<void> => {
    await act(async () => {
      r.render(
        createElement(
          StrictMode,
          null,
          createElement(PlayoutConnection, {
            origin: ORIGIN,
            startEditing: false,
            mayChange: false,
            ...next,
          }),
        ),
      );
    });
    await flush();
  };
  await draw(props);
  return draw;
}

const el = (): HTMLDivElement => {
  if (container === null) throw new Error('not rendered');
  return container;
};

function checkButton(): HTMLButtonElement {
  const found = [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    /^Check/.test(b.textContent ?? ''),
  );
  if (found === undefined) throw new Error('no Check button');
  return found;
}

async function pressCheck(): Promise<void> {
  await act(async () => {
    checkButton().click();
  });
  await flush();
}

async function answer(run: number, result: ConnectionCheckResult): Promise<void> {
  await act(async () => {
    replies[run]?.resolve(result);
  });
  await flush();
}

const shown = (): { id: string | null; status: string | null; text: string | null }[] =>
  [...el().querySelectorAll('[data-check]')].map((li) => ({
    id: li.getAttribute('data-check'),
    status: li.getAttribute('data-status'),
    text: li.textContent,
  }));

const asShown = (result: ConnectionCheckResult): ReturnType<typeof shown> =>
  result.lines.map((l) => ({ id: l.id, status: l.status, text: l.text }));

/** The ✓ and ✗ marks, as lucide draws them. */
const verdictMarks = (): number => el().querySelectorAll('svg.lucide-check, svg.lucide-x').length;

describe('CHECK-RERUN-01 A — a (re-)check starts clean', () => {
  it('a re-check shows NO ✓ or ✗ until its own reply — every line its subject, checking; control: the new reply fills them in', async () => {
    const check = stub();
    await render();
    await pressCheck();
    await answer(0, PLAYOUT_OFF);
    // Positive control: the first run's verdicts ARE on screen — the state a re-check must clear.
    expect(shown()).toEqual(asShown(PLAYOUT_OFF));
    expect(verdictMarks()).toBeGreaterThan(0);

    await pressCheck();
    expect(check).toHaveBeenCalledTimes(2);
    const during = shown();
    expect(during.map((l) => l.id)).toEqual([...CONNECTION_CHECK_IDS]);
    for (const l of during) expect(l.status, l.id ?? '').toBe('checking');
    expect(verdictMarks()).toBe(0);
    // Each line is its subject with no verdict — none of the last run's words survive.
    expect(during.find((l) => l.id === 'amcp')?.text).toBe('CasparCG on 127.0.0.1');
    expect(during.find((l) => l.id === 'api')?.text).toBe('The Playout on port 8080');
    expect(during.find((l) => l.id === 'cors')?.text).toBe('Sign-in from this console');
    for (const l of PLAYOUT_OFF.lines) expect(el().textContent).not.toContain(l.text);
    // As today: the button waits, disabled.
    expect(checkButton().textContent).toBe('Checking…');
    expect(checkButton().disabled).toBe(true);
    expect(el().querySelector('ul[aria-busy="true"]')).not.toBeNull();

    // CONTROL — the new results then appear.
    await answer(1, PLAYOUT_ON);
    expect(shown()).toEqual(asShown(PLAYOUT_ON));
    expect(verdictMarks()).toBe(PLAYOUT_ON.lines.length);
    expect(checkButton().textContent).toBe('Check');
    expect(el().querySelector('ul[aria-busy="true"]')).toBeNull();
  });

  it('a re-check the bridge does not answer leaves no line checking — and none of the last run', async () => {
    stub();
    await render();
    await pressCheck();
    await answer(0, PLAYOUT_OFF);
    expect(shown()).toHaveLength(PLAYOUT_OFF.lines.length);
    await pressCheck();
    await act(async () => {
      replies[1]?.reject(new Error('The bridge did not answer in time.'));
    });
    await flush();
    expect(shown()).toHaveLength(0);
    expect(el().textContent).toContain('The bridge did not answer in time.');
    expect(checkButton().disabled).toBe(false);
  });
});

describe('CHECK-RERUN-01 A — every run is tagged; a late reply never overwrites the current run', () => {
  it('a slow reply from run 1, arriving after run 2 started, does not change run 2’s lines; control: run 2’s own reply does', async () => {
    const check = stub();
    const onJudged = vi.fn();
    const redraw = await render({ judgeNow: false, onJudged });
    await pressCheck(); // run 1 — pressed, and slow
    await redraw({ judgeNow: true, onJudged }); // run 2 — the sign-in's own check
    expect(check).toHaveBeenCalledTimes(2);

    await answer(0, PLAYOUT_OFF); // run 1's reply lands late
    for (const l of shown()) expect(l.status, l.id ?? '').toBe('checking');
    expect(verdictMarks()).toBe(0);
    expect(checkButton().textContent).toBe('Checking…'); // run 2 is still running
    expect(onJudged).not.toHaveBeenCalled(); // nor did run 1 judge anything

    // CONTROL — run 2's own reply does change them, and it is what judges.
    await answer(1, PLAYOUT_ON);
    expect(shown()).toEqual(asShown(PLAYOUT_ON));
    expect(checkButton().textContent).toBe('Check');
    expect(onJudged).toHaveBeenCalledTimes(1);
  });

  it('…and a reply from run 1 landing AFTER run 2’s does not replace run 2’s lines either', async () => {
    stub();
    const redraw = await render({ judgeNow: false });
    await pressCheck();
    await redraw({ judgeNow: true });
    await answer(1, PLAYOUT_ON);
    expect(shown()).toEqual(asShown(PLAYOUT_ON));
    await answer(0, PLAYOUT_OFF);
    expect(shown()).toEqual(asShown(PLAYOUT_ON));
  });
});

describe('CHECK-RERUN-01 C — the neutral and pending states are not red', () => {
  const inkOf = (container: HTMLElement, id: string): string =>
    container.querySelector<HTMLElement>(`[data-check="${id}"] > span`)?.style.color ?? '';

  it('`checking` and `skip` wear the quiet inks; control: `fail` wears the error ink', async () => {
    const lines: ShownCheckLine[] = [
      { id: 'api', status: 'fail', text: 'No answer from 127.0.0.1 on port 8080.' },
      { id: 'cors', status: 'skip', text: 'Sign-in from this console: not checked — …' },
      { id: 'amcp', status: 'checking', text: 'CasparCG on 127.0.0.1' },
    ];
    const probe = document.createElement('span');
    const inkValue = (value: string): string => {
      probe.style.color = value;
      return probe.style.color;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(createElement(ConnectionCheckList, { lines }));
    });
    const c = el();
    // Positive control: the instrument reads the error ink where there IS a failure.
    expect(inkOf(c, 'api')).toBe(inkValue(colors.errorText));
    expect(inkOf(c, 'cors')).toBe(inkValue(colors.textSecondary));
    expect(inkOf(c, 'amcp')).toBe(inkValue(colors.textMuted));
    for (const id of ['cors', 'amcp']) expect(inkOf(c, id)).not.toBe(inkValue(colors.errorText));
    // Their marks: the dashed ring of "not checked", the loader of "checking" — never ✗.
    expect(c.querySelector('[data-check="cors"] svg.lucide-circle-dashed')).not.toBeNull();
    expect(c.querySelector('[data-check="amcp"] svg.lucide-loader-circle')).not.toBeNull();
    expect(c.querySelector('[data-check="cors"] svg.lucide-x')).toBeNull();
  });
});

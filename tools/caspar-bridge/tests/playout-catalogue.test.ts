import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGUE_POLL_MS, PlayoutCatalogue } from '../src/index.js';

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **A DUE READ HAPPENS WHEN IT FALLS DUE, whatever phase a sign-in put
 * it in.**
 *
 * Found by DRIVING the §7 demo, not by a spec: after the fake Playout went offline, the strip kept
 * the catalogue's name for close to a minute. The tick and the (then) 30 s floor had the same
 * period, and the sign-in's immediate read shifted the phase — so the first tick after it landed
 * just under a period after that read, was refused by the floor, and the next read was a whole
 * period later. "At most every period" held; "within a period" did not, for an outage and for a
 * rename alike. What changed is how often a DUE read is looked for.
 *
 * ⭐ `UI-POLISH-01` G — the floor itself is now 5 s (the Playout agreed, V13 §1.4), and never less.
 */

afterEach(() => {
  vi.useRealTimers();
});

function reader(): { catalogue: PlayoutCatalogue; reads: () => number } {
  let reads = 0;
  const fetchImpl = ((): Promise<Response> => {
    reads += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ channels: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  const catalogue = new PlayoutCatalogue('http://playout.invalid/api/cg/channels', () => 'tok', {
    fetchImpl,
    now: () => Date.now(),
  });
  return { catalogue, reads: () => reads };
}

describe('the catalogue reads when a read falls due', () => {
  it('the floor is ONE named constant, 5 s — never less (`UI-POLISH-01` G)', () => {
    expect(CATALOGUE_POLL_MS).toBe(5000);
  });

  it('a sign-in read one second after boot is followed by the next read one floor after IT, not two', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    const { catalogue, reads } = reader();
    catalogue.start();

    // A console signs in one second after boot, and its read goes at once.
    await vi.advanceTimersByTimeAsync(1000);
    await catalogue.refresh();
    expect(reads(), 'the sign-in read — the counter moves').toBe(1);

    // Inside the floor: nothing.
    await vi.advanceTimersByTimeAsync(CATALOGUE_POLL_MS - 2000);
    expect(reads(), 'read inside the 5 s floor').toBe(1);

    // Just past it: the next read has gone, on its own, with no one asking.
    await vi.advanceTimersByTimeAsync(3000);
    expect(reads(), 'the due read waited for a whole second period').toBe(2);
    catalogue.dispose();
  });

  it('over a minute of ticks and asks, reads are never closer than 5 s — control: they do happen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    const stamps: number[] = [];
    const fetchImpl = ((): Promise<Response> => {
      stamps.push(Date.now());
      return Promise.resolve(new Response(JSON.stringify({ channels: [] }), { status: 200 }));
    }) as typeof fetch;
    const catalogue = new PlayoutCatalogue('http://playout.invalid/api/cg/channels', () => 'tok', {
      fetchImpl,
      now: () => Date.now(),
    });
    catalogue.start();
    // An on-demand ask every 700 ms on top of the tick — the most eager a console could be.
    for (let t = 0; t < 60_000; t += 700) {
      void catalogue.refresh();
      await vi.advanceTimersByTimeAsync(700);
    }
    catalogue.dispose();
    expect(stamps.length, 'CONTROL — the reader read at all').toBeGreaterThanOrEqual(10);
    const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(CATALOGUE_POLL_MS);
  });
});

/*
  🔴 `UI-POLISH-01` G — D4's `output` and `playlist` are parsed LENIENTLY: a value the bridge does
  not know is dropped, and the row — its NAME — survives. A strict parse would void the whole
  catalogue on one new Playout word and blank every channel's label.
*/
describe('output and playlist are read leniently', () => {
  async function readRows(body: unknown): Promise<ReturnType<PlayoutCatalogue['rows']>> {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as typeof fetch;
    const catalogue = new PlayoutCatalogue('http://playout.invalid/api/cg/channels', () => 'tok', {
      fetchImpl,
    });
    await catalogue.refresh();
    return catalogue.rows();
  }
  const row = { id: 'a', name: 'آپاسای', casparHost: '10.0.0.1', casparChannel: 1 };

  it('the known values are kept', async () => {
    expect(
      await readRows({ channels: [{ ...row, output: 'on-air', playlist: 'stopped' }] }),
    ).toEqual([{ ...row, output: 'on-air', playlist: 'stopped' }]);
  });

  it('an output we do not know, or of the wrong type, is dropped — the row and its name survive', async () => {
    const rows = await readRows({
      channels: [
        { ...row, output: 'standby', playlist: 'rehearsal' },
        { ...row, casparChannel: 2, output: 42, playlist: 7 },
      ],
    });
    expect(
      rows?.map((r) => r.name),
      'CONTROL — both rows were kept',
    ).toEqual([row.name, row.name]);
    expect(rows?.[0]?.output).toBeUndefined();
    // A playlist word we do not know is KEPT: the console shows it as its own word.
    expect(rows?.[0]?.playlist).toBe('rehearsal');
    expect(rows?.[1]?.output).toBeUndefined();
    expect(rows?.[1]?.playlist).toBeUndefined();
  });

  it('a pre-2.8.58 row, with neither field, is read exactly as before', async () => {
    expect(await readRows({ channels: [row] })).toEqual([row]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGUE_POLL_MS, PlayoutCatalogue } from '../src/index.js';

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **A DUE READ HAPPENS WHEN IT FALLS DUE, whatever phase a sign-in put
 * it in.**
 *
 * Found by DRIVING the §7 demo, not by a spec: after the fake Playout went offline, the strip kept
 * the catalogue's name for close to a minute. The tick and the 30 s floor had the same period,
 * and the sign-in's immediate read shifted the phase — so the first tick after it landed 29 s
 * after that read, was refused by the floor, and the next read was a whole period later. "At most
 * every 30 s" held; "within 30 s" did not, for an outage and for a rename alike.
 *
 * The floor stays the contract's 30 s. What changed is how often a DUE read is looked for.
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
  it('a sign-in read one second after boot is followed by the next read 30 s after IT, not 60', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    const { catalogue, reads } = reader();
    catalogue.start();

    // A console signs in one second after boot, and its read goes at once.
    await vi.advanceTimersByTimeAsync(1000);
    await catalogue.refresh();
    expect(reads(), 'the sign-in read — the counter moves').toBe(1);

    // Inside the floor: nothing.
    await vi.advanceTimersByTimeAsync(CATALOGUE_POLL_MS - 2000);
    expect(reads(), 'read inside the 30 s floor').toBe(1);

    // Just past it: the next read has gone, on its own, with no one asking.
    await vi.advanceTimersByTimeAsync(3000);
    expect(reads(), 'the due read waited for a whole second period').toBe(2);
    catalogue.dispose();
  });
});

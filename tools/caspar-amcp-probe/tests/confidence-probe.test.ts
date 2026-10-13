import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpClient } from '../src/amcp-client.js';
import {
  discoverGrabVerbs,
  oscDelta,
  runConfidenceProbe,
  summarise,
  type ChannelSnapshot,
} from '../src/confidence-probe.js';

/**
 * 🔴 **SESSION BN — THE PROPERTY THAT MATTERS MOST IS THAT IT REFUSES TO GUESS.**
 *
 * This kit exists to be pasted at a live plant. BN's stop rule is explicit: _"Guessing an
 * AMCP verb into a runbook the owner will paste at a live plant is the worst available
 * outcome."_ So the behaviour worth a test is not "it grabs a frame" — no mock can show
 * that — it is what happens when the server names NO grab verb, which is exactly the
 * situation an unknown build presents.
 *
 * The mock is a server that supports `VERSION` and `INFO` and has never heard of `HELP`
 * or any grab command. That makes it a faithful stand-in for the one case the discipline
 * is about, and the assertions below pin all three halves of it: nothing is attempted,
 * a FINDING is produced, and the finding says so in words a plant reader can act on.
 *
 * ⚠ What this canNOT show: any real timing, any real drop counter, or whether a grab
 * hitches a channel. Those are plant measurements and the runbook says so at the top.
 */

let mock: MockHandle | null = null;

afterEach(async () => {
  await mock?.stop();
  mock = null;
});

it('🔴 §3.1 — a server that names no grab verb produces a FINDING, and NOTHING is attempted', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0 });
  const client = new AmcpClient();
  await client.connect('127.0.0.1', mock.amcpPort);
  try {
    const discovery = await discoverGrabVerbs(client, 1, 120);

    // It asked, and it recorded the answer verbatim rather than interpreting it.
    expect(discovery.version.command).toBe('VERSION');
    expect(discovery.version.reply.join(' ')).toContain('2.3.2');

    // 🔴 THE ASSERTION. No candidate was named, so no command was invented.
    expect(discovery.candidates, 'the mock enumerates no grab verb').toEqual([]);
    expect(discovery.attempts, 'and therefore nothing was tried').toEqual([]);
    expect(discovery.accepted).toBeNull();

    // …and the outcome is reported as a RESULT, not swallowed as an empty success.
    expect(discovery.finding).not.toBeNull();
    expect(discovery.finding).toContain('§3.1');
    expect(discovery.finding).toContain('Nothing was guessed');
  } finally {
    await client.close();
  }
});

it('the whole run degrades honestly with no verb: the timing phases SKIP and say why', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0 });
  const result = await runConfidenceProbe({
    casparHost: '127.0.0.1',
    casparPort: mock.amcpPort,
    // Port 0 lets the OS pick, so the passive watch binds without colliding with a
    // concurrently-running suite. No OSC arrives, which is itself a supported case.
    oscPort: 0,
    channel: 1,
    probeChannel: null,
    probeLayer: 90,
    routeFromLayer: null,
    inputArg: null,
    loadTemplateUrl: null,
    loadLayer: 91,
    cadenceHz: 1,
    cadenceMs: 0,
    restGrabs: 1,
    mediaRoots: [],
    replyWaitMs: 80,
    outPath: null,
  });

  expect(result.discovery.accepted).toBeNull();
  expect(result.singleGrabAtRest, 'nothing to time').toEqual([]);
  expect(result.cadence, 'and no cadence run').toBeNull();
  // The §3.1 finding PROPAGATES rather than each phase failing silently.
  expect(result.findings.join('\n')).toContain('SKIPPED (§3.2, §3.3)');
  // A summary is still produced — an operator needs the verbatim HELP output even, and
  // especially, when the answer is "this build has no grab command".
  expect(summarise(result)).toContain('ACCEPTED: NONE');
});

it('🔴 §3.4 REFUSES to run on the channel it is measuring — the stop rule, as code', async () => {
  /*
    BN §8: _"If measuring 3.4 would require putting something on the program channel →
    stop and ask."_ Both §3.4 paths PLAY a producer. Written as prose that would be a rule
    somebody has to remember at 20:59; written here it is a branch that cannot be forgotten.
  */
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0 });
  const sameChannel = await runConfidenceProbe({
    casparHost: '127.0.0.1',
    casparPort: mock.amcpPort,
    oscPort: 0,
    channel: 1,
    probeChannel: 1, // ← the channel being measured
    probeLayer: 90,
    routeFromLayer: 10,
    inputArg: 'route://1-10',
    loadTemplateUrl: null,
    loadLayer: 91,
    cadenceHz: 1,
    cadenceMs: 0,
    restGrabs: 1,
    mediaRoots: [],
    replyWaitMs: 80,
    outPath: null,
  });

  expect(sameChannel.generalisation.ran).toBe(false);
  expect(sameChannel.generalisation.skippedBecause).toContain('is the channel being measured');
  // 🔴 And it sent nothing: no PLAY, no CLEAR, on the channel that may be on air.
  expect(sameChannel.generalisation.routePath).toEqual([]);
  expect(sameChannel.generalisation.secondOpenPath).toEqual([]);
});

it('§3.4 is skipped, not silently run, when no probe channel is named at all', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0 });
  const result = await runConfidenceProbe({
    casparHost: '127.0.0.1',
    casparPort: mock.amcpPort,
    oscPort: 0,
    channel: 1,
    probeChannel: null,
    probeLayer: 90,
    routeFromLayer: 10,
    inputArg: 'DECKLINK 1',
    loadTemplateUrl: null,
    loadLayer: 91,
    cadenceHz: 1,
    cadenceMs: 0,
    restGrabs: 1,
    mediaRoots: [],
    replyWaitMs: 80,
    outPath: null,
  });
  expect(result.generalisation.ran).toBe(false);
  expect(result.generalisation.skippedBecause).toContain('no --probe-channel');
  expect(result.findings.join('\n')).toContain('SKIPPED (§3.4)');
});

it('oscDelta reports only addresses whose value CHANGED — the drop counter, if there is one', () => {
  /*
    The kit does not know what a dropped-frame counter is called on any build, so it
    captures every address and diffs. This pins the diff itself: an address that appeared
    for the first time is NOT a change (there is nothing to compare it to), while one that
    moved is exactly what a plant reader is looking for.
  */
  const snap = (osc: Record<string, string>): ChannelSnapshot =>
    ({
      atMs: 0,
      info: { sentAtMs: 0, command: 'INFO 1', reply: [], code: 0, latencyMs: 0 },
      osc,
    }) satisfies ChannelSnapshot;

  const delta = oscDelta(
    snap({ '/channel/1/framerate': '50', '/channel/1/dropped': '0' }),
    snap({ '/channel/1/framerate': '50', '/channel/1/dropped': '3', '/channel/1/new': '1' }),
  );
  expect(delta).toEqual([{ address: '/channel/1/dropped', before: '0', after: '3' }]);
  expect(oscDelta(null, snap({}))).toEqual([]);
});

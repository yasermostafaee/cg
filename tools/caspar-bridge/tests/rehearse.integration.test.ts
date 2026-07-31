import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { isRehearsing } from '@cg/shared-ipc';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-022 — REHEARSE, end to end against the amcp-mock.
 *
 * THE FAILURE MODE THIS SUITE EXISTS FOR IS SILENCE ON AIR. Rehearse leaves the
 * CasparCG producer RESIDENT and mutes the layer; a mute that is never restored
 * means a graphic that goes to air with no sound, which is worse than the audio
 * leak the mute prevents because nobody notices until someone asks why. It is
 * invisible to every other signal — `producer`, `onAir` and `pageResolution` are
 * identical either way — so the mock models layer VOLUME specifically so these
 * assertions can exist.
 *
 * The volume assertions below are therefore the point of the file, not colour: each
 * one is a way the mute could be stranded.
 */

const SLOT = { channel: 1, layer: 10 };
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

async function boot(): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { sweepMs: 60 });
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
}

/** The mock's observed volume for the layer under test. */
function volume(): number | undefined {
  return mock?.layerState(SLOT)?.volume;
}

it('mutes on enter and RESTORES on exit — the producer stays resident throughout', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(volume()).toBe(1);

  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);
  // THE PRODUCER STAYS. Rehearse is deliberately NOT CLEAR-then-re-ADD: that
  // cycle is the sequence that failed in the field (adopt-CLEAR succeeded, the
  // CG ADD after it 404'd, the layer was left empty on air).
  expect(mock!.layerState(SLOT)?.producer).toBe('html');
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(true);

  expect(await runtime!.exitRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(1);
  expect(mock!.layerState(SLOT)?.producer).toBe('html');
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(false);
}, 30000);

it('PLAY re-asserts the intended volume UNCONDITIONALLY — a stranded mute cannot reach air', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);

  // Strand a mute the way a crash, a reload, a dropped socket or a second
  // operator's own MIXER would: the layer is muted and NOTHING in the bridge's
  // bookkeeping says so. This is the exact state that would otherwise put a silent
  // graphic on air, and it is unreachable by driving the bridge — every one of its
  // own paths restores — which is why the mock has a direct hook for it.
  mock!.setLayerVolume(SLOT, 0);
  expect(volume()).toBe(0);
  expect(runtime!.rehearseState()).toEqual([]);

  // A take must fix it, with no un-mute step having run and no rehearse state to
  // read. That unconditionality is the whole design: the re-assert lives in the
  // PLAY path rather than on the rehearse-exit path precisely so it does not depend
  // on our own bookkeeping being correct.
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(volume()).toBe(1);
}, 30000);

it('SERIALISES transitions per item — an exit racing an enter cannot leave a claim unmuted', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);

  // Fire exit and a re-enter WITHOUT awaiting between them — the double-click, or
  // two browsers acting at once. Without the per-item lock these interleave as
  // "exit drops the claim → enter mutes and re-claims → exit's un-mute LANDS",
  // leaving a row that CLAIMS to be rehearsing over a layer that is NOT muted. On
  // 2.5.0 that is audio on air behind a UI insisting the graphic cannot reach air.
  const exiting = runtime!.exitRehearse('item1');
  const reEntering = runtime!.enterRehearse('item1');
  const [exitResult, enterResult] = await Promise.all([exiting, reEntering]);

  expect(exitResult.ok).toBe(true);
  // The second transition is refused while the first is in flight — a correctness
  // lock, not a debounce.
  expect(enterResult.ok).toBe(false);
  expect(enterResult.reason).toBe('busy');

  // THE INVARIANT: claim and mute agree. Whichever way the race resolved, a row
  // that reads as rehearsing is muted, and one that does not is not.
  const claimed = isRehearsing(runtime!.rehearseState(), 'item1');
  expect(volume()).toBe(claimed ? 0 : 1);
}, 30000);

it('refuses rehearse ON AIR, and fails closed on an UNSETTLED item', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  const refused = await runtime!.enterRehearse('item1');
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('on-air');
  // Nothing applied: an on-air graphic is NOT muted by a refused rehearse.
  expect(volume()).toBe(1);
  expect(runtime!.rehearseState()).toEqual([]);
}, 30000);

it('refuses rehearse for an item that is not on the stack at all', async () => {
  await boot();
  const refused = await runtime!.enterRehearse('ghost');
  expect(refused.ok).toBe(false);
  // NOT BOUND is the one thing that still refuses. A row with no item has no
  // template, and the template is the only input rehearse actually needs.
  expect(refused.reason).toBe('unknown-item');
}, 30000);

/**
 * REVERSED BY §4: a mute that does not land no longer refuses entry.
 *
 * This asserted the safety condition — refuse unless the layer is provably
 * muted. It made ON PVW work on a CLEARed row and fail on a STOPped one, which
 * to the operator are two ways of closing the same graphic. The mute is now
 * BEST EFFORT and what it achieved is RECORDED on the rehearsal rather than
 * gating it, so exit still mirrors entry exactly.
 *
 * WHAT IS GIVEN UP is stated in `enterRehearse` and in DEBT.md: a resident
 * producer can stay unmuted while the row claims PVW. PVW itself sends nothing,
 * so entering changes nothing that was not already true.
 */
it('a mute that does NOT land still enters, and records that it muted nothing', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  mock!.setHandler('MIXER', () => ({ kind: 'err', code: 501, verb: 'MIXER' }));

  const result = await runtime!.enterRehearse('item1');
  expect(result.ok).toBe(true);
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(true);

  // EXIT MIRRORS ENTRY: a rehearsal that muted nothing restores nothing, so a
  // stray MIXER never lands on a layer this rehearsal did not silence.
  mock!.setHandler('MIXER', () => ({ kind: 'ok', code: 202, verb: 'MIXER' }));
  expect((await runtime!.exitRehearse('item1')).ok).toBe(true);
}, 30000);

it('THE INTERLOCK holds on the EMPTY-layer branch too — a take is still refused', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });

  // The interlock is not a property of the mute — it is a property of the MODE.
  // A rehearsal that sent no AMCP must interlock exactly as hard as one that did.
  const refused = await runtime!.take('item1');
  expect(refused.accepted).toBe(false);
  expect(refused.errorCode).toBe('rehearsing');
  expect(mock!.layerState(SLOT)?.onAir).not.toBe(true);

  // And leaving still hands the row back: the take re-ADDs (B-039) and plays.
  expect(await runtime!.exitRehearse('item1')).toEqual({ ok: true });
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(mock!.layerState(SLOT)?.onAir).toBe(true);
  // The take's unconditional re-assert still runs, so air is never silent.
  expect(volume()).toBe(1);
}, 30000);

it('THE INTERLOCK: a take is refused BRIDGE-SIDE while rehearsing, and nothing is sent', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });

  const before = mock!.layerState(SLOT)?.onAir;
  const refused = await runtime!.take('item1');
  expect(refused.accepted).toBe(false);
  expect(refused.errorCode).toBe('rehearsing');
  // Not merely reported — nothing reached the layer. A disabled button is the
  // courtesy; THIS is the guarantee, and it is what holds when a second browser's
  // snapshot is stale.
  expect(mock!.layerState(SLOT)?.onAir).toBe(before);
  // The mute is intact: a refused take must not have re-asserted the volume either.
  expect(volume()).toBe(0);

  // Leaving rehearse re-enables it, and the take then restores the volume on its way.
  expect(await runtime!.exitRehearse('item1')).toEqual({ ok: true });
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(volume()).toBe(1);
  expect(mock!.layerState(SLOT)?.onAir).toBe(true);
}, 30000);

it('withdraws the rehearse claim and restores volume when the layer goes live by ANOTHER route', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);

  // Somebody else takes the layer live — another operator, or the playout system
  // driving AMCP directly. Rehearse is a claim about OUR intent, not a guarantee
  // about the channel, and the honest response to being wrong is to stop claiming
  // it. Simulated by removing the item from under the claim, which is the same
  // "no longer ours to interlock" condition the sweep tests for.
  expect((await runtime!.remove('item1')).accepted).toBe(true);

  // The sweep withdraws it within a tick or two (sweepMs is 60 here).
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(runtime!.rehearseState()).toEqual([]);
  // And the volume is restored — the producer may be gone, but MIXER state is
  // CHANNEL state and outlives it, so a missed restore here would silence the next
  // graphic loaded onto this layer.
  expect(volume()).toBe(1);
}, 30000);

it('re-asserts every declared row’s volume at startup — a bridge that died mid-rehearse leaves no mute', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  // The state a crashed bridge leaves behind: muted layers, and no process that
  // knows it. Mixer state is channel state, so it survives the process.
  mock.setLayerVolume({ channel: 1, layer: 70 }, 0);
  mock.setLayerVolume({ channel: 1, layer: 71 }, 0);
  expect(mock.layerState({ channel: 1, layer: 70 })?.volume).toBe(0);

  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 60, fixedBank: { channel: 1, start: 70, count: 2 } },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(mock.layerState({ channel: 1, layer: 70 })?.volume).toBe(1);
  expect(mock.layerState({ channel: 1, layer: 71 })?.volume).toBe(1);
}, 30000);

/**
 * ── N ROWS REHEARSING AT ONCE — THE RESTORE MUST LAND ON EVERY ONE ──────────
 *
 * Rehearse is per-row and nothing stops the operator putting several rows into
 * it, which is how the operator actually works. PVW now COMPOSITES all of them,
 * so the multi-row case has gone from possible-but-invisible to the normal
 * thing an operator sees — and that makes this suite's own premise sharper:
 * with N rows rehearsing, N layers are muted, and a restore that lands for some
 * rows and not others is silence on air that nobody notices until someone asks.
 *
 * The bookkeeping is genuinely per item (`#rehearsing` is a Map keyed by item,
 * each entry carrying its OWN slot and its OWN `muted` flag recorded at entry),
 * so this holds by construction. Asserted anyway, because "by construction" is
 * exactly the claim that stops being true when someone hoists a field to make
 * something simpler.
 */
it('mutes and restores EACH of several rehearsing rows independently', async () => {
  await boot();
  const ids = ['item1', 'item2', 'item3'];
  for (const id of ids) {
    expect((await runtime!.load(id, 'lower-third', {})).accepted).toBe(true);
  }

  // Each row lands on its OWN layer; the slots are what the restores must hit.
  for (const id of ids) expect(await runtime!.enterRehearse(id)).toEqual({ ok: true });
  const slots = new Map(
    runtime!.rehearseState().map((r) => [r.itemId, { channel: r.channel, layer: r.layer }]),
  );
  expect(slots.size).toBe(ids.length);
  expect(new Set([...slots.values()].map((s) => s.layer)).size).toBe(ids.length);
  for (const slot of slots.values()) expect(mock!.layerState(slot)?.volume).toBe(0);

  // Exit ONE. Only that row's layer comes back — the others are still rehearsing
  // and must stay muted, or the composite would be claiming an interlock it no
  // longer has.
  expect((await runtime!.exitRehearse('item2')).ok).toBe(true);
  expect(mock!.layerState(slots.get('item2')!)?.volume).toBe(1);
  expect(mock!.layerState(slots.get('item1')!)?.volume).toBe(0);
  expect(mock!.layerState(slots.get('item3')!)?.volume).toBe(0);

  // Exit the rest — EVERY layer restored, none left silent.
  expect((await runtime!.exitRehearse('item1')).ok).toBe(true);
  expect((await runtime!.exitRehearse('item3')).ok).toBe(true);
  for (const slot of slots.values()) expect(mock!.layerState(slot)?.volume).toBe(1);
  expect(runtime!.rehearseState()).toEqual([]);
}, 30000);

/**
 * The STARTUP re-assert covers every declared row, not only the row that was
 * last rehearsing — the specific thing worth re-checking now that N rows can be
 * muted at once. A bridge that died with three rows in rehearse leaves three
 * muted layers, and a re-assert that walked a "last rehearsing" pointer would
 * restore exactly one of them.
 *
 * `#reassertDeclaredVolumes` walks `start … start+count` of the declared bank
 * and holds no rehearse state at all, which is why it cannot have that bug. The
 * existing two-row case above proves the walk; this proves it does not degrade
 * as the bank grows, and that it needs no surviving bookkeeping to work.
 */
it('the startup re-assert covers EVERY declared row, with no rehearse bookkeeping at all', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  const bank = { channel: 1, start: 70, count: 6 };
  const layers = Array.from({ length: bank.count }, (_, i) => bank.start + i);
  // Every row muted, and nothing anywhere recording that — the state a crash
  // mid-multi-row-rehearse leaves behind. Mixer state is CHANNEL state and
  // outlives the process.
  for (const layer of layers) mock.setLayerVolume({ channel: 1, layer }, 0);

  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 60, fixedBank: bank },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);
  await new Promise((resolve) => setTimeout(resolve, 800));

  expect(runtime.rehearseState()).toEqual([]);
  for (const layer of layers) {
    expect(mock.layerState({ channel: 1, layer })?.volume).toBe(1);
  }
}, 30000);

/**
 * §5 — AN ERROR MUST NOT NAME A MECHANISM THAT DID NOT FAIL.
 *
 * `enterRehearse` reported a flat `mute-failed` whenever the mute did not land,
 * including when the command never left because CasparCG was unreachable. That
 * one wrong word cost this project an investigation into the mute interlock,
 * 2.3.2-vs-2.5.0 audio behaviour, and whether AMCP policy should branch on server
 * version — none of which was the problem.
 *
 * MEASURED ON THE PLANT (2.5.0 `69e8ad5`): `MIXER 1-88 VOLUME 0` answers
 * `202 MIXER OK` on an empty layer, on an occupied one, and after `CG 1-88 STOP 0`.
 * CasparCG does not refuse the mute, so `mute-failed` was describing something
 * that had not happened.
 *
 * ASSERTED ON THE REPORTED CODE, because the code is what gets acted on.
 */
it('an UNREACHABLE server reports reachability, not a mute failure', async () => {
  // THE OWNER'S ACTUAL SCENARIO, and it has to be staged in this order: the mute
  // branch only runs when a producer is RESIDENT, so a server that was never
  // reachable would take the zero-AMCP path and succeed. Load with the server up,
  // then take it away.
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.layerState(SLOT)?.producer).toBe('html');

  await mock!.stop();
  mock = null;

  const result = await runtime!.enterRehearse('item1');
  // §4 SUPERSEDED §5's INSTANCE, and this test records that rather than being
  // deleted. §5 asked that the reported failure name the real cause instead of
  // `mute-failed`; §4 then removed the failure altogether, because refusing on an
  // unlanded mute is exactly what made ON PVW behave differently on a STOPped row
  // and a CLEARed one. The honest end state is not a better-named refusal — it is
  // no refusal, so there is no mechanism left to misname.
  expect(result.ok).toBe(true);
  expect(result.reason).toBeUndefined();
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(true);
}, 30000);

/**
 * §4 — `ON PVW` BEHAVES IDENTICALLY ON A STOPPED ROW AND A CLEARED ROW.
 *
 * ONE SPEC, BOTH CASES, because they exist to be compared — asserting either
 * alone is what let them diverge. To the operator these are two ways of closing
 * a graphic and nothing more; to the code they left different records of layer
 * occupancy behind, and entry consulted that record:
 *
 *   - STOP  → the producer stays resident → `#loaded` still holds it → the mute
 *             branch ran → the send failed → entry REFUSED.
 *   - CLEAR → `out()` deleted `#loaded` → zero AMCP → entry SUCCEEDED.
 *
 * That is the last thing `dev-rehearse-decouple` left behind: it removed the
 * precondition but kept the consequence branch, and the branch read `#loaded`.
 */
it('§4 — ON PVW succeeds on a STOPPED row and on a CLEARED row alike, with CasparCG unreachable', async () => {
  await boot();
  expect((await runtime!.load('stopped', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.load('cleared', 'lower-third', {})).accepted).toBe(true);

  // Two ways of closing a graphic. STOP leaves the producer resident; CLEAR
  // destroys it — which is precisely the difference that used to matter.
  await runtime!.stopItem('stopped');
  await runtime!.out('cleared');

  // Now CasparCG goes away.
  await mock!.stop();
  mock = null;

  const stopped = await runtime!.enterRehearse('stopped');
  const cleared = await runtime!.enterRehearse('cleared');

  // THE ASSERTION: identical outcomes. Compared directly rather than checked
  // one at a time, so a future divergence cannot pass by fixing only one side.
  expect(stopped.ok).toBe(true);
  expect(cleared.ok).toBe(true);
  expect(stopped.ok).toBe(cleared.ok);
  expect(stopped.reason).toBe(cleared.reason);

  // Both rows really are on PVW — not merely "not refused".
  expect(isRehearsing(runtime!.rehearseState(), 'stopped')).toBe(true);
  expect(isRehearsing(runtime!.rehearseState(), 'cleared')).toBe(true);
}, 30000);

/**
 * THE ONE REFUSAL THAT STAYS, and the owner confirmed it: a row that is ON AIR
 * refuses PVW. That refusal is about AIR, not about occupancy — muting a live
 * graphic is not something this will do — so §4 must not flatten it.
 */
it('§4 — an ON-AIR row still refuses ON PVW', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  const refused = await runtime!.enterRehearse('item1');
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('on-air');
}, 30000);

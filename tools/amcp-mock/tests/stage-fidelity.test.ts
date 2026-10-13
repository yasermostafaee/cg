import * as net from 'node:net';
import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import type { MockHandle } from '../src/types.js';
import { parsePacket, flatten } from '../../spikes/osc-capture/osc.mjs';

/**
 * 🔴 `RELEASE-091-01` (DELTA B, B2) — **THE MOCK BEHAVES LIKE CASPARCG 2.5 ABOUT A CLEARED LAYER.**
 *
 * The core erases a cleared layer from its stage (`stage.cpp` `clear`), so its OSC stops and `INFO`
 * no longer lists it — it is never reported `empty`. A STOPPED layer still exists and reports
 * `empty` (`layer.cpp` `stop`). `INFO <ch>-<L>` answers the whole channel (`info_channel_command`
 * ignores the layer), each live layer as `<stage><layer><layer_N>`, and an empty channel has no
 * `<stage>` at all (plant captures `b3-info-2-80-on-air`, `b5-teardown-info`). The mock reported every
 * layer it had ever touched, `empty` included, and answered `INFO 1-60` with 404.
 */

let mock: MockHandle | undefined;
afterEach(async () => {
  await mock?.stop();
  mock = undefined;
});

async function send(port: number, lines: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    let buf = '';
    sock.setEncoding('utf-8');
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('connect', () => {
      sock.write(lines.map((l) => `${l}\r\n`).join(''));
      setTimeout(() => sock.end(), 150);
    });
    sock.on('end', () => resolve(buf));
    sock.on('error', reject);
  });
}

async function listen(): Promise<{ port: number; heard: { address: string; args: unknown[] }[] }> {
  const heard: { address: string; args: unknown[] }[] = [];
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.on('error', reject);
    sock.on('message', (buf) => {
      const parsed = parsePacket(buf);
      if (!parsed) return;
      for (const m of flatten(parsed)) heard.push({ address: m.address, args: [...m.args] });
    });
    sock.bind(0, '127.0.0.1', () => {
      sock.unref();
      resolve({ port: sock.address().port, heard });
    });
  });
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const LAYER_60 = '/channel/1/stage/layer/60/foreground/producer';

describe('RELEASE-091-01 B2 — a cleared layer, as the core has it', () => {
  it('🔴 CLEAR takes the layer off the stage: its OSC stops and INFO no longer lists it — control: before it, both reported it', async () => {
    const osc = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: osc.port, oscHost: '127.0.0.1', oscHz: 40 });
    await send(mock.amcpPort, ['PLAY 1-60 "clip"']);
    await delay(150);
    expect(osc.heard.some((m) => m.address === LAYER_60 && m.args[0] === 'ffmpeg')).toBe(true);
    const onAir = await send(mock.amcpPort, ['INFO 1-60']);
    expect(onAir.startsWith('201 INFO OK\r\n')).toBe(true);
    expect(onAir).toContain('<layer_60>');
    expect(onAir).toMatch(/<layer_60>[\s\S]*<foreground>[\s\S]*<producer>ffmpeg<\/producer>/);

    await send(mock.amcpPort, ['CLEAR 1-60']);
    await delay(60); // any report already in flight lands first
    const from = osc.heard.length;
    await delay(250); // ten ticks at 40 Hz
    expect(
      osc.heard.slice(from).filter((m) => m.address.startsWith('/channel/1/stage/layer/60/')),
    ).toEqual([]);
    // The channel itself goes on ticking — silence on the layer only.
    expect(osc.heard.slice(from).some((m) => m.address === '/channel/1/framerate')).toBe(true);
    const after = await send(mock.amcpPort, ['INFO 1']);
    expect(after).not.toContain('<stage>');
    // Its mixer state survives, as the core keeps its transforms.
    expect(mock.layerState({ channel: 1, layer: 60 })?.volume).toBe(1);
  });

  it('control: only CLEAR erases — a PAUSED layer stays on the stage, reported and listed', async () => {
    const osc = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: osc.port, oscHost: '127.0.0.1', oscHz: 40 });
    await send(mock.amcpPort, ['PLAY 1-60 "clip"', 'PAUSE 1-60']);
    await delay(60);
    const from = osc.heard.length;
    await delay(200);
    expect(
      osc.heard.slice(from).some((m) => m.address === LAYER_60 && m.args[0] === 'ffmpeg'),
    ).toBe(true);
    const info = await send(mock.amcpPort, ['INFO 1']);
    expect(info).toMatch(
      /<layer_60>[\s\S]*<paused>true<\/paused>[\s\S]*<producer>ffmpeg<\/producer>/,
    );
  });

  /*
    🔴 `DONGLE-RECOVER-01` — the Playout's own license rule sends `CLEAR <channel>` (LICENSE §4), and the
    core's `stage.cpp clear()` erases every layer on it: a STOPPED page goes with the playing ones. The mock
    answered `202` and cleared nothing, so no test could see a resident page wiped from outside.
  */
  it('🔴 CLEAR <channel> erases every layer on it, a stopped CG page included — control: the other channel keeps its layer', async () => {
    const osc = await listen();
    mock = await createMock({
      amcpPort: 0,
      oscPort: osc.port,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: 2,
    });
    await send(mock.amcpPort, [
      'CG 1-59 ADD 0 "http://127.0.0.1:1/page" 0 "{}"',
      'CG 1-59 PLAY 0',
      'CG 1-59 STOP 0',
      'PLAY 1-60 "clip"',
      'PLAY 2-60 "clip"',
    ]);
    await delay(100);
    const before = await send(mock.amcpPort, ['INFO 1']);
    expect(before, 'CONTROL — the stopped page is on the stage').toContain('<layer_59>');
    expect(before).toContain('<layer_60>');

    await send(mock.amcpPort, ['CLEAR 1']);
    await delay(60);
    const from = osc.heard.length;
    await delay(250);
    expect(
      osc.heard.slice(from).filter((m) => /^\/channel\/1\/stage\/layer\/(59|60)\//.test(m.address)),
    ).toEqual([]);
    expect(await send(mock.amcpPort, ['INFO 1'])).not.toContain('<stage>');
    expect(mock.layerState({ channel: 1, layer: 59 })?.producer).toBe('empty');
    // CONTROL — `CLEAR 1` is channel 1's: channel 2's layer is still on the stage.
    expect(await send(mock.amcpPort, ['INFO 2'])).toContain('<layer_60>');
  });

  /*
    🔴 `DONGLE-RECOVER-01` — `CG STOP` / `CG NEXT` / `CG UPDATE` go through `get_expected_cg_proxy`, which
    throws `expected_user_error` on a layer with no CG producer → `403 <CMD> FAILED`; `CG PLAY` does not
    (`get_proxy(...)->play()` on the empty proxy is a no-op → `202`). CasparCG `v2.5.0-stable`,
    `AMCPCommandsImpl.cpp` + `AMCPCommandQueue.cpp`; the owner's `.32` answered exactly these.
  */
  it('🔴 on a layer with no CG producer: CG UPDATE, STOP and NEXT answer 403, CG PLAY answers 202 — control: on a page all four answer 202', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const empty = await send(mock.amcpPort, [
      'CG 1-98 UPDATE 0 "{}"',
      'CG 1-98 STOP 0',
      'CG 1-98 NEXT 0',
      'CG 1-98 PLAY 0',
    ]);
    const codes = (reply: string): string[] =>
      reply
        .split('\r\n')
        .map((l) => /^(\d{3}) /.exec(l)?.[1])
        .filter((c): c is string => c !== undefined);
    expect(codes(empty)).toEqual(['403', '403', '403', '202']);

    const page = await send(mock.amcpPort, [
      'CG 1-97 ADD 0 "http://127.0.0.1:1/page" 0 "{}"',
      'CG 1-97 UPDATE 0 "{}"',
      'CG 1-97 PLAY 0',
      'CG 1-97 NEXT 0',
      'CG 1-97 STOP 0',
    ]);
    expect(codes(page)).toEqual(['202', '202', '202', '202', '202']);
  });

  it('INFO <ch>-<layer> answers the whole channel, exactly as INFO <ch>', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, channels: 2 });
    await send(mock.amcpPort, ['PLAY 1-60 "a"', 'PLAY 1-61 "b"']);
    const one = await send(mock.amcpPort, ['INFO 1-60']);
    const whole = await send(mock.amcpPort, ['INFO 1']);
    expect(one).toBe(whole);
    expect(whole).toContain('<layer_60>');
    expect(whole).toContain('<layer_61>');
    expect(await send(mock.amcpPort, ['INFO 2-60'])).not.toContain('<stage>');
  });
});

/*
  🔴 `B-331` — a 2.5.0 core's `clear_command` QUEUES the erase (`stage->clear(index)` is an
  `executor_.begin_invoke`) and answers `202 CLEAR OK` without waiting, so one more frame reports the
  page after the reply. `clearRepliesBeforeErase` gives the mock that order; it is off by default.
*/
describe('B-331 — CLEAR replies before the erase, as the core does', () => {
  it('🔴 the reply, then ONE frame still reporting the layer, then silence — control: absent, nothing follows the reply', async () => {
    const osc = await listen();
    // No ticks, so every report heard is one the mock chose to send.
    mock = await createMock({
      amcpPort: 0,
      oscPort: osc.port,
      oscHost: '127.0.0.1',
      oscHz: 0,
      clearRepliesBeforeErase: true,
    });
    await send(mock.amcpPort, ['PLAY 1-60 "clip"']);
    const from = osc.heard.length;
    const reply = await send(mock.amcpPort, ['CLEAR 1-60']);
    expect(reply.startsWith('202 ')).toBe(true);
    const late = osc.heard.slice(from).filter((m) => m.address === LAYER_60);
    expect(late).toEqual([{ address: LAYER_60, args: ['ffmpeg'] }]);
    expect(mock.layerState({ channel: 1, layer: 60 })?.producer).toBe('empty');
    expect(await send(mock.amcpPort, ['INFO 1'])).not.toContain('<stage>');

    // CONTROL — without the option the erase is synchronous and no frame follows the reply.
    await mock.stop();
    const quiet = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: quiet.port, oscHost: '127.0.0.1', oscHz: 0 });
    await send(mock.amcpPort, ['PLAY 1-60 "clip"']);
    const at = quiet.heard.length;
    await send(mock.amcpPort, ['CLEAR 1-60']);
    expect(quiet.heard.slice(at).filter((m) => m.address === LAYER_60)).toEqual([]);
  });

  it('a queued erase lands BEFORE the next command, as on the core’s one executor — a PLAY right after the CLEAR survives it', async () => {
    mock = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      clearRepliesBeforeErase: true,
    });
    await send(mock.amcpPort, ['PLAY 1-60 "old"', 'CLEAR 1-60', 'PLAY 1-60 "new"']);
    expect(mock.layerState({ channel: 1, layer: 60 })).toMatchObject({
      producer: 'ffmpeg',
      filePath: 'new',
    });
    expect(await send(mock.amcpPort, ['INFO 1'])).toContain('<layer_60>');
  });
});

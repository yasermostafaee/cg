import { describe, expect, it } from 'vitest';
import {
  judgeConsumers,
  nonStockRunningKinds,
  outputVerdictOf,
  parseDeclaredConsumersFromConfig,
  parseRunningConsumersFromInfo,
  type ChannelOutputCheck,
  type ServerHealth,
} from '../src/index.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` g — **THE PROGRAMME-OUTPUT ALARM WAS FALSE ON THE PLAYOUT'S FORK.**
 *
 * The installed CG Control on channel 1 of `192.168.21.111` put up "PROGRAM OUTPUT MISSING —
 * CHANNEL 1 HAS NO DECKLINK/FFMPEG OUTPUT" while the owner watched the output carry our logo. The
 * bridge logged `running: pgm, ndi`. The fixtures below are that server's own replies, read on
 * 2026-09-22 (`tools/caspar-amcp-probe/evidence/casparcg-2.5.0-6b29237-apasai-core/`,
 * `b5-teardown-info.ndjson` for `INFO 1` and `b2-info-config.ndjson` for `INFO CONFIG`): the
 * `<output>` block and the `<channels>` block are verbatim; the `<stage>` is cut to its first layer
 * because nothing here reads it.
 *
 * The fork lists `pgm` — a consumer stock CasparCG does not ship — and only `pgm` and `ndi`, while
 * its configuration declares a DeckLink and an RTP FFmpeg that its operators state are live. An
 * `INFO` output list from a build like that is not known to be complete, so a declared kind absent
 * from it is UNKNOWN, never MISSING.
 */

const FORK_INFO_1 =
  '<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080i5000</format>\n' +
  '   <framerate>50</framerate>\n   <framerate>1</framerate>\n   <mixer>\n      <audio>\n' +
  '         <limiter>\n            <gr>0</gr>\n         </limiter>\n         <lufs>\n' +
  '            <momentary>-40.828978395343285</momentary>\n' +
  '            <shortterm>-48.127251248955197</shortterm>\n         </lufs>\n' +
  '         <volume>82356125</volume>\n         <volume>82356125</volume>\n' +
  '      </audio>\n   </mixer>\n   <output>\n      <port>\n         <port_540>\n' +
  '            <consumer>pgm</consumer>\n            <pgm>\n               <fps>25</fps>\n' +
  '               <height>360</height>\n               <port>9250</port>\n' +
  '               <quality>85</quality>\n               <width>640</width>\n            </pgm>\n' +
  '         </port_540>\n         <port_900>\n            <consumer>ndi</consumer>\n' +
  '            <ndi>\n               <allow_fields>false</allow_fields>\n' +
  '               <name>APASAI</name>\n            </ndi>\n         </port_900>\n      </port>\n' +
  '   </output>\n   <stage>\n      <layer>\n         <layer_5>\n            <foreground>\n' +
  '               <producer>ffmpeg</producer>\n            </foreground>\n         </layer_5>\n' +
  '      </layer>\n   </stage>\n</channel>\n';

const FORK_INFO_CONFIG =
  '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n   <channels>\n      <channel>\n' +
  '         <video-mode>1080i5000</video-mode>\n         <color-depth>8</color-depth>\n' +
  '         <color-space>bt709</color-space>\n         <consumers>\n            <pgm>\n' +
  '               <port>9250</port>\n               <bind>0.0.0.0</bind>\n' +
  '               <scale-width>640</scale-width>\n               <quality>85</quality>\n' +
  '               <fps>25</fps>\n            </pgm>\n            <decklink>\n' +
  '               <device>1</device>\n               <embedded-audio>true</embedded-audio>\n' +
  '            </decklink>\n            <ffmpeg>\n' +
  '               <path>rtp://239.20.1.1:20000</path>\n' +
  '               <args>-vcodec bitpacked -pix_fmt uyvy422 -f rtp</args>\n            </ffmpeg>\n' +
  '            <ndi>\n               <name>APASAI</name>\n            </ndi>\n' +
  '         </consumers>\n      </channel>\n      <channel>\n' +
  '         <video-mode>1080i5000</video-mode>\n         <color-depth>8</color-depth>\n' +
  '         <color-space>bt709</color-space>\n         <consumers>\n            <pgm>\n' +
  '               <port>9251</port>\n               <bind>0.0.0.0</bind>\n' +
  '               <scale-width>640</scale-width>\n               <quality>85</quality>\n' +
  '               <fps>25</fps>\n            </pgm>\n            <ndi>\n' +
  '               <name>APASAI-CGTEST2</name>\n            </ndi>\n         </consumers>\n' +
  '      </channel>\n   </channels>\n</configuration>\n';

const declaredCh1 = parseDeclaredConsumersFromConfig(FORK_INFO_CONFIG)?.[0]?.consumers ?? [];

const check = (running: ChannelOutputCheck['running']): ChannelOutputCheck => {
  const { missing, unknown } = judgeConsumers(declaredCh1, running);
  return {
    channel: 1,
    declared: declaredCh1,
    running,
    missing,
    ...(unknown.length > 0 ? { unknown } : {}),
    observedAt: '2026-09-23T15:37:00.000Z',
  };
};

const healthy = (outputs: ChannelOutputCheck[]): ServerHealth => ({
  label: 'A',
  state: 'healthy',
  amcpAxisOk: true,
  outputs,
});

describe('DESKTOP-APPS-01-D g — the fork’s channel-1 output check', () => {
  it('reads the fork’s own replies: pgm and ndi running; pgm, decklink, ffmpeg and ndi declared', () => {
    expect(parseRunningConsumersFromInfo(FORK_INFO_1)).toEqual([
      { port: 540, kind: 'pgm' },
      { port: 900, kind: 'ndi' },
    ]);
    expect(declaredCh1.map((d) => d.kind)).toEqual(['pgm', 'decklink', 'ffmpeg', 'ndi']);
    expect(nonStockRunningKinds(parseRunningConsumersFromInfo(FORK_INFO_1) ?? [])).toEqual(['pgm']);
  });

  it('🔴 the DeckLink and the FFmpeg are UNKNOWN, not missing — and no alarm is raised', () => {
    const judged = check(parseRunningConsumersFromInfo(FORK_INFO_1) ?? []);
    expect(judged.missing).toEqual([]);
    expect(judged.unknown).toEqual([
      { kind: 'decklink', declared: 1, running: 0, devices: ['1'] },
      { kind: 'ffmpeg', declared: 1, running: 0, devices: [] },
    ]);
    expect(outputVerdictOf(healthy([judged]))).toEqual({ kind: 'unknown' });
  });

  it('control — the same declaration on a channel whose INFO lists NO consumer still alarms', () => {
    const judged = check(
      parseRunningConsumersFromInfo('<channel><output><port/></output></channel>') ?? [],
    );
    expect(judged.unknown).toBeUndefined();
    expect(judged.missing.map((m) => m.kind)).toEqual(['pgm', 'decklink', 'ffmpeg', 'ndi']);
    expect(outputVerdictOf(healthy([judged])).kind).toBe('missing');
  });

  it('control — a stock list (ndi only) proves absence: the DeckLink is missing and alarms', () => {
    const judged = check([{ port: 900, kind: 'ndi' }]);
    expect(judged.missing.map((m) => m.kind)).toEqual(['pgm', 'decklink', 'ffmpeg']);
    expect(outputVerdictOf(healthy([judged])).kind).toBe('missing');
  });
});

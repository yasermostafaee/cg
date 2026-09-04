import { describe, expect, it } from 'vitest';
import {
  isAirOutputKind,
  missingConsumers,
  outputVerdictOf,
  parseDeclaredConsumersFromConfig,
  parseRunningConsumersFromInfo,
  type ChannelOutputCheck,
  type ServerHealth,
} from '../src/index.js';

/**
 * `C-029` — the program-output alarm's two parsers and its one verdict, pinned against the
 * REAL replies.
 *
 * Both fixtures below are the exact payload chunks CasparCG 2.5.0 `69e8ad5` returned on
 * 2026-09-04 (`192.168.21.114:5250`, the plant, read with a raw socket; status line and the
 * terminal `\r\n` stripped, bare-`\n` interior kept). They are the fixture the session was
 * given: `casparcg.config` still names the replaced card's persistent ID, so the `<decklink>`
 * consumer fails at boot and `INFO 1`'s `<output>` lists only `system-audio` and `screen`.
 * A parser written from the code's own expectation would be green against itself and blind
 * to this — `B-189`'s lesson, applied before the fact.
 */

const PLANT_INFO_1 =
  '<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n' +
  '   <framerate>50</framerate>\n   <framerate>1</framerate>\n   <mixer>\n      <audio>\n' +
  '         <volume>0</volume>\n         <volume>0</volume>\n      </audio>\n   </mixer>\n' +
  '   <output>\n      <port>\n         <port_500>\n            <consumer>system-audio</consumer>\n' +
  '         </port_500>\n         <port_600>\n            <consumer>screen</consumer>\n' +
  '            <screen>\n               <always_on_top>false</always_on_top>\n' +
  '               <index>0</index>\n               <key_only>false</key_only>\n' +
  '               <name>Screen consumer</name>\n            </screen>\n         </port_600>\n' +
  '      </port>\n   </output>\n   <stage>\n      <layer>\n         <layer_96>\n' +
  '            <background>\n               <producer>empty</producer>\n            </background>\n' +
  '            <foreground>\n               <producer>html</producer>\n            </foreground>\n' +
  '         </layer_96>\n      </layer>\n   </stage>\n</channel>\n';

const PLANT_INFO_CONFIG =
  '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n   <paths>\n' +
  '      <media-path>media/</media-path>\n      <log-path disable="false">log/</log-path>\n' +
  '      <data-path>data/</data-path>\n      <template-path>template/</template-path>\n' +
  '   </paths>\n   <lock-clear-phrase>secret</lock-clear-phrase>\n   <html>\n' +
  '      <cache-path>C:\\ProgramData\\casparcg-cef-cache</cache-path>\n   </html>\n' +
  '   <channels>\n      <channel>\n         <video-mode>1080p5000</video-mode>\n' +
  '         <consumers>\n            <decklink>\n               <device>23487013</device>\n' +
  '               <embedded-audio>true</embedded-audio>\n               <keyer>default</keyer>\n' +
  '            </decklink>\n            <screen/>\n            <system-audio/>\n' +
  '         </consumers>\n      </channel>\n   </channels>\n   <controllers>\n      <tcp>\n' +
  '         <port>5250</port>\n         <protocol>AMCP</protocol>\n      </tcp>\n' +
  '   </controllers>\n   <amcp>\n      <media-server>\n         <host>localhost</host>\n' +
  '         <port>8000</port>\n      </media-server>\n   </amcp>\n</configuration>\n';

describe('C-029 — parseRunningConsumersFromInfo', () => {
  it('reads the plant reply verbatim: system-audio at 500 and screen at 600, no decklink', () => {
    expect(parseRunningConsumersFromInfo(PLANT_INFO_1)).toEqual([
      { port: 500, kind: 'system-audio' },
      { port: 600, kind: 'screen' },
    ]);
  });

  it('reads a running DeckLink by its 300 + device port (the earlier dump’s port_23487313)', () => {
    const xml =
      '<channel><output><port><port_23487313><consumer>decklink</consumer></port_23487313>' +
      '<port_600><consumer>screen</consumer></port_600></port></output></channel>';
    expect(parseRunningConsumersFromInfo(xml)).toEqual([
      { port: 600, kind: 'screen' },
      { port: 23487313, kind: 'decklink' },
    ]);
  });

  it('an <output> with no ports is a real, EMPTY answer — the amcp-mock’s old shape', () => {
    expect(
      parseRunningConsumersFromInfo('<channel><output>\n      <port/>\n   </output></channel>'),
    ).toEqual([]);
  });

  it('🔴 no <output> at all is "could not check", never an empty channel', () => {
    expect(
      parseRunningConsumersFromInfo('<channel><format>1080p5000</format></channel>'),
    ).toBeNull();
    expect(parseRunningConsumersFromInfo('')).toBeNull();
  });
});

describe('C-029 — parseDeclaredConsumersFromConfig', () => {
  it('reads the plant config verbatim: decklink 23487013 with embedded audio, screen, system-audio', () => {
    expect(parseDeclaredConsumersFromConfig(PLANT_INFO_CONFIG)).toEqual([
      {
        channel: 1,
        consumers: [
          { kind: 'decklink', device: '23487013', embeddedAudio: true, keyer: 'default' },
          { kind: 'screen' },
          { kind: 'system-audio' },
        ],
      },
    ]);
  });

  it('numbers channels 1-based in file order and reads an empty <consumers> as declaring nothing', () => {
    const xml =
      '<configuration><channels>' +
      '<channel><video-mode>1080p5000</video-mode><consumers><screen/></consumers></channel>' +
      '<channel><video-mode>1080p5000</video-mode><consumers></consumers></channel>' +
      '<channel><video-mode>1080p5000</video-mode></channel>' +
      '</channels></configuration>';
    expect(parseDeclaredConsumersFromConfig(xml)).toEqual([
      { channel: 1, consumers: [{ kind: 'screen' }] },
      { channel: 2, consumers: [] },
      { channel: 3, consumers: [] },
    ]);
  });

  it('carries key-only and the keyer, and ignores a <channel-layout> inside a consumer', () => {
    const xml =
      '<configuration><channels><channel><consumers>' +
      '<decklink><device>2</device><key-only>true</key-only><keyer>external</keyer>' +
      '<channel-layout>stereo</channel-layout></decklink>' +
      '</consumers></channel></channels></configuration>';
    expect(parseDeclaredConsumersFromConfig(xml)).toEqual([
      {
        channel: 1,
        consumers: [{ kind: 'decklink', device: '2', keyOnly: true, keyer: 'external' }],
      },
    ]);
  });

  it('🔴 a reply that is not a configuration — e.g. a channel document answered to INFO CONFIG — is null', () => {
    expect(parseDeclaredConsumersFromConfig(PLANT_INFO_1)).toBeNull();
    expect(parseDeclaredConsumersFromConfig('')).toBeNull();
  });
});

describe('C-029 — missingConsumers', () => {
  const declared = parseDeclaredConsumersFromConfig(PLANT_INFO_CONFIG)?.[0]?.consumers ?? [];
  const running = parseRunningConsumersFromInfo(PLANT_INFO_1) ?? [];

  it('the fixture: the declared decklink is missing, named by its device; the two monitors are not', () => {
    expect(missingConsumers(declared, running)).toEqual([
      { kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] },
    ]);
  });

  it('a running decklink at ANY port satisfies the declaration — index and persistent ID spell one card', () => {
    expect(missingConsumers(declared, [...running, { port: 23487313, kind: 'decklink' }])).toEqual(
      [],
    );
    expect(missingConsumers(declared, [...running, { port: 301, kind: 'decklink' }])).toEqual([]);
  });

  it('counts per kind: two declared, one running is one missing', () => {
    expect(
      missingConsumers(
        [
          { kind: 'decklink', device: '1' },
          { kind: 'decklink', device: '2' },
        ],
        [{ port: 301, kind: 'decklink' }],
      ),
    ).toEqual([{ kind: 'decklink', declared: 2, running: 1, devices: ['1', '2'] }]);
  });

  it('an extra running consumer nobody declared is not a fault', () => {
    expect(missingConsumers([{ kind: 'screen' }], [...running])).toEqual([]);
  });
});

describe('C-029 — outputVerdictOf, the one authority', () => {
  const missingCheck: ChannelOutputCheck = {
    channel: 1,
    declared: [{ kind: 'decklink', device: '23487013' }, { kind: 'screen' }],
    running: [{ port: 600, kind: 'screen' }],
    missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] }],
    observedAt: '2026-09-04T20:00:00.000Z',
  };
  const okCheck: ChannelOutputCheck = {
    ...missingCheck,
    running: [
      { port: 23487313, kind: 'decklink' },
      { port: 600, kind: 'screen' },
    ],
    missing: [],
    observedAt: '2026-09-04T20:01:00.000Z',
  };
  const server = (state: ServerHealth['state'], outputs?: ChannelOutputCheck[]): ServerHealth => ({
    label: 'A',
    state,
    amcpAxisOk: state === 'healthy',
    ...(outputs !== undefined ? { outputs } : {}),
  });

  it('no check yet → unknown, whatever the state', () => {
    expect(outputVerdictOf(server('healthy'))).toEqual({ kind: 'unknown' });
    expect(outputVerdictOf(server('disconnected'))).toEqual({ kind: 'unknown' });
  });

  it('reachable and missing → missing, carrying only the offending channels', () => {
    expect(outputVerdictOf(server('healthy', [okCheck, { ...missingCheck, channel: 2 }]))).toEqual({
      kind: 'missing',
      channels: [{ ...missingCheck, channel: 2 }],
      observedAt: '2026-09-04T20:01:00.000Z',
    });
  });

  it('🔴 degraded is REACHABLE — the alarm fires there exactly as on healthy', () => {
    expect(outputVerdictOf(server('degraded', [missingCheck])).kind).toBe('missing');
  });

  it('reachable and everything declared is running → ok', () => {
    expect(outputVerdictOf(server('healthy', [okCheck]))).toEqual({
      kind: 'ok',
      observedAt: '2026-09-04T20:01:00.000Z',
    });
  });

  it('an unreadable declaration is a gap, not an alarm and not an ok', () => {
    expect(
      outputVerdictOf(server('healthy', [{ ...okCheck, declared: null, missing: [] }])),
    ).toEqual({ kind: 'unknown' });
  });

  it('🔴 unreachable after a missing verdict → UNVERIFIABLE, never silence', () => {
    for (const state of ['disconnected', 'connecting', 'handshaking', 'resyncing'] as const) {
      expect(outputVerdictOf(server(state, [missingCheck]))).toEqual({
        kind: 'unverifiable',
        channels: [missingCheck],
        lastObservedAt: '2026-09-04T20:00:00.000Z',
      });
    }
  });

  it('unreachable after an ok verdict → unknown: the connection surfaces own that fault', () => {
    expect(outputVerdictOf(server('disconnected', [okCheck]))).toEqual({ kind: 'unknown' });
  });
});

describe('C-029 — isAirOutputKind', () => {
  it('names the kinds that leave the machine, and not the monitors', () => {
    expect(isAirOutputKind('decklink')).toBe(true);
    expect(isAirOutputKind('DECKLINK')).toBe(true);
    expect(isAirOutputKind('ndi')).toBe(true);
    expect(isAirOutputKind('screen')).toBe(false);
    expect(isAirOutputKind('system-audio')).toBe(false);
  });
});

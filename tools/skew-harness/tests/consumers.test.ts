import { describe, expect, it } from 'vitest';
import {
  airOutputsOf,
  borrowNotice,
  consumerReport,
  consumerRestorePlan,
  declaredConsumersOf,
  describeConsumerReport,
  runningConsumersOf,
} from '../src/consumers.js';

/**
 * `C-033` — the harness captures a borrowed channel's CONSUMERS, says loudly when one of them
 * goes to air, and puts back what its own `SET MODE` took down. The decisions are pure
 * functions of two `INFO` readings, so they are pinned here without a server.
 */

/** The plant's `INFO 1` `<output>` block on 2026-09-04, once the DeckLink was back. */
const PLANT_INFO = `<?xml version="1.0" encoding="utf-8"?>
<channel>
   <format>1080p5000</format>
   <output>
      <port>
         <port_301>
            <consumer>decklink</consumer>
            <decklink><index>1</index><embedded-audio>true</embedded-audio></decklink>
         </port_301>
         <port_500>
            <consumer>system-audio</consumer>
         </port_500>
         <port_600>
            <consumer>screen</consumer>
         </port_600>
      </port>
   </output>
</channel>`;

const PLANT_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <channels>
    <channel>
      <video-mode>1080p5000</video-mode>
      <consumers>
        <decklink><device>1</device><embedded-audio>true</embedded-audio></decklink>
        <screen/>
        <system-audio/>
      </consumers>
    </channel>
  </channels>
</configuration>`;

const DECKLINK = { port: 301, kind: 'decklink' };
const AUDIO = { port: 500, kind: 'system-audio' };
const SCREEN = { port: 600, kind: 'screen' };

describe('the two readings', () => {
  it('reads the running set through the SAME extraction the bridge alarm uses', () => {
    expect(runningConsumersOf(PLANT_INFO)).toEqual([DECKLINK, AUDIO, SCREEN]);
    expect(runningConsumersOf('<channel><format>1080p5000</format></channel>')).toBeNull();
  });

  it('reads one channel’s declarations, and answers [] for a channel that declares nothing', () => {
    expect(declaredConsumersOf(PLANT_CONFIG, 1)).toEqual([
      { kind: 'decklink', device: '1', embeddedAudio: true },
      { kind: 'screen' },
      { kind: 'system-audio' },
    ]);
    expect(declaredConsumersOf(PLANT_CONFIG, 2)).toEqual([]);
    expect(declaredConsumersOf('<configuration/>', 1)).toBeNull();
  });

  it('knows which consumers carry the channel off the machine', () => {
    expect(airOutputsOf([DECKLINK, AUDIO, SCREEN])).toEqual([DECKLINK]);
  });
});

describe('🔴 the notice — printed BEFORE the first command when a live output is attached', () => {
  it('names the output, every change in order, and what the mode change does to it', () => {
    const notice = borrowNotice({
      channel: 1,
      running: [DECKLINK, AUDIO, SCREEN],
      modeFrom: '1080p5000',
      modeTo: '1080i5000',
      runs: 10,
    });
    expect(notice).not.toBeNull();
    expect(notice).toContain('CHANNEL 1 CARRIES A LIVE OUTPUT — decklink@301');
    expect(notice).toContain('also running: system-audio@500, screen@600');
    expect(notice).toContain('SET 1 MODE 1080i5000 (from 1080p5000)');
    expect(notice).toContain('RE-INITIALISES EVERY consumer');
    expect(notice).toContain('10×');
    expect(notice).toContain('CLEAR 1 at the end');
    expect(notice).toContain('SET 1 MODE 1080p5000 back, then re-ADD');
  });

  it('still speaks when the mode is unchanged — the file consumer and the CLEAR are changes too', () => {
    const notice = borrowNotice({
      channel: 1,
      running: [DECKLINK],
      modeFrom: '1080i5000',
      modeTo: '1080i5000',
      runs: 3,
    });
    expect(notice).not.toBeNull();
    expect(notice).not.toContain('SET 1 MODE');
    expect(notice).toContain('3×');
    expect(notice).toContain('CLEAR 1');
  });

  it('is silent when nothing on the channel goes to air', () => {
    expect(
      borrowNotice({
        channel: 1,
        running: [AUDIO, SCREEN],
        modeFrom: '1080p5000',
        modeTo: '1080i5000',
        runs: 10,
      }),
    ).toBeNull();
  });
});

describe('🔴 the restore plan — only a MEASURED grammar, only for what is GONE', () => {
  it('re-creates a lost DeckLink from its DECLARATION’s own tokens, and a lost screen', () => {
    const plan = consumerRestorePlan({
      channel: 1,
      before: [DECKLINK, AUDIO, SCREEN],
      after: [AUDIO],
      declared: declaredConsumersOf(PLANT_CONFIG, 1),
    });
    expect(plan.missing).toEqual([DECKLINK, SCREEN]);
    expect(plan.adds).toEqual([
      { consumer: DECKLINK, command: 'ADD 1 DECKLINK 1 EMBEDDED_AUDIO' },
      { consumer: SCREEN, command: 'ADD 1 SCREEN' },
    ]);
    expect(plan.unrestorable).toEqual([]);
  });

  it('never ADDs at a running index — a survivor is left exactly alone', () => {
    const plan = consumerRestorePlan({
      channel: 1,
      before: [DECKLINK, AUDIO, SCREEN],
      after: [DECKLINK, AUDIO, SCREEN],
      declared: declaredConsumersOf(PLANT_CONFIG, 1),
    });
    expect(plan).toEqual({ missing: [], adds: [], unrestorable: [] });
  });

  it('declines a DeckLink the config does not declare — no guessed device on a multi-card box', () => {
    const plan = consumerRestorePlan({
      channel: 1,
      before: [DECKLINK],
      after: [],
      declared: [{ kind: 'screen' }],
    });
    expect(plan.adds).toEqual([]);
    expect(plan.unrestorable[0]?.reason).toContain('declares no DeckLink for channel 1');
  });

  it('declines when INFO CONFIG could not be read, and says that is why', () => {
    const plan = consumerRestorePlan({ channel: 1, before: [DECKLINK], after: [], declared: null });
    expect(plan.unrestorable[0]?.reason).toContain('INFO CONFIG could not be read');
  });

  it('declines an unmeasured grammar rather than guessing it', () => {
    const plan = consumerRestorePlan({
      channel: 1,
      before: [AUDIO, { port: 700, kind: 'ndi' }],
      after: [],
      declared: declaredConsumersOf(PLANT_CONFIG, 1),
    });
    expect(plan.adds).toEqual([]);
    expect(plan.unrestorable.map((u) => u.reason)).toEqual([
      expect.stringContaining('"system-audio" is unmeasured'),
      expect.stringContaining('"ndi" is unmeasured'),
    ]);
  });
});

describe('the report — every claim is a READING of the final INFO, never an intent', () => {
  it('marks an ADD verified only when the consumer is running again at its port', () => {
    const report = consumerReport({
      before: [DECKLINK, SCREEN],
      after: [SCREEN],
      attempted: [
        { consumer: DECKLINK, command: 'ADD 1 DECKLINK 1 EMBEDDED_AUDIO', reply: '403 ADD FAILED' },
        { consumer: SCREEN, command: 'ADD 1 SCREEN', reply: '202 ADD OK' },
      ],
      unrestorable: [],
    });
    expect(report.restored.map((r) => r.verified)).toEqual([false, true]);
    expect(report.stillMissing).toEqual([DECKLINK]);
    const text = describeConsumerReport(1, report);
    expect(text).toContain(
      'decklink@301 was gone after the run — sent `ADD 1 DECKLINK 1 EMBEDDED_AUDIO` → 403 ADD FAILED; 🔴 STILL NOT RUNNING',
    );
    expect(text).toContain(
      'screen@600 was gone after the run — sent `ADD 1 SCREEN` → 202 ADD OK; running again',
    );
    expect(text).toContain(
      'CHANNEL 1 IS MISSING decklink@301 THAT IT HAD BEFORE THE RUN — A LIVE OUTPUT IS DOWN',
    );
  });

  it('says so plainly when the channel has everything it had', () => {
    const report = consumerReport({
      before: [DECKLINK, AUDIO, SCREEN],
      after: [DECKLINK, AUDIO, SCREEN],
      attempted: [],
      unrestorable: [],
    });
    expect(report.stillMissing).toEqual([]);
    expect(describeConsumerReport(1, report)).toContain('has every consumer it had before the run');
  });
});

import { describe, expect, it } from 'vitest';
import { amcpCommandFacts, amcpRefusalWords } from '../src/renderer/ui/amcpRefusal.js';
import { errorCodeMessage } from '../src/renderer/ui/errorCodeMessage.js';

/**
 * 🔴 `FIELD-FIXES-01` A — **ONE PLACE TURNS AN AMCP FAILURE INTO THE OPERATOR'S WORDS**, tailored by
 * what the refused command was for. The commands below are spelled exactly as the bridge records
 * them (`TakeRefusal.command`, `summarizeWireLine`): the take-all-or-nothing wire test pins
 * `PLAY 2-60 DECKLINK DEVICE 1` as the plate line the take sends.
 */

const DECKLINK_1 = 'PLAY 2-60 DECKLINK DEVICE 1';

describe('a refused DeckLink play', () => {
  it('🔴 403 gives the DeckLink line — the machine has no such device (a user error)', () => {
    expect(amcpRefusalWords('amcp-403', DECKLINK_1)).toEqual({
      sentence: 'The server has no DeckLink input 1, or it is in use.',
      clause: 'the server has no such input, or it is in use.',
    });
  });

  it('🔴 404 gives the SAME line — a device another producer holds (`B-177`)', () => {
    expect(amcpRefusalWords('amcp-404', DECKLINK_1)).toEqual(
      amcpRefusalWords('amcp-403', DECKLINK_1),
    );
    expect(amcpRefusalWords('amcp-404', 'PLAY 1-61 DECKLINK DEVICE 2')?.sentence).toBe(
      'The server has no DeckLink input 2, or it is in use.',
    );
  });

  it('CONTROL — a 404 on a FILE play gives the file line, not the DeckLink one', () => {
    expect(amcpRefusalWords('amcp-404', 'PLAY 2-60 "studio-loop.mp4" LOOP')).toEqual({
      sentence: 'The server cannot find the file studio-loop.mp4.',
      clause: 'the server cannot find the file studio-loop.mp4.',
    });
  });

  it('a stream play is a file line too (the owner’s clarification), and a route is not', () => {
    expect(amcpRefusalWords('amcp-404', 'PLAY 2-60 "rtmp://feed.local/live"')?.clause).toBe(
      'the server cannot find the file rtmp://feed.local/live.',
    );
    expect(amcpRefusalWords('amcp-404', 'PLAY 2-60 "route://1-2"')?.clause).toBe(
      'the server cannot find what this command names.',
    );
  });
});

describe('the generic lines, one per code', () => {
  it.each([
    [
      'amcp-400',
      'CG 3-59 ADD 0 "http://x/template/a" 0 "…"',
      'the server has no channel 3, or did not understand this command.',
    ],
    ['amcp-400', 'VERSION', 'the server did not understand this command.'],
    ['amcp-401', 'MIXER 3-60 VOLUME 1', 'the server has no channel 3.'],
    ['amcp-402', 'MIXER 2-60 FILL 0 0 1', 'the server refused a setting in this command.'],
    ['amcp-403', 'MIXER 2-60 FILL 0 0 1 1', 'the server refused a setting in this command.'],
    [
      'amcp-404',
      'CG 2-59 ADD 0 "http://x/template/a" 0 "…"',
      'the server could not load the graphic.',
    ],
    ['amcp-404', 'REMOVE 2 SCREEN', 'the server cannot find what this command names.'],
    ['amcp-501', 'CG 2-59 PLAY 0', 'the server failed while running this command.'],
    ['amcp-500', undefined, 'the server failed while running this command.'],
    [
      'amcp-503',
      'CG 2-59 PLAY 0',
      'the server refused this command: another client holds the channel.',
    ],
  ] as const)('%s on `%s`', (code, command, clause) => {
    const words = amcpRefusalWords(code, command);
    expect(words?.clause).toBe(clause);
    expect(words?.sentence).toBe(clause.charAt(0).toUpperCase() + clause.slice(1));
  });

  it('🔴 no line anywhere says "AMCP" or the code — the number is the log’s', () => {
    const commands = [
      DECKLINK_1,
      'PLAY 2-60 "a.mp4"',
      'CG 2-59 ADD 0 "u" 0 "…"',
      'MIXER 2-60 VOLUME 0',
      undefined,
    ];
    for (const code of [400, 401, 402, 403, 404, 500, 501, 502, 503]) {
      for (const command of commands) {
        const words = amcpRefusalWords(`amcp-${String(code)}`, command);
        expect(words, `amcp-${String(code)}`).not.toBeNull();
        for (const text of [words?.sentence ?? '', words?.clause ?? '']) {
          expect(text).not.toMatch(/AMCP/i);
          expect(text).not.toContain(String(code));
        }
      }
    }
  });

  it('CONTROL — a code that is not a server reply is not this mapping’s', () => {
    for (const code of [
      'amcp-timeout',
      'amcp-send-failed',
      'amcp-error',
      'already-on-air',
      undefined,
    ]) {
      expect(amcpRefusalWords(code, DECKLINK_1)).toBeNull();
    }
  });
});

describe('every surface asks the same mapping', () => {
  it('`errorCodeMessage` says a server reply’s generic line — the banner and every verb', () => {
    expect(errorCodeMessage('amcp-403')).toBe('The server refused a setting in this command.');
    expect(errorCodeMessage('amcp-403')).not.toMatch(/AMCP/i);
    // CONTROL — the codes with their own sentences keep them.
    expect(errorCodeMessage('amcp-timeout')).toMatch(/did not answer the command in time/);
  });
});

describe('reading the command', () => {
  it('names what the command was for, and never guesses', () => {
    expect(amcpCommandFacts(DECKLINK_1)).toEqual({
      channel: 2,
      decklink: 1,
      file: null,
      cgAdd: false,
    });
    expect(amcpCommandFacts('PLAY 2-60 DECKLINK 3').decklink).toBe(3);
    expect(amcpCommandFacts('PLAY 2-60 NDI NAME "cam"').file).toBeNull();
    expect(amcpCommandFacts('CG 2-59 ADD 0 "u" 0 "…"').cgAdd).toBe(true);
    expect(amcpCommandFacts('')).toEqual({
      channel: null,
      decklink: null,
      file: null,
      cgAdd: false,
    });
  });
});

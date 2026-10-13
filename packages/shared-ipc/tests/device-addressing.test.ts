import { describe, expect, it } from 'vitest';
import {
  DEVICE_ADDRESSING_RULE,
  DEVICE_NUMBER_RECIPE,
  describeDeviceAddressing,
} from '../src/index.js';

/**
 * `C-030` — the plain-words reading of a `<device>` value, and the two sentences every surface
 * that names one must carry: HOW CasparCG reads the number and WHERE it comes from.
 *
 * The rule is 2.5.0 `69e8ad5`'s own (`decklink/util/util.h` `get_device`): for each card in
 * enumeration order it matches the slot ordinal FIRST and the persistent ID SECOND, through one
 * `int64_t` field the header itself annotates "Either an index, or a persistent id". The number
 * carries no marker, so the words below are a READING for an operator, and the rule sentence
 * travels with them so the reading is never mistaken for something CasparCG enforces.
 */
describe('C-030 — describeDeviceAddressing', () => {
  it('a long number is read as a hardware persistent ID — the plant’s 23487013', () => {
    expect(describeDeviceAddressing('23487013')).toEqual({
      form: 'persistent-id',
      words: 'hardware persistent ID 23487013',
    });
  });

  it('a small number is read as a slot index — what a same-slot swap would keep', () => {
    expect(describeDeviceAddressing('1')).toEqual({ form: 'slot-index', words: 'slot index 1' });
    expect(describeDeviceAddressing('16').form).toBe('slot-index');
  });

  it('anything else is said to be neither, never guessed', () => {
    expect(describeDeviceAddressing('0').form).toBe('unknown');
    expect(describeDeviceAddressing('abc').form).toBe('unknown');
    expect(describeDeviceAddressing('').form).toBe('unknown');
    expect(describeDeviceAddressing('500').form).toBe('unknown');
  });
});

describe('C-030 — the two sentences', () => {
  it('the rule names slot-first, ID-second matching and says the number carries no marker', () => {
    expect(DEVICE_ADDRESSING_RULE).toMatch(/slot position first/);
    expect(DEVICE_ADDRESSING_RULE).toMatch(/persistent ID second/);
    expect(DEVICE_ADDRESSING_RULE).toMatch(/no marker/);
  });

  it('the recipe names the log, the search string, and which bracket is which', () => {
    expect(DEVICE_NUMBER_RECIPE).toMatch(/startup log/);
    expect(DEVICE_NUMBER_RECIPE).toMatch(/Decklink devices found/);
    expect(DEVICE_NUMBER_RECIPE).toMatch(/\[slot\]/);
    expect(DEVICE_NUMBER_RECIPE).toMatch(/\(persistent ID\)/);
    // A search that finds nothing is itself the finding — the server saw no card.
    expect(DEVICE_NUMBER_RECIPE).toMatch(/no such line/i);
  });
});

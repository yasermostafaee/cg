import { describe, expect, it } from 'vitest';
import {
  ValueRuleSetSchema,
  firstMatchingValueRule,
  matchingValueRules,
  valueRuleMatches,
  type ValueRuleSet,
} from '../src/index.js';

const effect = { elementId: 'temperature', property: 'textColor' as const, value: '#ff0000' };

describe('D-139 value rules', () => {
  it('validates one supported effect and rejects non-v1 effects', () => {
    expect(
      ValueRuleSetSchema.parse({
        input: { kind: 'field', fieldId: 'temperature' },
        rules: [{ condition: { comparator: '<=', value: 10 }, effect }],
      }).rules,
    ).toHaveLength(1);
    expect(
      ValueRuleSetSchema.safeParse({
        input: { kind: 'field', fieldId: 'temperature' },
        rules: [
          {
            condition: { comparator: '=', value: 10 },
            effect: { elementId: 'temperature', property: 'opacity', value: 0.5 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('validates inclusive between bounds', () => {
    expect(valueRuleMatches({ comparator: 'between', min: -5, max: 5 }, -5)).toBe(true);
    expect(valueRuleMatches({ comparator: 'between', min: -5, max: 5 }, 5)).toBe(true);
    expect(
      ValueRuleSetSchema.safeParse({
        input: { kind: 'field', fieldId: 'temperature' },
        rules: [{ condition: { comparator: 'between', min: 5, max: -5 }, effect }],
      }).success,
    ).toBe(false);
  });

  it('supports all ordered scalar comparators without cross-type coercion', () => {
    expect(valueRuleMatches({ comparator: '=', value: 'rain' }, 'rain')).toBe(true);
    expect(valueRuleMatches({ comparator: '!=', value: 'rain' }, 'sun')).toBe(true);
    expect(valueRuleMatches({ comparator: '<', value: 0 }, -1)).toBe(true);
    expect(valueRuleMatches({ comparator: '<=', value: 0 }, 0)).toBe(true);
    expect(valueRuleMatches({ comparator: '>', value: 0 }, 1)).toBe(true);
    expect(valueRuleMatches({ comparator: '>=', value: 0 }, 0)).toBe(true);
    expect(valueRuleMatches({ comparator: '=', value: 10 }, '10')).toBe(false);
  });

  it('returns the first authored match', () => {
    const set: ValueRuleSet = {
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        { condition: { comparator: '<=', value: 20 }, effect },
        {
          condition: { comparator: '<=', value: 10 },
          effect: { ...effect, value: '#0000ff' },
        },
      ],
    };
    expect(firstMatchingValueRule(set, 8)?.index).toBe(0);
    expect(firstMatchingValueRule(set, 30)).toBeUndefined();
  });

  it('returns the first matching rule for each target property', () => {
    const set: ValueRuleSet = {
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        { condition: { comparator: '<=', value: 20 }, effect },
        {
          condition: { comparator: '<=', value: 10 },
          effect: { ...effect, value: '#0000ff' },
        },
        {
          condition: { comparator: '<=', value: 10 },
          effect: {
            elementId: 'temperature',
            property: 'backgroundColor',
            value: '#ffffff',
          },
        },
      ],
    };
    expect(matchingValueRules(set, 8).map(({ index }) => index)).toEqual([0, 2]);
    expect(matchingValueRules(set, 30)).toEqual([]);
  });
});

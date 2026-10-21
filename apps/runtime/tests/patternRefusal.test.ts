// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PATTERN_PRESETS, type StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { valueMatchesPattern } from '@cg/text-shaping';
import { __resetDraftsForTest, stageField } from '../src/renderer/features/inspector/draftStore.js';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  fieldPatternRefusal,
  patternRefusalLine,
  patternRefusalsOf,
} from '../src/renderer/features/inspector/patternCheck.js';
import * as feedback from '../src/renderer/features/status/commandFeedback.js';
import { vi } from 'vitest';

/**
 * 🔴 `R-101` — CG Control checks a text field against its pattern before Update. A mistyped azan time
 * (`25:00`) reached the page, which refused it and kept the old target with nothing said.
 */

const TIME = PATTERN_PRESETS['time']!.pattern;
const azan = {
  id: 'azan',
  label: 'Azan time',
  required: false,
  type: 'text',
  default: '20:32',
  pattern: TIME,
} as const;
const TEMPLATE: Pick<TemplateInfo, 'fields' | 'groups'> = {
  fields: [azan, { id: 'title', label: 'Title', required: false, type: 'text', default: '' }],
  groups: [
    {
      instanceId: 'inst',
      name: 'clock',
      compositionId: 'comp',
      aggregate: { fields: [{ ...azan, id: 'inner', label: 'Inner time' }], groups: [] },
    },
  ],
};

describe('🔴 R-101 — the one rule (shared with the Designer’s preview form)', () => {
  it('25:00 is not a time; 20:32 and ۲۰:۳۲ are; an empty value and a broken pattern pass', () => {
    expect(valueMatchesPattern(TIME, '25:00')).toBe(false);
    expect(valueMatchesPattern(TIME, '20:32')).toBe(true);
    expect(valueMatchesPattern(TIME, '۲۰:۳۲')).toBe(true);
    expect(valueMatchesPattern(TIME, '')).toBe(true);
    expect(valueMatchesPattern('([unclosed', 'anything')).toBe(true);
  });

  it('the line names the form in the operator’s words, never the regex', () => {
    expect(patternRefusalLine(TIME)).toBe('Not a Time (HH:MM), e.g. 21:30.');
    expect(patternRefusalLine('^x+$')).toBe('Not in the form this field takes.');
    expect(fieldPatternRefusal(azan, '20:32')).toBeNull();
    expect(fieldPatternRefusal({ ...azan, pattern: undefined } as never, '25:00')).toBeNull();
  });

  it('every staged refusal is found, inside a composition group too', () => {
    expect(patternRefusalsOf(TEMPLATE, { azan: '25:00', clock: { inner: '99:99' } })).toEqual([
      { label: 'Azan time', line: 'Not a Time (HH:MM), e.g. 21:30.' },
      { label: 'Inner time', line: 'Not a Time (HH:MM), e.g. 21:30.' },
    ]);
    expect(patternRefusalsOf(TEMPLATE, { azan: '۲۰:۳۲', title: 'anything' })).toEqual([]);
  });
});

describe('🔴 R-101 — Update sends nothing while a staged value is refused', () => {
  const updates: unknown[] = [];
  const row = (): StackItemState =>
    ({
      itemId: 'i1',
      templateId: 't',
      fields: { azan: '20:32' },
      status: 'loaded',
      pending: false,
    }) as never;

  beforeEach(() => {
    updates.length = 0;
    __resetDraftsForTest();
    (window as unknown as { cg: unknown }).cg = {
      stack: {
        update: (req: unknown) => {
          updates.push(req);
          return Promise.resolve({ accepted: true });
        },
      },
    };
    vi.restoreAllMocks();
  });

  it('25:00 staged: not sent, and the operator is told which field and why', async () => {
    const error = vi.spyOn(feedback, 'reportCommandError');
    stageField('i1', ['azan'], '25:00');
    expect(await applyDraft(row(), undefined, TEMPLATE)).toEqual({
      accepted: false,
      errorCode: 'pattern',
    });
    expect(updates).toHaveLength(0);
    expect(error).toHaveBeenCalledWith('Not sent: Azan time — Not a Time (HH:MM), e.g. 21:30.');
  });

  it('۲۰:۳۲ staged: sent', async () => {
    stageField('i1', ['azan'], '۲۰:۳۲');
    expect((await applyDraft(row(), undefined, TEMPLATE)).accepted).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it('a field with no pattern: nothing changes', async () => {
    stageField('i1', ['title'], '25:00');
    expect((await applyDraft(row(), undefined, TEMPLATE)).accepted).toBe(true);
  });
});

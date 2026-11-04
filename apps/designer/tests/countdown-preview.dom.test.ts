/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATTERN_PRESETS, type DynamicField } from '@cg/shared-schema';
import {
  PreviewFieldForm,
  validateField,
} from '../src/renderer/features/fields/PreviewFieldForm.js';
import { previewDeadlineLabel } from '../src/renderer/features/fields/PreviewTimingControls.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  window.localStorage?.clear();
});

describe('countdown target in Preview', () => {
  it.each(['datetime', 'timeofday'] as const)(
    'uses the shared masked %s input and preserves a valid target',
    (target) => {
      const value = target === 'datetime' ? '2026-11-04T17:49:14+03:30' : '21:00';
      const field: DynamicField = {
        id: 'eventTime',
        label: 'Event time',
        type: 'text',
        required: true,
        default: value,
        pattern: PATTERN_PRESETS[target === 'datetime' ? 'datetime' : 'time-seconds']?.pattern,
        countdown: { target, afterZero: 'close' },
      };
      const changed = vi.fn();
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      act(() =>
        root?.render(
          createElement(PreviewFieldForm, {
            aggregate: { fields: [field], groups: [] },
            values: { eventTime: value },
            onChange: changed,
          }),
        ),
      );
      expect(host.querySelector('input[aria-label="Event time time"]')).not.toBeNull();
      expect(host.querySelector('input[aria-label="Event time date"]') !== null).toBe(
        target === 'datetime',
      );
      expect(host.querySelector('textarea')).toBeNull();
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(validateField(field, value)).toBeNull();
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it('keeps custom validation rather than masking an author restriction', () => {
    expect(
      validateField(
        {
          id: 'time',
          label: 'Time',
          type: 'text',
          required: true,
          default: '',
          countdown: { target: 'timeofday', afterZero: 'close' },
          pattern: '^21:00$',
        },
        '20:00',
      ),
    ).not.toBeNull();
  });

  it('states the deadline as a date and time, not a raw ISO literal', () => {
    expect(previewDeadlineLabel('2026-11-04T17:49:14+03:30')).toContain('Nov 2026');
    expect(previewDeadlineLabel('2026-11-04T17:49:14+03:30')).not.toContain('T17:49');
  });
});

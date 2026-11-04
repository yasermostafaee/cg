/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField } from '@cg/shared-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('D-173 — Preview values follow their first strong character', () => {
  it('uses browser auto direction for scalar, multiline and list text editors', () => {
    const fields: DynamicField[] = [
      { id: 'title', label: 'Title', required: false, type: 'text', default: '' },
      { id: 'body', label: 'Body', required: false, type: 'multiline', default: '' },
      {
        id: 'headlines',
        label: 'Headlines',
        required: false,
        type: 'list',
        default: [],
      },
    ];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        createElement(PreviewFieldForm, {
          aggregate: { fields, groups: [] },
          values: {
            title: 'متن فارسی',
            body: '@English then Persian فارسی',
            headlines: [{ id: 'one', text: 'تیتر فارسی' }],
          },
          onChange: vi.fn(),
        }),
      ),
    );

    expect(host.querySelector('[aria-label="Title"]')?.getAttribute('dir')).toBe('auto');
    expect(host.querySelector('[aria-label="Body"]')?.getAttribute('dir')).toBe('auto');
    expect(host.querySelector('[aria-label="Headlines item 1"]')?.getAttribute('dir')).toBe('auto');
  });
});

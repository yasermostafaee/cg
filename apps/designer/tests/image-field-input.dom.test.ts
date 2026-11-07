/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggregatedFields } from '@cg/shared-schema';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function aggregate(inputMode: 'choices' | 'upload' | 'choices-and-upload'): AggregatedFields {
  return {
    fields: [
      {
        id: 'logo',
        label: 'Logo',
        required: false,
        type: 'image',
        accept: ['png', 'svg'],
        inputMode,
        assetOptions: [{ assetId: 'logo-svg', label: 'Logo SVG', source: 'shared' }],
      },
    ],
    groups: [],
  };
}

function render(inputMode: 'choices' | 'upload' | 'choices-and-upload'): void {
  act(() =>
    root.render(
      createElement(PreviewFieldForm, {
        aggregate: aggregate(inputMode),
        values: { logo: { assetId: 'logo-svg' } },
        onChange: vi.fn(),
        onUpdateAll: vi.fn(),
        anyPending: false,
        dwellFieldIds: new Set<string>(),
        columnsByFieldId: new Map(),
        imageUrls: { 'logo-svg': 'data:image/svg+xml,%3Csvg%2F%3E' },
      }),
    ),
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Preview image operator controls', () => {
  it('renders an authored dropdown without a raw filename input', () => {
    render('choices');
    expect(host.querySelector('button[aria-label="Logo"]')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.querySelector('input[type="text"]')).toBeNull();
    expect(host.textContent).toContain('Logo SVG');
    expect(host.querySelector<HTMLImageElement>('button[aria-label="Logo"] img')?.src).toContain(
      'data:image/svg+xml',
    );
  });

  it('renders Browse only when authored as upload', () => {
    render('upload');
    expect(host.querySelector('button[aria-label="Logo"]')).toBeNull();
    expect(host.querySelector('input[type="file"][accept=".png,.svg"]')).not.toBeNull();
  });

  it('renders both controls when authored as combined', () => {
    render('choices-and-upload');
    expect(host.querySelector('button[aria-label="Logo"]')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
  });
});

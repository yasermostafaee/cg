/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamicField } from '@cg/shared-schema';
import { ImageFieldControl } from '../src/renderer/features/inspector/ImageFieldControl.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ImageField = Extract<DynamicField, { type: 'image' }>;
let host: HTMLDivElement;
let root: Root;

function field(inputMode: ImageField['inputMode']): ImageField {
  return {
    id: 'logo',
    label: 'Logo',
    required: false,
    type: 'image',
    accept: ['png', 'svg'],
    ...(inputMode === undefined ? {} : { inputMode }),
    assetOptions: [{ assetId: 'logo-svg', label: 'Logo SVG', source: 'shared' }],
  };
}

function render(
  inputMode: ImageField['inputMode'],
  value: unknown = { assetId: 'logo-svg' },
  onChange = vi.fn(),
): ReturnType<typeof vi.fn> {
  act(() =>
    root.render(
      createElement(ImageFieldControl, {
        field: field(inputMode),
        value,
        ariaLabel: 'Logo',
        onChange,
      }),
    ),
  );
  return onChange;
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

describe('CG Control image operator controls', () => {
  it('keeps legacy fields as a readable choice picker', () => {
    render(undefined);
    expect(host.querySelector('button[aria-label="Logo"]')).not.toBeNull();
    expect(host.textContent).toContain('Logo SVG');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('obeys upload-only and keeps SVG in the native picker filter', () => {
    render('upload');
    expect(host.querySelector('button[aria-label="Logo"]')).toBeNull();
    expect(host.querySelector('input[type="file"][accept=".png,.svg"]')).not.toBeNull();
    expect(host.textContent).toContain('Browse…');
  });

  it('supports dropdown and Browse together', () => {
    render('choices-and-upload');
    expect(host.querySelector('button[aria-label="Logo"]')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
    expect(host.textContent).toContain('Browse…');
  });

  it('stages an explicit empty image instead of restoring the default picture', () => {
    const onChange = render('choices', { assetId: 'logo-svg' });
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Logo"]')?.click());
    const empty = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('No picture selected'),
    );
    act(() => empty?.click());
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows the selected uploaded image after its UI thumbnail is ready', async () => {
    render('upload', { assetId: 'data:image/svg+xml,%3Csvg%2F%3E' });
    expect(host.querySelector<HTMLImageElement>('.cg-image-field-thumbnail')).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.querySelector<HTMLImageElement>('.cg-image-field-thumbnail')?.src).toContain(
      'data:image/svg+xml',
    );
  });
});

/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, ListItem } from '@cg/shared-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('R-102 — File-only authority in Designer composition Preview', () => {
  it('shows current scalar/list content without edit or list-shape controls', () => {
    const items: ListItem[] = [
      { id: 'first', text: 'first headline' },
      { id: 'second', text: 'second headline' },
    ];
    const policy = {
      inputMode: 'file-only' as const,
      bridgePath: 'news.txt',
      lockFile: true as const,
    };
    const fields: DynamicField[] = [
      {
        id: 'title',
        label: 'Locked title',
        required: false,
        type: 'text',
        default: 'fallback',
        allowFileSource: true,
        fileSource: policy,
      },
      {
        id: 'headlines',
        label: 'Locked headlines',
        required: false,
        type: 'list',
        default: [],
        allowFileSource: true,
        fileSource: { ...policy, delimiter: '\n' },
      },
    ];
    const onChange = vi.fn();
    const onUpdateAll = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(PreviewFieldForm, {
          aggregate: { fields, groups: [] },
          values: { title: 'live title', headlines: items },
          pendingPaths: new Set(['title', 'headlines']),
          onChange,
          onUpdateAll,
        }),
      ),
    );

    const scalar = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Locked title"]',
    );
    expect(scalar?.readOnly).toBe(true);
    expect(scalar?.value).toBe('live title');
    const list = container.querySelector<HTMLOListElement>(
      'ol[aria-label="Locked headlines read-only items"]',
    );
    expect(list?.querySelectorAll('li')).toHaveLength(2);
    expect(list?.textContent).toContain('first headline');
    expect(container.textContent).not.toContain('Add item');
    expect(container.querySelector('[aria-label^="Remove Locked headlines item"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Update field Locked"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(onUpdateAll).not.toHaveBeenCalled();
  });

  it('shows a Sequence-owned workbook instead of an Edit rows action on every page', () => {
    const onChange = vi.fn();
    const list: DynamicField = {
      id: 'cities',
      label: 'Cities',
      required: false,
      type: 'list',
      default: [],
      itemFields: [{ id: 'city', label: 'City', required: true, type: 'text', default: '' }],
    };
    const groups = [1, 2].map((item) => ({
      instanceId: `weather:page-${String(item)}`,
      name: `weather:page-${String(item)}`,
      label: `Weather page — item ${String(item)}`,
      compositionId: 'weather-page',
      sequence: {
        id: 'weather',
        name: 'Weather pages',
        itemId: `page-${String(item)}`,
        pageDataFile: 'weather/cities.xlsx',
      },
      aggregate: { fields: [list], groups: [] },
    }));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(PreviewFieldForm, {
          aggregate: { fields: [], groups },
          values: {
            'weather:page-1': { cities: [{ id: 'tehran', city: 'Tehran' }] },
            'weather:page-2': { cities: [{ id: 'shiraz', city: 'Shiraz' }] },
          },
          onChange,
          columnsByFieldId: new Map([
            ['cities', [{ key: 'city', label: 'City', kind: 'text' as const }]],
          ]),
        }),
      ),
    );

    expect(container.textContent).not.toContain('Edit rows');
    expect(container.querySelectorAll('[aria-label="Cities connected file"]')).toHaveLength(2);
    expect(container.textContent).toContain('weather/cities.xlsx');
    expect(container.textContent).toContain('file managed');
    expect(onChange).not.toHaveBeenCalled();
  });
});

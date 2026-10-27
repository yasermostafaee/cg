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
    const onUpdateField = vi.fn();
    const onUpdateItem = vi.fn();

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
          onUpdateField,
          onUpdateItem,
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
    expect(onUpdateField).not.toHaveBeenCalled();
    expect(onUpdateItem).not.toHaveBeenCalled();
  });
});

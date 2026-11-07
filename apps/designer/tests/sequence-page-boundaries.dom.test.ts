/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListItem } from '@cg/shared-schema';
import { ListItemsEditor } from '../src/renderer/features/fields/ListItemsEditor.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function rows(count: number): ListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${String(index + 1)}`,
    text: `row ${String(index + 1)}`,
  }));
}

function render(count: number): void {
  act(() =>
    root.render(
      createElement(ListItemsEditor, {
        items: rows(count),
        label: 'Sequence rows',
        pageSize: 3,
        onChange: vi.fn(),
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

describe('Sequence row page boundaries', () => {
  it('moves its labelled page breaks with the live row count', () => {
    render(4);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(2);
    expect(host.textContent).toContain('Page 1');
    expect(host.textContent).toContain('Page 2');

    render(7);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(3);
    expect(host.textContent).toContain('Page 3');

    render(2);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(host.textContent).not.toContain('Page 2');
  });
});

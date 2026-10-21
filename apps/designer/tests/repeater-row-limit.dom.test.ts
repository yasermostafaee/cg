/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ListItem } from '@cg/shared-schema';
import {
  ListItemsEditor,
  rowLimitReason,
  rowOverLimitReason,
} from '../src/renderer/features/fields/ListItemsEditor.js';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';

/**
 * 🔴 `B-106` — the repeater's row editor knows the row LIMIT. The page stamps at most `maxItems`
 * rows (one reading, `repeaterRowLimit`), and the Inspector used to list and add rows past it, so
 * the authored count and what reaches air drifted apart silently.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const rows = (n: number): ListItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${String(i)}`, text: `row ${String(i)}` }));

function mount(items: ListItem[], maxItems: number | undefined, onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(createElement(ListItemsEditor, { items, label: 'Repeater', onChange, maxItems })),
  );
  const add = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add item');
  return { host: container, add, onChange };
}

describe('B-106 — Add item at the limit', () => {
  it('🔴 is WITHHELD at maxItems, its reason on the add row, and a press adds nothing', () => {
    const { add, onChange } = mount(rows(3), 3);
    expect(add?.disabled).toBe(true);
    expect(add?.parentElement?.getAttribute('title')).toBe(rowLimitReason(3));
    expect(rowLimitReason(3)).toBe('At most 3 rows (max items). Raise max items to add more.');
    act(() => add?.click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('below the limit it adds a row, and says nothing', () => {
    const { add, onChange } = mount(rows(2), 3);
    expect(add?.disabled).toBe(false);
    expect(add?.parentElement?.hasAttribute('title')).toBe(false);
    act(() => add?.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]?.[0] as ListItem[]).length).toBe(3);
  });

  it('with no limit it always adds — ticker and sequence lists are unchanged', () => {
    const { add } = mount(rows(12), undefined);
    expect(add?.disabled).toBe(false);
  });
});

describe('🔴 RUN-NEXT-VERSION-02 Q3 — the Preview form’s list stops at the repeater’s max items', () => {
  it('a repeater-bound list field carrying maxItems withholds Add item at the limit', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const field = {
      id: 'rows',
      label: 'Rows',
      required: false,
      type: 'list' as const,
      default: rows(2),
      maxItems: 2,
    };
    act(() =>
      root?.render(
        createElement(PreviewFieldForm, {
          aggregate: { fields: [field], groups: [] },
          values: {},
          onChange: vi.fn(),
        }),
      ),
    );
    const add = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add item');
    expect(add?.disabled).toBe(true);
    expect(add?.parentElement?.getAttribute('title')).toBe(rowLimitReason(2));
  });
});

describe('B-106 — a row past the limit is flagged', () => {
  it('🔴 rows beyond maxItems read "not shown", with the reason; the rest do not', () => {
    // Authored before the limit was lowered: 4 rows, limit 2.
    const { host } = mount(rows(4), 2);
    const flagged = [...host.querySelectorAll('[data-over-limit="true"]')];
    expect(flagged).toHaveLength(2);
    for (const row of flagged) {
      const tag = row.querySelector('[data-cg-tag]');
      expect(tag?.textContent).toBe('not shown');
      expect(tag?.getAttribute('title')).toBe(rowOverLimitReason(2));
    }
    // The rows inside the limit carry no flag; the flagged rows stay editable (removable).
    expect([...host.querySelectorAll('[data-cg-tag]')]).toHaveLength(2);
    expect(flagged[0]?.querySelector('button[aria-label="Remove Repeater item 3"]')).not.toBeNull();
  });
});

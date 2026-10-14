// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompositionFieldGroup } from '@cg/shared-schema';
import { GroupHeadingText } from '../src/renderer/features/inspector/Inspector.js';

/**
 * 🔴 `R-037` / `R-040` — a sequence item's field heading in CG Control reads
 * `<composition> — item N`, plus ` · <stub>` only when two would collide, with EACH NAME IN ITS
 * OWN ISOLATE (golden rule 11): the composition name is often Persian and `— item N` is LTR chrome,
 * so one isolate around the whole label would let the bidi algorithm order the pieces.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

function render(group: CompositionFieldGroup): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(GroupHeadingText, { group })));
  return container;
}

const base = {
  instanceId: 's1:a',
  name: 's1:a',
  compositionId: 'card',
  aggregate: { fields: [], groups: [] },
};

describe('R-037 / R-040 — the sequence item heading, isolated', () => {
  it('🔴 a Persian composition name is in its OWN isolate; "— item N" is chrome outside it', () => {
    const host = render({
      ...base,
      label: 'کارت شهر — item 1',
      labelParts: { name: 'کارت شهر', item: 1 },
    });
    expect([...host.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['کارت شهر']);
    expect(host.textContent).toBe('کارت شهر — item 1');
  });

  it('🔴 a colliding heading carries its stub in a SECOND isolate', () => {
    const host = render({
      ...base,
      label: 'کارت — item 1 · صبح',
      labelParts: { name: 'کارت', item: 1, stub: 'صبح' },
    });
    expect([...host.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['کارت', 'صبح']);
    expect(host.textContent).toBe('کارت — item 1 · صبح');
  });

  it('a group without parts (a composition instance, or an older import) is one name, as before', () => {
    const host = render({ ...base, name: 'home', label: undefined });
    expect([...host.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['home']);
  });
});

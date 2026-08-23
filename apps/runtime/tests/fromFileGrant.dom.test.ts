// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetFromFileForTest,
  attachFileSource,
  fromFileState,
} from '../src/renderer/features/inspector/fromFileStore.js';
import type * as PersistenceModule from '../src/renderer/features/inspector/fromFilePersistence.js';
import type { PersistedAttachment } from '../src/renderer/features/inspector/fromFilePersistence.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * TEXT-FILE-OPT-01 — the FROM FILE affordance is an AUTHORED per-field grant.
 *
 * Before this, the control was gated on FIELD KIND alone (`Inspector.tsx`:
 * `kind === 'text' || kind === 'multiline' || kind === 'list'`), so it rendered
 * under every label on every template. The kind test is now the OUTER condition
 * and the author's `allowFileSource` is the inner one.
 *
 * The last describe block is the one that matters most: the gate must NEVER read
 * an unresolved template schema as a revoked grant. `Inspector` starts `info` at
 * `null` and fills it from an async `templates.get`, so a detach driven by "this
 * field does not grant" would fire on EVERY selection change, for EVERY field,
 * and delete the operator's attachments — the `useStackHousekeeping` /
 * `pruneDrafts` class of bug, one store over.
 */

const saved = new Map<string, PersistedAttachment>();

vi.mock('../src/renderer/features/inspector/fromFilePersistence.js', async () => {
  const actual = await vi.importActual<typeof PersistenceModule>(
    '../src/renderer/features/inspector/fromFilePersistence.js',
  );
  return {
    attachmentKey: actual.attachmentKey,
    saveAttachment: (r: PersistedAttachment) => {
      saved.set(r.key, r);
      return Promise.resolve();
    },
    deleteAttachment: (k: string) => {
      saved.delete(k);
      return Promise.resolve();
    },
    loadAttachments: () => Promise.resolve([...saved.values()]),
    pruneAttachments: () => Promise.resolve(),
  };
});

/** A source with a handle, so the store persists it (the no-handle fake does not). */
function source(name: string) {
  return {
    name,
    handle: {
      name,
      kind: 'file',
      getFile: () => Promise.resolve(new File(['copy'], name)),
      queryPermission: () => Promise.resolve('granted' as PermissionState),
      requestPermission: () => Promise.resolve('granted' as PermissionState),
    } as unknown as FileSystemFileHandle,
    read: () => Promise.resolve('copy'),
  };
}

/**
 * One template with the whole matrix: a granted and an un-granted field of each
 * eligible kind, plus a `number` that can never be granted, plus a granted field
 * inside a nested-composition GROUP (the recursive half of the walk).
 */
const TEMPLATE: TemplateInfo = {
  templateId: 'tpl-1',
  templateType: 'lower-third',
  fields: [
    {
      id: 'crawl',
      type: 'multiline',
      label: 'Crawl',
      required: false,
      default: '',
      allowFileSource: true,
    },
    { id: 'headline', type: 'text', label: 'Headline', required: false, default: '' },
    {
      id: 'items',
      type: 'list',
      label: 'Items',
      required: false,
      default: [],
      allowFileSource: true,
    },
    { id: 'tags', type: 'list', label: 'Tags', required: false, default: [] },
    { id: 'count', type: 'number', label: 'Count', required: false, default: 0 },
  ],
  groups: [
    {
      instanceId: 'inst-card',
      name: 'card',
      label: 'Card',
      compositionId: 'comp-card',
      aggregate: {
        fields: [
          {
            id: 'body',
            type: 'multiline',
            label: 'Body',
            required: false,
            default: '',
            allowFileSource: true,
          },
          { id: 'name', type: 'text', label: 'Name', required: false, default: '' },
        ],
        groups: [],
      },
    },
  ],
};

function item(): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: {
      crawl: '',
      headline: '',
      items: [],
      tags: [],
      count: 0,
      card: { body: '', name: '' },
    },
    status: 'loaded',
    pending: false,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** `get` is a THUNK so a test can hand back null, or a promise that never settles. */
async function render(get: () => Promise<TemplateInfo | null>): Promise<HTMLDivElement> {
  const stub = {
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: { get: vi.fn(get), list: vi.fn(() => Promise.resolve([])) },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: item(),
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
  });
  // A second flush: the grant reconcile runs in an effect after `info` lands.
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const fromFileButton = (el: HTMLElement, fieldId: string): Element | null =>
  el.querySelector(`button[aria-label="Load ${fieldId} from file"]`);

beforeEach(() => {
  saved.clear();
  __resetDraftsForTest();
  __resetFromFileForTest();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('the FROM FILE control renders only where the author granted a file source', () => {
  it('renders no control on a text-carrying field WITHOUT the grant', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileButton(el, 'headline')).toBeNull();
    expect(fromFileButton(el, 'tags')).toBeNull();
    // The field itself is still fully editable — only the affordance is gone.
    expect(el.querySelector('input[aria-label="headline"]')).not.toBeNull();
  });

  it('renders the control on a field WITH the grant, of every eligible kind', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileButton(el, 'crawl')).not.toBeNull();
    expect(fromFileButton(el, 'items')).not.toBeNull();
  });

  it('carries the grant into a nested-composition group', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    const group = el.querySelector<HTMLElement>('section[aria-label="Card fields"]');
    expect(group).not.toBeNull();
    expect(group === null ? null : fromFileButton(group, 'body')).not.toBeNull();
    expect(group === null ? null : fromFileButton(group, 'name')).toBeNull();
  });

  it('never renders the control on a kind that cannot take file content', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileButton(el, 'count')).toBeNull();
  });

  it('leaves a granted field behaving exactly as an eligible field did before', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    // A granted LIST keeps its split row in the field's footer once attached…
    attachFileSource('item-1', ['items'], source('crawl.txt'), { split: true, delimiter: '،' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(el.querySelector('input[aria-label="Split items into items"]')).not.toBeNull();
    expect(el.querySelector('select[aria-label="items split delimiter"]')).not.toBeNull();
    // …and its detach control is the file chip's, unchanged.
    expect(el.querySelector('button[aria-label="Detach items file source"]')).not.toBeNull();
  });
});

describe('an attachment on a field that LOST its grant is detached — durably', () => {
  it('detaches from the store and from durable storage', async () => {
    attachFileSource('item-1', ['headline'], source('labels.txt'), {
      split: false,
      delimiter: '،',
    });
    expect(fromFileState('item-1', ['headline'])).toBeDefined();
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(true);

    const el = await render(() => Promise.resolve(TEMPLATE));

    expect(fromFileState('item-1', ['headline'])).toBeUndefined();
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(false);
    // Nothing is left on screen to hint at a source with no visible cause.
    expect(el.textContent).not.toContain('labels.txt');
  });

  it('detaches a nested un-granted field at its NAMESPACED path', async () => {
    attachFileSource('item-1', ['card', 'name'], source('names.txt'), {
      split: false,
      delimiter: '،',
    });
    await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileState('item-1', ['card', 'name'])).toBeUndefined();
  });

  it('leaves a GRANTED field’s attachment alone', async () => {
    attachFileSource('item-1', ['crawl'], source('crawl.txt'), { split: false, delimiter: '،' });
    attachFileSource('item-1', ['card', 'body'], source('body.txt'), {
      split: false,
      delimiter: '،',
    });
    const el = await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileState('item-1', ['crawl'])).toBeDefined();
    expect(fromFileState('item-1', ['card', 'body'])).toBeDefined();
    expect(saved.has(JSON.stringify(['item-1', 'crawl']))).toBe(true);
    expect(el.textContent).toContain('crawl.txt');
  });

  it('leaves ANOTHER item’s attachment alone', async () => {
    attachFileSource('item-2', ['headline'], source('other.txt'), {
      split: false,
      delimiter: '،',
    });
    await render(() => Promise.resolve(TEMPLATE));
    expect(fromFileState('item-2', ['headline'])).toBeDefined();
  });
});

/**
 * 🔴 The hazard. `info` is null until `templates.get` resolves, and for a template
 * the registry does not know it stays null forever — at which point EVERY field is
 * un-granted as far as the gate can see. Deleting on that is deleting on silence.
 */
describe('an UNRESOLVED template schema deletes nothing', () => {
  it('keeps every attachment when the registry does not know the template', async () => {
    attachFileSource('item-1', ['headline'], source('labels.txt'), {
      split: false,
      delimiter: '،',
    });
    const el = await render(() => Promise.resolve(null));
    expect(fromFileState('item-1', ['headline'])).toBeDefined();
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(true);
    // …and offers no control for it either: absent grant is still OFF.
    expect(fromFileButton(el, 'headline')).toBeNull();
  });

  it('keeps every attachment while the lookup is still in flight', async () => {
    attachFileSource('item-1', ['headline'], source('labels.txt'), {
      split: false,
      delimiter: '،',
    });
    await render(() => new Promise<TemplateInfo>(() => undefined));
    expect(fromFileState('item-1', ['headline'])).toBeDefined();
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(true);
  });

  it('keeps an attachment when the lookup REJECTS', async () => {
    attachFileSource('item-1', ['headline'], source('labels.txt'), {
      split: false,
      delimiter: '،',
    });
    await render(() => Promise.reject(new Error('bridge down')));
    expect(fromFileState('item-1', ['headline'])).toBeDefined();
  });
});

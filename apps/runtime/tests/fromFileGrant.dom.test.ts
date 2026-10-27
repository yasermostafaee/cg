// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSourcePolicy, StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { stagedValue } from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetFromFileForTest,
  attachFileSource,
  fromFileState,
  restoreFromFileAttachments,
} from '../src/renderer/features/inspector/fromFileStore.js';
import type * as PersistenceModule from '../src/renderer/features/inspector/fromFilePersistence.js';
import type { PersistedAttachment } from '../src/renderer/features/inspector/fromFilePersistence.js';
import { connectionsStub, linkFor } from './support/reachability.js';
import { fillBridgeStub } from './support/authStub.js';

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
function source(name: string, content = 'copy') {
  return {
    name,
    handle: {
      name,
      kind: 'file',
      getFile: () => Promise.resolve(new File(['copy'], name)),
      queryPermission: () => Promise.resolve('granted' as PermissionState),
      requestPermission: () => Promise.resolve('granted' as PermissionState),
    } as unknown as FileSystemFileHandle,
    read: () => Promise.resolve(content),
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
async function render(
  get: () => Promise<TemplateInfo | null>,
  options: {
    readText?: (request: { path: string }) => Promise<{
      name: string;
      sourcePath?: string;
      content: string;
    }>;
    onApply?: () => Promise<{ accepted: boolean }>;
  } = {},
): Promise<HTMLDivElement> {
  await restoreFromFileAttachments({ ready: true, liveItemIds: new Set(['item-1']) });
  const stub = {
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    textSources: {
      read:
        options.readText ??
        (() => Promise.reject(new Error('this test did not provide a Bridge text source'))),
    },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(get),
      list: vi.fn(() => Promise.resolve([])),
      onChanged: () => () => undefined,
    },
    // Phase 6 — the Inspector names the ROW (`useOperatorNames`), so it reads the bank too.
    fixedLayers: {
      config: () => Promise.resolve(null),
      onConfigChanged: () => () => undefined,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);

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
          onApply: options.onApply ?? (() => Promise.resolve({ accepted: true })),
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

function withFieldPolicy(fieldId: string, fileSource: FileSourcePolicy): TemplateInfo {
  return {
    ...TEMPLATE,
    fields: TEMPLATE.fields?.map((field) =>
      field.id === fieldId ? { ...field, fileSource } : field,
    ),
  };
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

  it('moves file content and list interpretation into a modal instead of the Inspector', async () => {
    const el = await render(() => Promise.resolve(TEMPLATE));
    attachFileSource('item-1', ['items'], source('crawl.txt', 'first|second'), {
      split: true,
      delimiter: '|',
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(el.querySelector('input[aria-label="Split items into items"]')).toBeNull();
    expect(el.querySelector('select[aria-label="items split delimiter"]')).toBeNull();
    expect(el.textContent).not.toContain('File content');
    expect(el.querySelector('button[aria-label="Detach items file source"]')).not.toBeNull();

    await act(async () => {
      el.querySelector<HTMLButtonElement>(
        'button[aria-label="View items file content and fields"]',
      )?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="File content and fields · items"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('[aria-label="File content"]')?.textContent).toContain(
      'first|second',
    );
    expect(dialog?.querySelector('[aria-label="Parsed fields"]')?.textContent).toContain('first');
    expect(dialog?.querySelector('[aria-label="Parsed fields"]')?.textContent).toContain('second');
    expect(dialog?.querySelector('input[aria-label="Split items into items"]')).not.toBeNull();
    expect(dialog?.querySelector('select[aria-label="items split delimiter"]')).not.toBeNull();
  });
});

describe('R-102 — authored file-only and locked Bridge sources', () => {
  it('removes the manual editor but leaves file choice for file-only text and list fields', async () => {
    const headlinePolicy = withFieldPolicy('headline', { inputMode: 'file-only' });
    const template = {
      ...headlinePolicy,
      fields: headlinePolicy.fields?.map((field) =>
        field.id === 'items'
          ? { ...field, fileSource: { inputMode: 'file-only' as const } }
          : field,
      ),
    };
    const el = await render(() => Promise.resolve(template));

    expect(el.querySelector('input[aria-label="headline"]')).toBeNull();
    expect(fromFileButton(el, 'headline')).not.toBeNull();
    expect(el.querySelector('[aria-label="Add items item"]')).toBeNull();
    expect(el.querySelector('[aria-label^="Remove items item"]')).toBeNull();
    expect(fromFileButton(el, 'items')).not.toBeNull();
  });

  it('keeps the manual editor for lock-only, but exposes no choose or detach route', async () => {
    const template = withFieldPolicy('crawl', {
      bridgePath: 'newsroom/crawl.txt',
      lockFile: true,
    });
    const el = await render(() => Promise.resolve(template));

    expect(el.querySelector('textarea[aria-label="crawl"]')).not.toBeNull();
    expect(el.textContent).toContain('newsroom/crawl.txt');
    expect(el.querySelector('button[aria-label="Reload crawl from file"]')).not.toBeNull();
    expect(fromFileButton(el, 'crawl')).toBeNull();
    expect(el.querySelector('button[aria-label="Detach crawl file source"]')).toBeNull();
  });

  it('combines file-only and lock so only the authored source and Reload remain', async () => {
    const template = withFieldPolicy('headline', {
      inputMode: 'file-only',
      bridgePath: 'newsroom/headline.txt',
      lockFile: true,
    });
    const el = await render(() => Promise.resolve(template));

    expect(el.querySelector('input[aria-label="headline"]')).toBeNull();
    expect(el.textContent).toContain('newsroom/headline.txt');
    expect(el.querySelector('button[aria-label="Reload headline from file"]')).not.toBeNull();
    expect(fromFileButton(el, 'headline')).toBeNull();
    expect(el.querySelector('button[aria-label="Detach headline file source"]')).toBeNull();
  });

  it('reloads current Bridge bytes into the draft and never applies by itself', async () => {
    const onApply = vi.fn(() => Promise.resolve({ accepted: true }));
    const readText = vi.fn(() =>
      Promise.resolve({
        name: 'newsroom/crawl.txt',
        sourcePath: String.raw`\\newsroom\CG Text\newsroom\crawl.txt`,
        content: 'خبر تازه',
      }),
    );
    const template = withFieldPolicy('crawl', {
      bridgePath: 'newsroom/crawl.txt',
      lockFile: true,
    });
    const el = await render(() => Promise.resolve(template), { readText, onApply });
    const reload = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Reload crawl from file"]',
    );
    expect(reload).not.toBeNull();

    await act(async () => {
      reload?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalledWith({ path: 'newsroom/crawl.txt' });
    expect(stagedValue('item-1', ['crawl'])).toBe('خبر تازه');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('uses an unlocked authored path as a replaceable default', async () => {
    const template = withFieldPolicy('headline', { bridgePath: 'newsroom/default.txt' });
    const el = await render(() => Promise.resolve(template));

    expect(el.textContent).toContain('newsroom/default.txt');
    expect(el.querySelector('input[aria-label="headline"]')).not.toBeNull();
    const detach = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Detach headline file source"]',
    );
    expect(detach).not.toBeNull();
    await act(async () => {
      detach?.click();
      await Promise.resolve();
    });
    expect(el.textContent).not.toContain('newsroom/default.txt');
    expect(fromFileButton(el, 'headline')).not.toBeNull();
  });

  it('seeds an authored list delimiter and enables splitting for the Bridge default', async () => {
    const template = withFieldPolicy('items', {
      bridgePath: 'newsroom/headlines.txt',
      delimiter: '|',
    });
    await render(() => Promise.resolve(template));

    expect(fromFileState('item-1', ['items'])).toMatchObject({
      source: { bridgePath: 'newsroom/headlines.txt' },
      split: true,
      delimiter: '|',
    });
  });

  it('locks list splitting and delimiter selection with the authored file', async () => {
    attachFileSource('item-1', ['items'], source('operator.txt'), {
      split: false,
      delimiter: '،',
    });
    const template = withFieldPolicy('items', {
      bridgePath: 'newsroom/headlines.txt',
      lockFile: true,
      delimiter: '|',
    });
    const el = await render(() => Promise.resolve(template), {
      readText: () =>
        Promise.resolve({
          name: 'newsroom/headlines.txt',
          sourcePath: String.raw`\\newsroom\CG Text\newsroom\headlines.txt`,
          content: 'first|second',
        }),
    });

    expect(fromFileState('item-1', ['items'])).toMatchObject({
      source: { bridgePath: 'newsroom/headlines.txt' },
      split: true,
      delimiter: '|',
    });
    expect(el.querySelector('input[aria-label="Split items into items"]')).toBeNull();
    expect(el.querySelector('select[aria-label="items split delimiter"]')).toBeNull();
    expect(el.querySelector('[aria-label="items locked delimiter"]')).toBeNull();

    await act(async () => {
      el.querySelector<HTMLButtonElement>(
        'button[aria-label="View items file content and fields"]',
      )?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="File content and fields · items"]',
    );
    expect(dialog?.querySelector('[aria-label="items locked delimiter"]')?.textContent).toContain(
      'pipe',
    );
    expect(dialog?.textContent).toContain('Delimiter');
    expect(dialog?.textContent).toContain(String.raw`\\newsroom\CG Text\newsroom\headlines.txt`);
    expect(dialog?.querySelector('input[aria-label="Split items into items"]')).toBeNull();
    expect(dialog?.querySelector('select[aria-label="items split delimiter"]')).toBeNull();
    expect(dialog?.querySelector('[aria-label="File content"]')?.textContent).toContain(
      'first|second',
    );
    expect(dialog?.querySelector('[aria-label="Parsed fields"]')?.textContent).toContain('first');
    expect(dialog?.querySelector('[aria-label="Parsed fields"]')?.textContent).toContain('second');
  });

  it('does not race an unlocked default over the operator file restored from storage', async () => {
    attachFileSource('item-1', ['headline'], source('operator.txt'), {
      split: false,
      delimiter: '،',
    });
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(true);
    // A page reload clears memory but not IndexedDB (the mocked `saved` map).
    __resetFromFileForTest();
    const template = withFieldPolicy('headline', { bridgePath: 'newsroom/default.txt' });
    const el = await render(() => Promise.resolve(template));

    expect(el.textContent).toContain('operator.txt');
    expect(el.textContent).not.toContain('newsroom/default.txt');
    expect(saved.has(JSON.stringify(['item-1', 'headline']))).toBe(true);
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

// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, TemplateAct, TemplateInfo } from '@cg/shared-ipc';
import { useTemplatePicker } from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import {
  REMEMBERED_MS,
  __resetTemplateActsForTest,
  noteOwnRemoval,
  recentRemovalElsewhere,
  subscribeTemplateActs,
} from '../src/renderer/features/library/templateActs.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`B-300`) — **AN OPEN PICKER FOLLOWS CG BRIDGE.**
 *
 * The owner, two consoles on one CG Bridge: a template removed on A stayed listed in B's open
 * picker, and B's Load of it met a raw refusal. The stub below publishes the way CG Bridge does —
 * `templates.changed` with the new list, then `templates.acted` saying who did what — and the
 * picker must follow both while it is open, and neither once it is closed.
 */

const tpl = (templateId: string, name: string): TemplateInfo => ({
  templateId,
  name,
  templateType: 'lower-third',
  fields: [],
});
const ONE = tpl('tpl-one', 'lower third');
const TWO = tpl('tpl-two', 'two box');
const THREE = tpl('tpl-three', 'ticker');
const FOUR = tpl('tpl-four', 'score');

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 30, low: { start: 50, count: 9 } };

let registry: TemplateInfo[] = [];
let changed: ((list: TemplateInfo[]) => void)[] = [];
let acted: ((published: TemplateAct) => void)[] = [];
/** Who CG Bridge names for a removal THIS console asks for. */
let signedInAs = 'Sara';
let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** CG Bridge's two publishes, in its order: the list, then who changed it. */
function publish(published: TemplateAct): void {
  for (const h of [...changed]) h(registry);
  for (const h of [...acted]) h(published);
}

function installBridge(): void {
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    fixedLayers: { config: () => Promise.resolve(BANK), onConfigChanged: () => () => undefined },
    stack: {
      snapshot: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      remove: () => Promise.resolve({ accepted: true }),
    },
    templates: {
      list: () => Promise.resolve(registry),
      remove: (req: { templateId: string; channel?: number }) => {
        const gone = registry.find((t) => t.templateId === req.templateId);
        registry = registry.filter((t) => t.templateId !== req.templateId);
        // CG Bridge publishes BEFORE it answers: the act reaches this console first.
        publish({
          act: 'remove',
          templateId: req.templateId,
          ...(gone?.name !== undefined ? { name: gone.name } : {}),
          channel: req.channel ?? null,
          actor: signedInAs,
        });
        return Promise.resolve({ ok: true });
      },
      onChanged: (h: (list: TemplateInfo[]) => void) => {
        changed.push(h);
        return () => {
          changed = changed.filter((x) => x !== h);
        };
      },
      onActed: (h: (published: TemplateAct) => void) => {
        acted.push(h);
        return () => {
          acted = acted.filter((x) => x !== h);
        };
      },
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve({ assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: () => Promise.resolve({ ok: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function settleAll(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function openPicker(channel = 1): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let open: (() => void) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () => {
      void pickTemplate('Load onto Layer 3', 'high', {
        rowName: 'Layer 3',
        coord: `${String(channel)}-97`,
        channel,
        holding: null,
      });
    };
    return createElement('div', null, pickerDialog);
  }
  await act(async () => {
    root?.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    open?.();
    await Promise.resolve();
  });
  await settleAll();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

/** Another console's act: CG Bridge's list becomes `next`, and it says who did what. */
async function elsewhere(published: TemplateAct, next: TemplateInfo[]): Promise<void> {
  registry = next;
  await act(async () => {
    publish(published);
    await Promise.resolve();
  });
  await settleAll();
}

/** The ids the open list shows, sorted (the list's own order is newest first). */
const listed = (): string[] =>
  [...document.querySelectorAll('[data-template-list] [data-template-id]')]
    .map((el) => el.getAttribute('data-template-id') ?? '')
    .sort();

function button(name: RegExp): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll('button')]
      .filter((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
      .at(-1) ?? null
  );
}

async function press(name: RegExp): Promise<void> {
  const target = button(name);
  if (target === null) throw new Error(`no button matching ${String(name)}`);
  await act(async () => {
    target.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  await settleAll();
}

const messageText = (): string => document.querySelector('[data-modal-message]')?.textContent ?? '';

const RLI = String.fromCodePoint(0x2067);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

beforeEach(() => {
  registry = [ONE, TWO, THREE];
  changed = [];
  acted = [];
  signedInAs = 'Sara';
  installBridge();
  initSources(window.cg);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  __resetSourcesForTest();
  __resetTemplateActsForTest();
  vi.restoreAllMocks();
});

describe('`B-300` — while open, the list is CG Bridge’s', () => {
  it('🔴 a removal on another console leaves the open list; the other templates stay as they were', async () => {
    await openPicker();
    expect(listed()).toEqual(['tpl-one', 'tpl-three', 'tpl-two']);

    await elsewhere(
      { act: 'remove', templateId: 'tpl-two', name: 'two box', channel: 1, actor: 'Reza' },
      [ONE, THREE],
    );

    expect(listed()).toEqual(['tpl-one', 'tpl-three']);
    // Not the chosen one: the list simply follows, and nothing is said.
    expect(messageText()).toBe('');
  });

  it('an import on another console appears; a re-import keeps the chosen template chosen, at its new version', async () => {
    await openPicker();
    await press(/^Select two box$/);

    await elsewhere(
      { act: 'import', templateId: 'tpl-four', name: 'score', channel: 1, actor: 'Reza' },
      [ONE, TWO, THREE, FOUR],
    );
    expect(listed()).toEqual(['tpl-four', 'tpl-one', 'tpl-three', 'tpl-two']);

    const renamed = tpl('tpl-two', 'two box v2');
    await elsewhere(
      { act: 'reimport', templateId: 'tpl-two', name: 'two box v2', channel: 1, actor: 'Reza' },
      [ONE, renamed, THREE, FOUR],
    );
    const chosen = document.querySelector('.cg-tpl-pick[data-template-selected]');
    expect(chosen?.getAttribute('data-template-selected')).toBe('tpl-two');
    expect(chosen?.textContent).toContain('two box v2');
    expect(messageText()).toBe('');
  });

  it('🔴 the CHOSEN template removed on another console: the choice goes, and one line names it and who — never its id', async () => {
    await openPicker();
    await press(/^Select two box$/);
    expect(button(/^Load onto Layer 3$/)?.disabled).toBe(false);

    await elsewhere(
      { act: 'remove', templateId: 'tpl-two', name: 'two box', channel: 1, actor: 'سارا' },
      [ONE, THREE],
    );

    expect(document.querySelector('.cg-tpl-pick[data-template-selected]')).toBeNull();
    expect(button(/^Load onto Layer 3$/)?.disabled, 'nothing left to load').toBe(true);
    const line = messageText();
    expect(line).toBe(`“${LRI}two box${PDI}” was removed on another console by ${RLI}سارا${PDI}.`);
    expect(line).not.toContain('tpl-two');
    expect(line).not.toMatch(/unknown-template|not registered/i);
  });

  it('a console with no sign-in is not named as a person', async () => {
    await openPicker();
    await press(/^Select two box$/);
    await elsewhere(
      { act: 'remove', templateId: 'tpl-two', name: 'two box', channel: 1, actor: 'console' },
      [ONE, THREE],
    );
    expect(messageText()).toBe(`“${LRI}two box${PDI}” was removed on another console.`);
  });

  it('a removal from ANOTHER channel’s list leaves this channel’s choice alone', async () => {
    await openPicker(1);
    await press(/^Select two box$/);
    await elsewhere(
      { act: 'remove', templateId: 'tpl-two', name: 'two box', channel: 2, actor: 'Reza' },
      [ONE, TWO, THREE],
    );
    expect(
      document
        .querySelector('.cg-tpl-pick[data-template-selected]')
        ?.getAttribute('data-template-selected'),
    ).toBe('tpl-two');
    expect(messageText()).toBe('');
  });

  it('🔴 this console’s own removal is its own: no “another console” line', async () => {
    await openPicker();
    await press(/^Select two box$/);
    await press(/Remove two box from CH 1/);
    await press(/^Remove from CH 1$/);

    expect(listed()).toEqual(['tpl-one', 'tpl-three']);
    expect(document.body.textContent).not.toMatch(/another console/i);
    // And the mark was spent: a later Load refusal is not explained by this console's own act.
    expect(recentRemovalElsewhere('tpl-two', 1)).toBeNull();
  });

  it('closed, it follows nothing: the subscriptions go with the dialog', async () => {
    await openPicker();
    expect(changed.length).toBeGreaterThan(0);
    await press(/^Cancel$/);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(changed).toEqual([]);
  });
});

describe('`B-300` — a Load already on its way', () => {
  it('a Load refused within the window reads the removal; after it, or for an own act, nothing is claimed', async () => {
    const seen: TemplateAct[] = [];
    const off = subscribeTemplateActs((a) => seen.push(a));
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t0);

    publish({ act: 'remove', templateId: 'tpl-late', name: 'late', channel: null, actor: 'Reza' });
    expect(seen).toHaveLength(1);
    // A removal that named no channel removed it from every channel.
    expect(recentRemovalElsewhere('tpl-late', 3)).toBe(
      `“${LRI}late${PDI}” was removed on another console by ${LRI}Reza${PDI}.`,
    );
    // Another template is not explained by it.
    expect(recentRemovalElsewhere('tpl-other', 3)).toBeNull();

    vi.spyOn(Date, 'now').mockReturnValue(t0 + REMEMBERED_MS);
    expect(recentRemovalElsewhere('tpl-late', 3), 'the window has passed').toBeNull();

    // An own removal, marked before the request: never another console's.
    noteOwnRemoval('tpl-mine', 1);
    publish({ act: 'remove', templateId: 'tpl-mine', channel: 1, actor: 'Sara' });
    expect(recentRemovalElsewhere('tpl-mine', 1)).toBeNull();
    // A withdrawn mark (CG Bridge refused) claims nothing: the same act from elsewhere counts.
    const withdraw = noteOwnRemoval('tpl-refused', 1);
    withdraw();
    publish({ act: 'remove', templateId: 'tpl-refused', channel: 1, actor: 'Reza' });
    expect(recentRemovalElsewhere('tpl-refused', 1)).not.toBeNull();
    off();
  });
});

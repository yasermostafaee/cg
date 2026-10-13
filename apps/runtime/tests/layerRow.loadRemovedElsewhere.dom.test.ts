// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import type { TemplateAct } from '@cg/shared-ipc';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import { __resetTemplateActsForTest } from '../src/renderer/features/library/templateActs.js';
import { renderLayerRow, slotWith, templateWith } from './support/layerRow.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`B-300`) — **A LOAD ALREADY ON ITS WAY.** The operator chose a template and
 * pressed Load; another console removed it before the Load reached CG Bridge, which refused it
 * `unknown-template`. That code's own sentence — "re-import it" — is about a different situation, so
 * within the window the row's refusal says what happened. Control: the same refusal with no removal
 * keeps the code's sentence.
 */

const TEMPLATE = templateWith({ templateId: 'tpl-news', name: 'زیرنویس خبر' });
const LRI = String.fromCodePoint(0x2066);
const RLI = String.fromCodePoint(0x2067);
const PDI = String.fromCodePoint(0x2069);

let rendered: Awaited<ReturnType<typeof renderLayerRow>> | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  clearPortals();
  __resetTemplateActsForTest();
  vi.restoreAllMocks();
});

/** Load `TEMPLATE` onto an empty row through LOAD → select → commit; `removedOnTheWay` races it. */
async function loadRefused(removedOnTheWay: TemplateAct | null): Promise<string[]> {
  rendered = await renderLayerRow({
    item: null,
    template: null,
    slot: slotWith({ binding: null, observed: { kind: 'empty' } }),
  });
  let acted: ((a: TemplateAct) => void)[] = [];
  const cg = (
    window as unknown as {
      cg: {
        templates: Record<string, unknown>;
        fixedLayers: Record<string, unknown>;
      };
    }
  ).cg;
  cg.templates['list'] = () => Promise.resolve([TEMPLATE]);
  cg.templates['onActed'] = (h: (a: TemplateAct) => void) => {
    acted.push(h);
    return () => {
      acted = acted.filter((x) => x !== h);
    };
  };
  cg.fixedLayers['load'] = () => {
    // CG Bridge publishes the removal; the Load lands after it and is refused.
    if (removedOnTheWay !== null) for (const h of [...acted]) h(removedOnTheWay);
    return Promise.resolve({ accepted: false, errorCode: 'unknown-template' });
  };
  const errors: string[] = [];
  const off = onCommandError((m) => errors.push(m));

  const click = async (selector: string): Promise<void> => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el === null) throw new Error(`nothing at ${selector}`);
    await act(async () => {
      el.click();
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  await click('button[aria-label="LOAD"]');
  await click('[data-template-id="tpl-news"] .cg-tpl-row__load');
  await click('[data-template-commit]');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  off();
  return errors;
}

it('🔴 refused while a removal on another console was on its way: the row says who removed it', async () => {
  const errors = await loadRefused({
    act: 'remove',
    templateId: 'tpl-news',
    name: 'زیرنویس خبر',
    channel: 1,
    actor: 'Reza',
  });
  expect(errors).toEqual([
    `“${RLI}زیرنویس خبر${PDI}” was removed on another console by ${LRI}Reza${PDI}.`,
  ]);
});

it('control: the same refusal with no removal keeps the code’s own sentence', async () => {
  const errors = await loadRefused(null);
  expect(errors).toHaveLength(1);
  expect(errors[0]).not.toMatch(/another console/);
  expect(errors[0]).toMatch(/re-import it/);
});

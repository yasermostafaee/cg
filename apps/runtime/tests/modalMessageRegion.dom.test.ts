// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedSlotState } from '@cg/shared-ipc';
import { Modal, ModalAction } from '../src/renderer/ui/Modal.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { __resetDelimitersForTest } from '../src/renderer/features/inspector/delimiterStore.js';
import { clearPortals, openDialog } from './support/dialog.js';
import {
  clickSetupButton,
  renderStationSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * ONE MESSAGE REGION FOR EVERY MODAL — asserted as a CENSUS, not per dialog.
 *
 * ── WHY THIS FILE EXISTS BESIDE `modalPrimitive.dom.test.ts` ────────────────
 *
 * That file proves the PRIMITIVE pins its message outside the scroll container.
 * It proved nothing about whether the dialogs use it, and three of them did not:
 * `Live sources` and `Server connection` adopted the region and handed it a node
 * carrying their own `color: colors.error` (2.13:1 on the dialog surface — the
 * owner's report), and `Text file delimiters` skipped the region entirely and
 * rendered `<p role="alert">` as the last child of its scrolling body, which is
 * the exact defect the region was built to end.
 *
 * ── `STATION-SETUP-02` — FOUR DIALOGS BECAME FOUR SECTIONS OF ONE ─────────────
 *
 * Those four dialogs are now sections of Station setup, and the claim this census makes is
 * sharper for it: a refusal raised by ANY section must reach the ONE pinned region, with the
 * section named, so the operator never hunts for the section that raised it. The four
 * rendered specs below drive one section each and assert the same three properties.
 *
 * ── WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT ──────────────────────────
 *
 * The MECHANISM: the message is a `[data-notice]` inside `[data-modal-message]`,
 * that region is not inside `[data-modal-body]`, and the dialog's own body
 * contains no announcement of its own. NEVER a colour — a test that pinned
 * `#FCD34D` would go red the next time the palette moves and would say nothing
 * about whether the shared rule is being followed. The contrast ratios that
 * justify the palette are recorded in `ui/Notice.tsx`, where the values are.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  await unmountStationSetup();
  clearPortals();
  __resetSourcesForTest();
  __resetDelimitersForTest();
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the dialog did not open');
  return dialog;
}

/**
 * THE ONE CHECK EVERY DIALOG OWES.
 *
 * Three properties, and each of them is a defect that actually shipped:
 *
 *  1. the message is rendered by the shared `Notice` (`[data-notice]`) — the
 *     three dialogs that passed a styled node of their own failed this;
 *  2. it is inside the primitive's pinned region and NOT inside the scrolling
 *     body — `Text file delimiters` failed this;
 *  3. the body announces nothing of its own — the same failure stated from the
 *     other side, so a dialog cannot satisfy (1) and (2) with a second copy while
 *     still shouting from inside the scroll.
 */
function expectMessageThroughTheRegion(dialog: HTMLElement, role: 'refusal' | 'notice'): void {
  const region = dialog.querySelector('[data-modal-message]');
  expect(region, 'the dialog must show its message at all').not.toBeNull();

  const notice = region?.querySelector(`[data-notice="${role}"]`);
  expect(notice, `the message must be a shared Notice of role "${role}"`).not.toBeNull();

  const body = dialog.querySelector('[data-modal-body]');
  expect(body?.contains(region as Node) ?? false, 'the message is inside the scrolling body').toBe(
    false,
  );

  // …and the body carries no announcement of its own.
  expect(body?.querySelectorAll('[role="alert"]').length ?? 0).toBe(0);
  expect(body?.querySelectorAll('[data-notice]').length ?? 0).toBe(0);
}

describe('the census — every section of Station setup that can speak, speaks through the region', () => {
  /** `Candidate layers`: the reference implementation, now a section. */
  it('Candidate layers routes a bridge refusal through the region, and names itself', async () => {
    const slots: FixedSlotState[] = Array.from({ length: 30 }, (_, i) => ({
      channel: 1,
      layer: 70 + i,
      observed: { kind: 'empty' as const },
      binding: null,
    }));
    stationSetupStub({
      bank: { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 30, aliases: {} },
      slots,
      fixedSetConfigResult: {
        ok: false,
        reason: 'untick-occupied',
        message: 'Layer 95 has a template on it.',
      },
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    await clickSetupButton(dialog, 'Apply candidate layers');

    expectMessageThroughTheRegion(dialog, 'refusal');
    // BOTH lines survive the move into the primitive: the RULE and the bridge's
    // own sentence, which names the layer — and the SECTION that raised it.
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(text).toContain('Candidate layers:');
    expect(text).toContain('remove its template first');
    expect(text).toContain('Layer 95 has a template on it.');
  });

  /** `Live sources`: adopted the region, kept its own 2.13:1 red. */
  it('Live sources routes its refusal through the region', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'sources' });
    // Add with an empty name: the form's own refusal, no bridge round-trip needed.
    await clickSetupButton(dialog, 'Add');

    expectMessageThroughTheRegion(dialog, 'refusal');
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(text).toContain('Live sources:');
    expect(text).toContain('Give the source a name');
  });

  /** `Text file delimiters`: the full drift — wrong place AND wrong colour. */
  it('Text file delimiters routes its refusal through the region, not the body', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'delimiters' });
    // The delimiter section's Add — the second "Add" in the dialog, so it is found
    // inside its own section rather than by label alone.
    const section = dialog.querySelector('[data-station-section="delimiters"]');
    const add = [...(section?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Add',
    );
    if (add === undefined) throw new Error('no Add in the delimiters section');
    await act(async () => {
      add.click();
      await Promise.resolve();
    });
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    expectMessageThroughTheRegion(dialog, 'refusal');
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(text).toContain('Text file delimiters:');
    expect(text).toContain('Give the delimiter a name');
  });

  /**
   * `Servers`: FOUR private treatments for one thing, once. The on-air block is a
   * REFUSAL, and since `STATION-SETUP-02` it names its scope — the other sections are
   * not gated and the message must not read as if they were.
   */
  it('Servers routes its on-air block through the region as a refusal, scoped to Servers', async () => {
    stationSetupStub({
      items: [{ itemId: 'i1', templateId: 't1', fields: {}, status: 'on-air', pending: false }],
    });
    const dialog = await renderStationSetup({ section: 'servers' });

    expectMessageThroughTheRegion(dialog, 'refusal');
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(text).toContain('Apply is blocked for Servers');
    expect(text).toContain('Every other section stays editable');
  });

  /**
   * THE DIALOGS THAT SAY NOTHING STILL COUNT — they are the ones most likely to
   * grow a message later, and the region must be the only place it can appear. A
   * dialog with no message renders no region at all, so there is nowhere for a
   * local one to hide beside it.
   */
  it('a dialog with nothing to say renders no region at all', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Read only',
        onClose: () => undefined,
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
        children: 'body',
      }),
    );
    expect(dialog.querySelector('[data-modal-message]')).toBeNull();
    expect(dialog.querySelector('[data-notice]')).toBeNull();
  });
});

/**
 * 🔴 **THE CENSUS IS DERIVED — a new dialog enrols itself.**
 *
 * The rendered specs above name ONE dialog BY IMPORT, and that is the weakness a census
 * is supposed to close: the dialog that breaks the rule is, by definition, the one nobody
 * added to the list. So the enumeration comes from the TREE — every module under
 * `features/**` that imports the `Modal` primitive — and the invariants below are asserted
 * against every one of them, including modules written after this file.
 *
 * ── WHY THESE THREE, AND WHY THEY ARE STATIC ────────────────────────────────
 *
 * A derived census cannot render each dialog: every one needs its own bridge stubs, and a
 * harness that guessed them would assert against a component crashing on `undefined` rather
 * than against the rule. What it CAN do is read the source for the three ways a dialog
 * bypasses the primitive while still importing it — each of which actually happened before
 * the primitive existed, and each of which is invisible to a rendered spec that does not
 * exercise the offending state.
 *
 * The rendered specs above stay: they are the DEPTH (does the message actually route through
 * the region under a real refusal), and this is the BREADTH. Neither replaces the other.
 */
describe('the census is DERIVED from the tree, not from a list somebody maintains', () => {
  /*
    ⚠ Resolved from the WORKSPACE ROOT, not from `import.meta.url`. Under vitest's jsdom
    transform `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws and the whole
    SUITE fails to collect — which is the loud failure, and the reason the guard below exists
    for the quiet one: a walk that silently returned nothing would make every invariant here
    pass vacuously.
  */
  const featuresDir = join(process.cwd(), 'src', 'renderer', 'features');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) ? [full] : [];
    });
  }

  /** Every feature module that builds a dialog on the primitive, discovered not listed. */
  const modalImporters = walk(featuresDir)
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /from '.*ui\/Modal\.js'/.test(source));

  const relative = (path: string): string => path.slice(featuresDir.length + 1).replace(/\\/g, '/');

  it('finds the dialogs the tree actually holds — the derivation works', () => {
    // A guard on the instrument itself. If the walk broke — a moved directory, a changed
    // import path — it would return an empty set and every invariant below would pass
    // vacuously, which is the failure mode a derived census is most exposed to.
    const names = modalImporters.map((m) => relative(m.path)).sort();
    /*
      `STATION-SETUP-02` — four Modal-importing modules became ONE (`StationSetupDialog`),
      so the set SHRANK by three; the guard names what must still be in it rather than a
      count that would have gone stale. Every entry here is a dialog that exists today, and
      Station setup is enrolled by the same rule as the rest: it imports the primitive.
    */
    for (const known of [
      'stationSetup/StationSetupDialog.tsx',
      'audit/AuditPanel.tsx',
      'layers/LiveSourceSwapDialog.tsx',
      'layers/LivePlateAudioDialog.tsx',
      'fixedLayers/useTemplatePicker.tsx',
    ]) {
      expect(names, `${known} fell out of the derived set`).toContain(known);
    }
    // …and the three dialogs that were FOLDED into Station setup are gone, not duplicated.
    for (const gone of [
      'connections/ServerSettingsPanel.tsx',
      'sources/SourcesModal.tsx',
      'inspector/DelimitersModal.tsx',
      'fixedLayers/FixedBankConfigModal.tsx',
    ]) {
      expect(names, `${gone} still builds a second dialog`).not.toContain(gone);
    }
  });

  /**
   * The scrim SHAPE — `position: 'fixed'` AND a full-bleed `inset: 0` DECLARATION.
   *
   * ⚠ Both halves, and the `inset` matched as a declaration (leading whitespace, trailing
   * comma) rather than anywhere in the text. The first spelling of this check tested only
   * `/inset:\s*0/` against the whole file and flagged `monitors/RehearsalStage.tsx`, whose
   * only match is inside a COMMENT reading _"Centred and sized to the SCALED FRAME by the
   * caller — not `inset: 0`"_ — a module arguing for the opposite of what it was accused of.
   * A census that cries wolf gets an exception list added to silence it, and the exception
   * list is where a real offender then hides.
   */
  const hasScrim = (source: string): boolean =>
    /position: 'fixed'/.test(source) && /^\s*inset: 0,/m.test(source);

  it('no dialog hand-rolls a second SCRIM', () => {
    for (const { path, source } of modalImporters) {
      expect(hasScrim(source), `${relative(path)} declares its own scrim`).toBe(false);
    }
  });

  it('no dialog declares its own dialog ROLE — the chrome comes from the primitive', () => {
    for (const { path, source } of modalImporters) {
      expect(/role="dialog"/.test(source), `${relative(path)} sets role="dialog"`).toBe(false);
      expect(/aria-modal/.test(source), `${relative(path)} sets aria-modal`).toBe(false);
    }
  });

  it('every dialog with an action row resolves its treatments from the ROLE table', () => {
    // The `runtime-modal-contract` rule: a dialog says what KIND of action a button is and
    // the role decides the treatment. A footer built from bare `Button`s is a dialog picking
    // colours again, which is how `SERVER CONNECTION`'s ordinary save came to wear the solid
    // amber that means "this will interrupt something".
    for (const { path, source } of modalImporters) {
      if (!source.includes('footer={')) continue;
      expect(
        /\bModalAction\b|\bmodalActionVariant\b/.test(source),
        `${relative(path)} builds an action row without the role table`,
      ).toBe(true);
    }
  });

  /**
   * ⚠ **WHAT THIS CENSUS STILL CANNOT SEE.** Recorded here rather than in a handoff, because
   * a blind spot nobody can point at is one the next session rediscovers.
   *
   *  1. **A dialog that hand-rolls its own scrim INSTEAD of importing `Modal`.** The
   *     enrolment key is the import, so a surface that never imports the primitive is not in
   *     the set at all. `LockOverlay` does exactly that, legitimately and by a documented
   *     decision. A cheap check EXISTS and is asserted below — the scrim shape is
   *     distinctive — so this one is closed rather than merely named.
   *  2. **Anything about SIZE.** `prose` vs `wide` turns on whether the operator compares
   *     values down a column, which is a claim about CONTENT MEANING. No static rule and no
   *     jsdom rendering can decide it; it is a judgement, and it lives in the spec and in
   *     review. Station setup is `wide` by that judgement (two per-row tables), stated in
   *     its own header. Do not add a heuristic here.
   *  3. **Whether a dialog's message routes through the region in a state no spec
   *     exercises.** The rendered specs above cover the refusal each section is known to
   *     produce; a NEW message added to a section and rendered into the body is invisible
   *     to both halves of this file until someone writes the spec that triggers it. The
   *     mitigation is structural: `ModalProps.message` takes DATA, not a `ReactNode`, and a
   *     section can only reach the region through `report`.
   */
  it('CLOSES blind spot 1: no feature module outside the set hand-rolls a full-window scrim', () => {
    const HAND_ROLLED_BY_DESIGN = new Set([
      // `Modal.tsx`'s own note: a lock screen with a way out is not a lock, so it must not
      // inherit the primitive's ✕ / Escape / backdrop. It DOES share the focus trap
      // (`B-229`), which is the half that was wrongly withheld with them.
      'lock/LockOverlay.tsx',
    ]);

    const offenders = walk(featuresDir)
      .filter((path) => hasScrim(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((name) => !HAND_ROLLED_BY_DESIGN.has(name));

    // The instrument is live: the ONE module on the exception list really does match, so an
    // empty `offenders` means "nothing else does" rather than "the pattern matches nothing".
    expect(
      walk(featuresDir)
        .filter((p) => hasScrim(readFileSync(p, 'utf8')))
        .map(relative),
      'the scrim pattern matches nothing at all — the check is dead',
    ).toContain('lock/LockOverlay.tsx');

    expect(offenders, 'a feature hand-rolls a full-window overlay outside the primitive').toEqual(
      [],
    );
  });
});

describe('the ROLE decides the treatment, exactly as it does for the action buttons', () => {
  it('maps the two roles to two announcement channels', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Roles',
        onClose: () => undefined,
        message: [
          { role: 'refusal' as const, text: 'why it did not happen', detail: 'the specifics' },
          { role: 'notice' as const, text: 'what happened when it worked' },
        ],
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );

    // A refusal is ASSERTIVE — it is always the consequence of something the
    // operator just did. A neutral outcome is not.
    expect(dialog.querySelector('[data-notice="refusal"]')?.getAttribute('role')).toBe('alert');
    expect(dialog.querySelector('[data-notice="notice"]')?.getAttribute('role')).toBe('status');
    // Both lines of a refusal are rendered; the detail is not swallowed.
    expect(dialog.querySelector('[data-notice="refusal"]')?.textContent).toContain('the specifics');
  });

  it('a role never resolves to two treatments across dialogs', async () => {
    // The same claim §2 makes for the button roles, and it has to be made across
    // TWO renderings for the same reason: "one treatment per role" is a statement
    // about every dialog, and a single dialog cannot make it.
    const first = await render(
      createElement(Modal, {
        title: 'One',
        onClose: () => undefined,
        message: { role: 'refusal' as const, text: 'a' },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );
    const firstStyle = first.querySelector<HTMLElement>('[data-notice="refusal"]')?.style.cssText;
    expect(firstStyle).toBeTruthy();
    await act(async () => {
      root?.unmount();
    });
    root = null;
    clearPortals();

    const second = await render(
      createElement(Modal, {
        title: 'Two',
        onClose: () => undefined,
        message: { role: 'refusal' as const, text: 'b — a different sentence entirely' },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'Close' }),
      }),
    );
    expect(second.querySelector<HTMLElement>('[data-notice="refusal"]')?.style.cssText).toBe(
      firstStyle,
    );
  });

  /**
   * PERSIAN / RTL — these strings sit beside RTL content, and a bridge's own
   * message may itself be Persian.
   *
   * `dir="auto"` on the message lines, so the paragraph direction follows the
   * TEXT rather than the chrome: a Persian refusal reads right-to-left with its
   * full stop in the right place, while an English one beside it is unaffected.
   * Asserted as the attribute rather than by measuring, because jsdom computes no
   * layout — the attribute IS the mechanism (`inspector.dirAuto` makes the same
   * call for the field editors).
   */
  it('lets the message direction follow the message, not the chrome', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'RTL',
        onClose: () => undefined,
        message: {
          role: 'refusal' as const,
          text: 'این ردیف اشغال است — ابتدا تمپلیت آن را حذف کنید.',
          detail: 'لایه ۹۵ یک تمپلیت روی خود دارد.',
        },
        footer: createElement(ModalAction, { actionRole: 'cancel', children: 'بستن' }),
      }),
    );
    const lines = [...(dialog.querySelector('[data-notice="refusal"]')?.children ?? [])];
    expect(lines.length, 'both the rule and the specifics are rendered').toBe(2);
    for (const line of lines) expect(line.getAttribute('dir')).toBe('auto');
  });
});

import {
  CONSOLE_ACTOR,
  TEMPLATE_ACTOR,
  UNATTRIBUTED_ACTOR,
  type TemplateAct,
} from '@cg/shared-ipc';
import { isolateText } from '../../ui/OperatorNames.js';
import { displayLabel } from './templateName.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`B-300`) — **WHO CHANGED THE TEMPLATE LIST, AS THIS CONSOLE READS IT.**
 *
 * The owner, two consoles on one CG Bridge: a template removed on A stayed in B's open picker, and
 * B's Load of it was refused as `unknown-template` — internal words for something a person did on
 * the other machine. CG Bridge now says who did what (`templates.acted`); this module is where the
 * console decides whether an act was ANOTHER console's, and words it.
 *
 * ⭐ **"Another console" is decided HERE, from what this console asked for.** The bridge tells every
 * console, this one included, and it cannot tell two consoles of one user apart. This console knows
 * the removals it asked for — {@link noteOwnRemoval} marks one before the request goes out — so a
 * removal that matches a mark is its own and is never reported as someone else's.
 *
 * One subscription for the whole console, made the first time anything here is used and re-made if
 * the bridge object is replaced: the picker is mounted by every row, and a subscription per row would
 * be thirty of them for one dialog. A removal is remembered for {@link REMEMBERED_MS}, so a Load that
 * was already on its way when the removal landed reads the same line ({@link removedElsewhereLine}).
 */

/** How long a removal elsewhere explains a refused Load of it. */
export const REMEMBERED_MS = 10_000;

/** An act and whether this console made it. */
export type TemplateActListener = (act: TemplateAct, fromHere: boolean) => void;

interface Mark {
  readonly templateId: string;
  readonly channel: number | null;
  readonly at: number;
}

let boundTo: unknown = null;
let unbind: (() => void) | null = null;
const ownRemovals: Mark[] = [];
const elsewhere: { readonly act: TemplateAct; readonly at: number }[] = [];
const listeners = new Set<TemplateActListener>();

function sameTarget(mark: Mark, act: TemplateAct): boolean {
  return mark.templateId === act.templateId && mark.channel === act.channel;
}

function dropOlder<T extends { readonly at: number }>(list: T[], now: number): void {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    if (entry !== undefined && now - entry.at >= REMEMBERED_MS) list.splice(i, 1);
  }
}

function forget(now: number): void {
  dropOlder(ownRemovals, now);
  dropOlder(elsewhere, now);
}

function receive(act: TemplateAct): void {
  const now = Date.now();
  forget(now);
  let fromHere = false;
  if (act.act === 'remove') {
    const mine = ownRemovals.findIndex((m) => sameTarget(m, act));
    fromHere = mine >= 0;
    if (fromHere) ownRemovals.splice(mine, 1);
    else elsewhere.push({ act, at: now });
  }
  for (const listener of [...listeners]) listener(act, fromHere);
}

/** Listen to CG Bridge's acts on this console's bridge — once, however many surfaces ask. */
function bind(): void {
  const cg: unknown = window.cg;
  if (boundTo === cg) return;
  unbind?.();
  boundTo = cg;
  unbind = window.cg.templates.onActed(receive);
}

/** Every act CG Bridge publishes from now on, with whether this console made it; returns an unsubscribe. */
export function subscribeTemplateActs(listener: TemplateActListener): () => void {
  bind();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mark a removal THIS console is about to ask for, so its publish is read as this console's own.
 * Returns the withdrawal, for a removal CG Bridge refused (a refused act publishes nothing, and a mark
 * left behind would claim another console's removal of the same template).
 */
export function noteOwnRemoval(templateId: string, channel: number | undefined): () => void {
  bind();
  const mark: Mark = { templateId, channel: channel ?? null, at: Date.now() };
  ownRemovals.push(mark);
  return () => {
    const i = ownRemovals.indexOf(mark);
    if (i >= 0) ownRemovals.splice(i, 1);
  };
}

/**
 * The line for a removal another console made: `“<name>” was removed on another console by <user>.`
 * Each name in its own isolate (golden rule 11); the template by its operator name, never its id; and
 * no `by` clause when CG Bridge knows no person (a console with no sign-in), rather than naming one.
 */
export function removedElsewhereLine(act: TemplateAct): string {
  const name = displayLabel(act);
  const what = name === undefined ? 'A template' : `“${isolateText(name)}”`;
  const nobody = [CONSOLE_ACTOR, UNATTRIBUTED_ACTOR, TEMPLATE_ACTOR].includes(act.actor);
  return `${what} was removed on another console${nobody ? '' : ` by ${isolateText(act.actor)}`}.`;
}

/** Tests only: forget every mark, removal, listener and subscription. */
export function __resetTemplateActsForTest(): void {
  unbind?.();
  unbind = null;
  boundTo = null;
  ownRemovals.length = 0;
  elsewhere.length = 0;
  listeners.clear();
}

/**
 * The line for `templateId` on `channel`, when another console removed it in the last
 * {@link REMEMBERED_MS}; `null` otherwise. A removal that named no channel removed it from every one.
 */
export function recentRemovalElsewhere(templateId: string, channel: number): string | null {
  forget(Date.now());
  const hit = [...elsewhere]
    .reverse()
    .find((r) => r.act.templateId === templateId && (r.act.channel ?? channel) === channel);
  return hit === undefined ? null : removedElsewhereLine(hit.act);
}

import type { FieldValues } from '@cg/shared-schema';
import type { TemplateRuntime } from '../types.js';

/**
 * CasparCG's HTML producer calls bare global functions on the page:
 * `play(payload?)`, `update(payload?)`, `stop()`, `next()`, `remove()`.
 * Payloads arrive as strings — either JSON or legacy XML.
 *
 * This installer wires those globals to the typed runtime. JSON is the
 * canonical wire format; legacy XML is parsed via a lightweight shim
 * (XML support deferred until we encounter a station that needs it).
 *
 * Returns a cleanup function that restores any prior global values.
 * Useful in tests to avoid pollution between cases.
 */
export function installCasparGlobals(
  runtime: TemplateRuntime,
  win: Window & typeof globalThis = window,
): () => void {
  const previousPlay = win.play;
  const previousUpdate = win.update;
  const previousStop = win.stop;
  const previousNext = win.next;
  const previousRemove = win.remove;
  const previousCg = win.cg;

  win.play = (payload?: string) => {
    void runtime.play(parsePayload(payload) as FieldValues);
  };
  win.update = (payload?: string) => {
    void runtime.update(parsePayload(payload));
  };
  // window.stop already exists in lib.dom (it cancels page loads). We're
  // overriding it intentionally for the broadcast template — the page
  // isn't loading anything by this point, so the original behavior is
  // irrelevant. Cast through unknown to satisfy the no-conflict check.
  (win as unknown as { stop: () => void }).stop = () => {
    void runtime.stop();
  };
  win.next = () => {
    void runtime.next?.();
  };
  win.remove = () => {
    runtime.remove();
  };
  win.cg = runtime;

  return () => {
    if (previousPlay !== undefined) win.play = previousPlay;
    else delete win.play;
    if (previousUpdate !== undefined) win.update = previousUpdate;
    else delete win.update;
    // window.stop is non-optional in lib.dom; always restore (the original
    // is the no-op page-load-canceller).
    (win as unknown as { stop: () => void }).stop = previousStop;
    if (previousNext !== undefined) win.next = previousNext;
    else delete win.next;
    if (previousRemove !== undefined) win.remove = previousRemove;
    else delete win.remove;
    if (previousCg !== undefined) win.cg = previousCg;
    else delete win.cg;
  };
}

function parsePayload(s?: string): Partial<FieldValues> {
  if (!s) return {};
  const trimmed = s.trim();
  if (trimmed.startsWith('<')) {
    // Legacy XML payload — deferred. Stations migrating from existing
    // CG systems will need this; for M3 we accept the raw string and
    // pass through (operator gets one update with no fields applied).
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Partial<FieldValues>;
  } catch {
    // Unparseable payload — silently drop. Real production logs this
    // via the audit channel; the broadcast template can't write logs.
  }
  return {};
}

declare global {
  interface Window {
    play?: (payload?: string) => void;
    update?: (payload?: string) => void;
    next?: () => void;
    remove?: () => void;
    cg?: TemplateRuntime;
  }
}

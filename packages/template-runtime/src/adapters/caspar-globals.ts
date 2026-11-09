import { readCgControl, stripCgControl, withCgControl, type FieldValues } from '@cg/shared-schema';
import type { OutputPass, TemplateRuntime } from '../types.js';

export function casparOutputPass(search: string): OutputPass {
  const pass = new URLSearchParams(search).get('cgpass');
  return pass === 'background' || pass === 'foreground' ? pass : 'full';
}

type PairedPageVerb = 'update' | 'stop' | 'next' | 'remove' | 'out';

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
  const previousOut = win.out;
  const previousCg = win.cg;

  const pass = casparOutputPass(win.location.search);
  const syncKey = new URLSearchParams(win.location.search).get('cgsync');
  const channel =
    pass !== 'full' && syncKey && typeof win.BroadcastChannel === 'function'
      ? new win.BroadcastChannel('cg-live-foreground:' + syncKey)
      : undefined;
  const forward = (verb: PairedPageVerb, fields?: Partial<FieldValues>): void => {
    if (pass !== 'background' || channel === undefined) return;
    const { take: _take, ...control } = readCgControl(fields) ?? {};
    const safe =
      fields === undefined
        ? undefined
        : withCgControl(stripCgControl(fields) as FieldValues, control);
    channel.postMessage({ verb, fields: safe });
  };
  if (pass === 'foreground') {
    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (message === null || typeof message !== 'object' || !('verb' in message)) return;
      switch (message.verb) {
        case 'update': {
          const fields = 'fields' in message ? message.fields : undefined;
          if (fields !== null && typeof fields === 'object') {
            void runtime.update(fields as Partial<FieldValues>);
          }
          break;
        }
        case 'stop':
          void runtime.stop();
          break;
        case 'next':
          void runtime.next?.();
          break;
        case 'remove':
          runtime.remove();
          break;
        case 'out':
          void runtime.out();
          break;
      }
    });
  }

  win.play = (payload?: string | Record<string, unknown>) => {
    void runtime.play(coercePayload(payload) as FieldValues);
  };
  win.update = (payload?: string | Record<string, unknown>) => {
    const fields = coercePayload(payload);
    forward('update', fields);
    void runtime.update(fields);
  };
  // window.stop already exists in lib.dom (it cancels page loads). We're
  // overriding it intentionally for the broadcast template — the page
  // isn't loading anything by this point, so the original behavior is
  // irrelevant. Cast through unknown to satisfy the no-conflict check.
  (win as unknown as { stop: () => void }).stop = () => {
    forward('stop');
    void runtime.stop();
  };
  win.next = () => {
    forward('next');
    void runtime.next?.();
  };
  win.remove = () => {
    forward('remove');
    runtime.remove();
  };
  // D-105 — the coordinated animated exit (distinct from `stop()`'s quick clear).
  win.out = () => {
    forward('out');
    void runtime.out();
  };
  win.cg = runtime;

  return () => {
    channel?.close();
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
    if (previousOut !== undefined) win.out = previousOut;
    else delete win.out;
    if (previousCg !== undefined) win.cg = previousCg;
    else delete win.cg;
  };
}

/**
 * Accept what CasparCG (a JSON/XML *string*) and a direct `window.update({…})`
 * caller (an already-parsed *object*) both send. JSON stays canonical; unknown
 * keys are harmless (bindings only apply declared fields).
 */
function coercePayload(payload?: string | Record<string, unknown>): Partial<FieldValues> {
  if (payload === undefined || payload === null) return {};
  if (typeof payload === 'string') return parsePayload(payload);
  if (typeof payload === 'object') return payload as Partial<FieldValues>;
  return {};
}

function parsePayload(s: string): Partial<FieldValues> {
  const trimmed = s.trim();
  if (trimmed === '') return {};
  if (trimmed.startsWith('<')) return parseCasparXml(trimmed);
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Partial<FieldValues>;
  } catch {
    // Unparseable payload — silently drop. Real production logs this
    // via the audit channel; the broadcast template can't write logs.
  }
  return {};
}

/**
 * Parse CasparCG's legacy template-data XML into `{ key: value }`:
 *   <templateData>
 *     <componentData id="f0"><data id="text" value="Hello"/></componentData>
 *     …
 *   </templateData>
 * Each `componentData id` is a field key; its inner `<data … value="…"/>` holds
 * the value. Regex-based (no DOMParser) so it runs identically in the broadcast
 * frame and in tests; entities in the value are decoded.
 */
function parseCasparXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const comp = /<componentData\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/componentData>/gi;
  let m: RegExpExecArray | null;
  while ((m = comp.exec(xml)) !== null) {
    const key = decodeXmlEntities(m[1] ?? '');
    if (key === '') continue;
    const dataM = /<data\b[^>]*\bvalue="([^"]*)"/i.exec(m[2] ?? '');
    if (dataM !== null) out[key] = decodeXmlEntities(dataM[1] ?? '');
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" decodes to "&lt;" not "<"
}

declare global {
  interface Window {
    play?: (payload?: string | Record<string, unknown>) => void;
    update?: (payload?: string | Record<string, unknown>) => void;
    next?: () => void;
    remove?: () => void;
    out?: () => void;
    cg?: TemplateRuntime;
  }
}

import { DelimiterOptionSchema, SHIPPED_DELIMITERS, type DelimiterOption } from '@cg/shared-ipc';
import { z } from 'zod';

export const DESIGNER_DELIMITERS_STORAGE_KEY = 'cg-designer.delimiters.v1';

const DelimiterListSchema = z.array(DelimiterOptionSchema).min(1);
let cache: DelimiterOption[] | null = null;
let version = 0;
let generated = 0;
const listeners = new Set<() => void>();

function shipped(): DelimiterOption[] {
  return SHIPPED_DELIMITERS.map((option) => ({ ...option }));
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function hasUniqueIdentity(options: readonly DelimiterOption[]): boolean {
  return (
    new Set(options.map((option) => option.id)).size === options.length &&
    new Set(options.map((option) => option.value)).size === options.length
  );
}

function ensureCache(): DelimiterOption[] {
  if (cache !== null) return cache;
  const raw = storage()?.getItem(DESIGNER_DELIMITERS_STORAGE_KEY);
  if (raw !== null && raw !== undefined) {
    try {
      const parsed = DelimiterListSchema.safeParse(JSON.parse(raw));
      if (parsed.success && hasUniqueIdentity(parsed.data)) {
        cache = parsed.data.map((option) => ({ ...option }));
        return cache;
      }
    } catch {
      // A damaged browser preference cannot empty the authoring picker.
    }
  }
  cache = shipped();
  return cache;
}

function publish(next: DelimiterOption[]): void {
  cache = next;
  try {
    storage()?.setItem(DESIGNER_DELIMITERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The list still works for this session when browser persistence is unavailable.
  }
  version += 1;
  for (const listener of [...listeners]) listener();
}

function validateDraft(
  label: string,
  value: string,
  exceptId?: string,
): { label: string } | string {
  const trimmedLabel = label.trim();
  if (trimmedLabel === '') return 'Give the delimiter a name.';
  if (value === '') return 'The split value cannot be empty.';
  if (ensureCache().some((option) => option.id !== exceptId && option.value === value)) {
    return `“${value}” is already in the list.`;
  }
  return { label: trimmedLabel };
}

function nextId(): string {
  generated += 1;
  let id = `custom-${Date.now().toString(36)}-${String(generated)}`;
  while (ensureCache().some((option) => option.id === id)) {
    generated += 1;
    id = `custom-${Date.now().toString(36)}-${String(generated)}`;
  }
  return id;
}

export function listDesignerDelimiters(): readonly DelimiterOption[] {
  return ensureCache();
}

export function subscribeDesignerDelimiters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function designerDelimitersVersion(): number {
  ensureCache();
  return version;
}

export function addDesignerDelimiter(label: string, value: string): string | null {
  const checked = validateDraft(label, value);
  if (typeof checked === 'string') return checked;
  publish([...ensureCache(), { id: nextId(), label: checked.label, value }]);
  return null;
}

export function updateDesignerDelimiter(id: string, label: string, value: string): string | null {
  const checked = validateDraft(label, value, id);
  if (typeof checked === 'string') return checked;
  const options = ensureCache();
  if (!options.some((option) => option.id === id)) return 'That delimiter no longer exists.';
  publish(
    options.map((option) =>
      option.id === id ? { ...option, label: checked.label, value } : option,
    ),
  );
  return null;
}

export function removeDesignerDelimiter(id: string): string | null {
  const options = ensureCache();
  if (options.length <= 1) return 'At least one delimiter must remain.';
  const next = options.filter((option) => option.id !== id);
  if (next.length === options.length) return null;
  publish(next);
  return null;
}

export function resetDesignerDelimiters(): void {
  publish(shipped());
}

/** Test seam: forget the in-memory snapshot; optionally keep persisted preferences. */
export function __resetDesignerDelimitersForTest(clearStorage = true): void {
  cache = null;
  version = 0;
  generated = 0;
  listeners.clear();
  if (clearStorage) {
    try {
      storage()?.removeItem(DESIGNER_DELIMITERS_STORAGE_KEY);
    } catch {
      // jsdom/browser privacy modes may refuse storage.
    }
  }
}

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { ChannelSettingsStore } from '../src/channel-settings-store.js';
import { DelimiterStore } from '../src/delimiter-store.js';
import { TemplateRegistry, isRegistryRecordName } from '../src/template-registry.js';

/**
 * 🔴 `B-116` — **the registry reads ONLY the files it names, so a sibling config file in
 * `templatesDir` is never mistaken for a corrupt template.**
 *
 * `DelimiterStore` writes `delimiters.json` and `ChannelSettingsStore` writes
 * `channel-settings.json` into the SAME directory the template registry persists to — and
 * the registry's loader read every `*.json` there as a template, so every boot warned that a
 * template was corrupt and told the operator to re-import it, on a machine where nothing was
 * wrong. The second file had never been SEEN only because it is written on the first raster
 * change and the bridge host never had one; the first operator to set a raster from the new
 * Station setup control would have created it.
 *
 * ── THE FIX IS A RULE, NOT A FILENAME ────────────────────────────────────────
 *
 * Not "skip `delimiters.json`", which is wrong on the day the second file lands (it did),
 * and not moving the two files out of `templatesDir`, which is a data migration this session
 * is not authorised to make. The registry derives its record names from ONE function
 * (`#fileFor`: `<slug>-<12 hex of sha256(id)>.json`), so the loader now admits a file iff its
 * name matches that shape — the rule is "a template record is a file this registry would
 * have written", and no sibling store's file can satisfy it by accident.
 *
 * Both sibling files are written here by the REAL stores, not hand-typed, so the test follows
 * the writers rather than an assumption about them.
 */

const INFO: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><body>served</body></html>';

let dir = '';
let stderr: string[] = [];
let restoreStderr: (() => void) | null = null;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-registry-siblings-'));
  stderr = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);
  restoreStderr = () => spy.mockRestore();
});

afterEach(() => {
  restoreStderr?.();
  restoreStderr = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

const templateWarnings = (): string[] =>
  stderr.filter((line) => line.includes('skipping unusable persisted template'));

describe('B-116 — sibling config files beside the templates are not templates', () => {
  it('🔴 RED-FIRST: channel-settings.json and delimiters.json in templatesDir are neither loaded nor warned about', () => {
    // The two writers, exactly as `CasparRuntime` constructs them — with `templatesDir`.
    const raster = new ChannelSettingsStore(dir);
    raster.hydrate([1]);
    expect(raster.set({ channel: 1, raster: { width: 1280, height: 720 } })).toBeNull();
    const delimiters = new DelimiterStore(dir);
    expect(delimiters.set([{ id: 'pipe', label: 'pipe', value: '|' }])).toBeNull();
    expect(fs.existsSync(path.join(dir, 'channel-settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'delimiters.json'))).toBe(true);

    const result = new TemplateRegistry(dir).loadPersisted();

    expect(result).toEqual({ loaded: 0, skipped: 0 });
    expect(templateWarnings()).toEqual([]);
  });

  it('the registry still loads its OWN records from the same directory', () => {
    new TemplateRegistry(dir).import(INFO, HTML);
    // …beside the sibling files.
    new DelimiterStore(dir).set([{ id: 'pipe', label: 'pipe', value: '|' }]);

    const fresh = new TemplateRegistry(dir);
    expect(fresh.loadPersisted()).toEqual({ loaded: 1, skipped: 0 });
    expect(fresh.get('lower-third')).toEqual(INFO);
    expect(fresh.html('lower-third')).toBe(HTML);
    expect(templateWarnings()).toEqual([]);
  });

  it('POSITIVE CONTROL: a GENUINELY unusable record — named as the registry names them — still warns with the same message', () => {
    // Take a real record's name from a real import, then corrupt its contents.
    new TemplateRegistry(dir).import(INFO, HTML);
    const [record] = fs.readdirSync(dir).filter(isRegistryRecordName);
    expect(record).toBeDefined();
    fs.writeFileSync(path.join(dir, record ?? ''), '{"info": "not a template"}\n');

    expect(new TemplateRegistry(dir).loadPersisted()).toEqual({ loaded: 0, skipped: 1 });
    const warnings = templateWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('re-import it to restore');
  });

  it('the rule is the WRITER’s shape, stated once', () => {
    expect(isRegistryRecordName('lower-third-0123456789ab.json')).toBe(true);
    expect(isRegistryRecordName('delimiters.json')).toBe(false);
    expect(isRegistryRecordName('channel-settings.json')).toBe(false);
    expect(isRegistryRecordName('bridge-source-catalog.json')).toBe(false);
    // A record name with the wrong hash width, or a tmp file mid-rename, is not a record.
    expect(isRegistryRecordName('lower-third-0123.json')).toBe(false);
    expect(isRegistryRecordName('lower-third-0123456789ab.json.tmp')).toBe(false);
  });
});

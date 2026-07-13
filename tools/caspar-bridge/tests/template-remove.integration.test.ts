import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-005 — removing a template from the library, and the refusal that makes it safe.
 *
 * The refusal is the whole point. Removing a template that a stack item references does
 * NOT look like a failure: CasparCG already pulled the self-contained HTML into CEF, so a
 * live graphic keeps rendering and `CG UPDATE` keeps working. The break is deferred and
 * silent — `load()` and `take()`'s B-039 re-ADD both guard on the registry, so the item's
 * next out→take can never resolve the template again and the row is dead forever.
 *
 * So these drive the REAL runtime against the producer-lifecycle mock: an item that
 * references a template blocks its removal (on air or merely loaded — both poison equally),
 * and only once the item is gone does removal go through and un-serve the HTML.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function connectionFor(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'single',
    autoFailoverEnabled: false,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third — News',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

async function bootWithTemplate(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const rt = new CasparRuntime(connectionFor(mock.amcpPort, oscPort));
  runtime = rt;
  rt.start();
  await rt.startServing();
  rt.templateImport(TEMPLATE, HTML);
  await rt.whenServerHealthy(HEALTH_MS);
  return rt;
}

describe('templates.remove — R-005', () => {
  it('removes an unreferenced template and un-serves its HTML', async () => {
    const rt = await bootWithTemplate();
    expect(rt.templateList().map((t) => t.templateId)).toEqual(['lower-third']);

    expect(rt.templateRemove('lower-third')).toEqual({ ok: true });

    expect(rt.templateList()).toEqual([]);
    expect(rt.templateGet('lower-third')).toBeNull();
    // Un-serving is free: TemplateHttpServer reads through `templateHtml` per request, so
    // a null here IS a 404 on GET /template/lower-third. No serve-contract change needed.
    expect(rt.templateHtml('lower-third')).toBeNull();
  });

  it('REFUSES removal while a merely-loaded (not on-air) item references it', async () => {
    const rt = await bootWithTemplate();
    expect((await rt.load('item1', 'lower-third', {})).accepted).toBe(true);

    const result = rt.templateRemove('lower-third');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('in-use');
    expect(result.message).toMatch(/1 stack item/i);
    // Refused means NOTHING was removed — the template is still fully loadable.
    expect(rt.templateGet('lower-third')).not.toBeNull();
    expect(rt.templateHtml('lower-third')).toBe(HTML);
  });

  it('REFUSES removal while an ON-AIR item references it', async () => {
    const rt = await bootWithTemplate();
    const slot = { channel: 1, layer: 10 };
    await rt.load('item1', 'lower-third', {});
    await expect(mock?.waitForCgAddResolution(slot)).resolves.toBe('resolved');
    expect((await rt.take('item1')).accepted).toBe(true);
    expect(mock?.layerState(slot)?.onAir).toBe(true);

    const result = rt.templateRemove('lower-third');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('in-use');
    // The graphic is untouched — removal never reaches for the wire.
    expect(mock?.layerState(slot)?.onAir).toBe(true);
    expect(rt.templateHtml('lower-third')).toBe(HTML);
  });

  it('counts every referencing item in the refusal message', async () => {
    const rt = await bootWithTemplate();
    await rt.load('item1', 'lower-third', {});
    await rt.load('item2', 'lower-third', {});

    expect(rt.templateRemove('lower-third').message).toMatch(/2 stack item/i);
  });

  it('allows the removal once the referencing item is gone', async () => {
    const rt = await bootWithTemplate();
    await rt.load('item1', 'lower-third', {});
    expect(rt.templateRemove('lower-third').ok).toBe(false);

    // The sanctioned unblock path — the same one R-010's on-air block points at.
    expect((await rt.remove('item1')).accepted).toBe(true);

    expect(rt.templateRemove('lower-third')).toEqual({ ok: true });
    expect(rt.templateHtml('lower-third')).toBeNull();
  });

  it('refuses an unregistered id with unknown-template rather than reporting success', async () => {
    const rt = await bootWithTemplate();

    const result = rt.templateRemove('never-imported');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown-template');
    // The real template is untouched.
    expect(rt.templateGet('lower-third')).not.toBeNull();
  });
});

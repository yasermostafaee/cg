import { describe, expect, it } from 'vitest';
import {
  ConnectionsConfigChannel,
  ConnectionsConfigChangedChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  ConnectionsSetConfigChannel,
  LayersClearChannel,
  LayersOrphansChangedChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChangedChannel,
  LayersOwnedOccupancyChannel,
  StackRemoveAllChannel,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  StackLoadChannel,
  StackOutChannel,
  StackRemoveChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesImportChannel,
} from '../src/index.js';

/**
 * Schema sanity checks for the runtime channels. The real wiring is
 * tested at the app boundary in apps/runtime; here we verify the
 * channel definitions accept canonical happy-path payloads.
 */

describe('stack.* channel schemas', () => {
  it('accepts a valid stack.load request', () => {
    expect(
      StackLoadChannel.request.parse({
        itemId: 'i1',
        templateId: 't1',
        fields: { title: 'hello' },
      }),
    ).toBeTruthy();
  });

  it('rejects stack.take without an itemId', () => {
    expect(() => StackTakeChannel.request.parse({})).toThrow();
  });

  it('accepts stack.update with merge mode', () => {
    expect(
      StackUpdateChannel.request.parse({
        itemId: 'i1',
        fields: { title: 'new' },
        mergeMode: 'merge',
      }),
    ).toBeTruthy();
  });

  it('stack.out optional immediate flag', () => {
    expect(StackOutChannel.request.parse({ itemId: 'i1' })).toBeTruthy();
    expect(StackOutChannel.request.parse({ itemId: 'i1', immediate: true })).toBeTruthy();
  });

  it('stack.remove just needs itemId', () => {
    expect(StackRemoveChannel.request.parse({ itemId: 'i1' })).toBeTruthy();
  });

  it('stack.snapshot has a void request and an array response', () => {
    expect(StackSnapshotChannel.request.parse(undefined)).toBeUndefined();
    expect(StackSnapshotChannel.response.parse([])).toEqual([]);
  });

  it('stack.state-changed publish payload accepts an empty array', () => {
    expect(StackStateChangedChannel.payload.parse([])).toEqual([]);
  });
});

describe('connections.* channel schemas', () => {
  const healthSnapshot = {
    primary: {
      label: 'A' as const,
      state: 'healthy' as const,
      amcpAxisOk: true,
      oscFreshAt: '2026-05-23T00:00:00.000Z',
    },
    backup: { label: 'B' as const, state: 'healthy' as const, amcpAxisOk: true },
    currentPrimary: 'A' as const,
    strategy: 'mirror-sync' as const,
  };

  it('accepts a full health snapshot', () => {
    expect(ConnectionsHealthChannel.response.parse(healthSnapshot)).toMatchObject({
      currentPrimary: 'A',
    });
  });

  it('connections.config returns a structured endpoint config', () => {
    const config = {
      servers: {
        A: { host: '10.0.0.5', amcpPort: 5250, oscPort: 6250 },
        B: { host: '10.0.0.6', amcpPort: 5250, oscPort: 6250 },
      },
      strategy: 'mirror-sync' as const,
      autoFailoverEnabled: true,
    };
    expect(ConnectionsConfigChannel.response.parse(config)).toMatchObject({
      strategy: 'mirror-sync',
    });
  });

  it('connections.failover wants a manual reason', () => {
    expect(ConnectionsFailoverChannel.request.parse({ reason: 'manual' })).toBeTruthy();
    expect(() => ConnectionsFailoverChannel.request.parse({ reason: 'auto' })).toThrow();
  });

  it('connections.health-changed publishes the same snapshot shape', () => {
    expect(ConnectionsHealthChangedChannel.payload.parse(healthSnapshot)).toMatchObject({
      currentPrimary: 'A',
    });
  });
});

describe('connections.set-config + stack.remove-all channel schemas (R-010)', () => {
  const twoServer = {
    servers: {
      A: { host: '192.168.1.50', amcpPort: 5250, oscPort: 6250 },
      B: { host: '192.168.1.51', amcpPort: 5250, oscPort: 6250 },
    },
    strategy: 'mirror-sync' as const,
    autoFailoverEnabled: true,
  };

  it('accepts a remote two-server config', () => {
    expect(ConnectionsSetConfigChannel.request.parse(twoServer)).toMatchObject({
      servers: { A: { host: '192.168.1.50' } },
    });
  });

  it('accepts a backup-less (declared single-server) config', () => {
    const single = {
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync' as const,
      autoFailoverEnabled: true,
    };
    const parsed = ConnectionsSetConfigChannel.request.parse(single);
    expect(parsed.servers.B).toBeUndefined();
  });

  it('rejects an empty host and a non-integer port', () => {
    expect(() =>
      ConnectionsSetConfigChannel.request.parse({
        ...twoServer,
        servers: { A: { host: '', amcpPort: 5250, oscPort: 6250 } },
      }),
    ).toThrow();
    expect(() =>
      ConnectionsSetConfigChannel.request.parse({
        ...twoServer,
        servers: { A: { host: '127.0.0.1', amcpPort: 52.5, oscPort: 6250 } },
      }),
    ).toThrow();
  });

  it('response carries ok, the optional refusal reason, and the serve info', () => {
    expect(ConnectionsSetConfigChannel.response.parse({ ok: true })).toMatchObject({ ok: true });
    expect(
      ConnectionsSetConfigChannel.response.parse({
        ok: false,
        reason: 'on-air-block',
        message: '2 item(s) are on air or unsettled',
      }),
    ).toMatchObject({ reason: 'on-air-block' });
    expect(
      ConnectionsSetConfigChannel.response.parse({
        ok: true,
        templateServe: { serveHost: '192.168.1.10', port: 5290, exposed: true },
      }),
    ).toMatchObject({ templateServe: { exposed: true } });
    // Serialized applies: a concurrent request is refused with its own reason.
    expect(
      ConnectionsSetConfigChannel.response.parse({
        ok: false,
        reason: 'apply-in-progress',
        message: 'another apply is in progress — retry in a moment',
      }),
    ).toMatchObject({ reason: 'apply-in-progress' });
    expect(() =>
      ConnectionsSetConfigChannel.response.parse({ ok: false, reason: 'bogus' }),
    ).toThrow();
  });

  it('config-changed publishes the config shape', () => {
    expect(ConnectionsConfigChangedChannel.payload.parse(twoServer)).toMatchObject({
      strategy: 'mirror-sync',
    });
  });

  it('stack.remove-all is void in, { ok, removed } out', () => {
    expect(StackRemoveAllChannel.request.parse(undefined)).toBeUndefined();
    expect(StackRemoveAllChannel.response.parse({ ok: true, removed: 3 })).toMatchObject({
      removed: 3,
    });
    expect(() => StackRemoveAllChannel.response.parse({ ok: true, removed: -1 })).toThrow();
  });
});

describe('layers.* channel schemas (R-009)', () => {
  const orphan = {
    channel: 1,
    layer: 60,
    producer: 'html',
    since: '2026-07-11T12:00:00.000Z',
  };

  it('layers.orphans pulls an orphan array (empty is valid — idle-quiet)', () => {
    expect(LayersOrphansChannel.request.parse(undefined)).toBeUndefined();
    expect(LayersOrphansChannel.response.parse([])).toEqual([]);
    expect(LayersOrphansChannel.response.parse([orphan])).toHaveLength(1);
  });

  it('layers.orphans-changed publishes the same shape', () => {
    expect(LayersOrphansChangedChannel.payload.parse([orphan])).toMatchObject([
      { channel: 1, layer: 60 },
    ]);
    expect(() =>
      LayersOrphansChangedChannel.payload.parse([{ ...orphan, producer: '' }]),
    ).toThrow();
  });

  it('layers.clear takes a channel-layer and answers ok/reason', () => {
    expect(LayersClearChannel.request.parse({ channel: 1, layer: 60 })).toEqual({
      channel: 1,
      layer: 60,
    });
    expect(() => LayersClearChannel.request.parse({ channel: 0, layer: 60 })).toThrow();
    expect(LayersClearChannel.response.parse({ ok: true })).toEqual({ ok: true });
    expect(LayersClearChannel.response.parse({ ok: false, reason: 'owned' })).toMatchObject({
      reason: 'owned',
    });
    expect(() => LayersClearChannel.response.parse({ ok: false, reason: 'nope' })).toThrow();
  });
});

describe('layers.owned-occupancy channel schemas (B-056)', () => {
  const warning = {
    channel: 1,
    layer: 10,
    itemId: 'item1',
    producer: 'html',
    since: '2026-07-12T12:00:00.000Z',
  };

  it('layers.owned-occupancy pulls a warning array (empty is valid — idle-quiet)', () => {
    expect(LayersOwnedOccupancyChannel.request.parse(undefined)).toBeUndefined();
    expect(LayersOwnedOccupancyChannel.response.parse([])).toEqual([]);
    expect(LayersOwnedOccupancyChannel.response.parse([warning])).toMatchObject([
      { channel: 1, layer: 10, itemId: 'item1' },
    ]);
  });

  it('layers.owned-occupancy-changed publishes the same shape and names the item', () => {
    expect(LayersOwnedOccupancyChangedChannel.payload.parse([warning])).toMatchObject([
      { itemId: 'item1' },
    ]);
    expect(() =>
      LayersOwnedOccupancyChangedChannel.payload.parse([{ ...warning, itemId: '' }]),
    ).toThrow();
    expect(() =>
      LayersOwnedOccupancyChangedChannel.payload.parse([{ ...warning, producer: '' }]),
    ).toThrow();
  });
});

describe('templates.import channel schema (B-038 Phase 2)', () => {
  const template = {
    templateId: 'tpl-1',
    templateType: 'lower-third',
    fields: [{ id: 'anchor', label: 'Anchor name', required: true, type: 'text', default: '' }],
  };

  it('accepts a template + the rendered self-contained html', () => {
    const parsed = TemplatesImportChannel.request.parse({
      template,
      html: '<!doctype html><html><body>hi</body></html>',
    });
    expect(parsed.html).toContain('<!doctype html');
    expect(parsed.template.templateId).toBe('tpl-1');
  });

  it('rejects an import missing the html payload', () => {
    expect(() => TemplatesImportChannel.request.parse({ template })).toThrow();
  });

  it('rejects an import missing the template', () => {
    expect(() => TemplatesImportChannel.request.parse({ html: '<html></html>' })).toThrow();
  });

  it('response carries the registered flag + template id', () => {
    expect(
      TemplatesImportChannel.response.parse({ registered: true, templateId: 'tpl-1' }),
    ).toMatchObject({ registered: true, templateId: 'tpl-1' });
  });
});

describe('lock.* channel schemas', () => {
  it('lock.engage requires a 4–64 char PIN', () => {
    expect(LockEngageChannel.request.parse({ pin: '1234' })).toBeTruthy();
    expect(() => LockEngageChannel.request.parse({ pin: '12' })).toThrow();
  });

  it('lock.release validates PIN length', () => {
    expect(LockReleaseChannel.request.parse({ pin: '1234' })).toBeTruthy();
  });

  it('lock.state response carries engaged flag + optional reason', () => {
    expect(LockStateChannel.response.parse({ engaged: false })).toBeTruthy();
    expect(LockStateChannel.response.parse({ engaged: true, reason: 'auto-idle' })).toBeTruthy();
  });

  it('lock.state-changed publish payload accepts the state shape', () => {
    expect(
      LockStateChangedChannel.payload.parse({ engaged: true, reason: 'operator' }),
    ).toBeTruthy();
  });
});

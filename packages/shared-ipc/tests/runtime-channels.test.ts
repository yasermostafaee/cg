import { describe, expect, it } from 'vitest';
import {
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
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

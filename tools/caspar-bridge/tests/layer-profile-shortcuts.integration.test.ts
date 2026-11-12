import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { loadFixedLayerBanks } from '../src/fixed-layers-store.js';
import { openClient, startAuthedBridge } from './support/auth-harness.js';
import { track } from './support/harness.js';
import { FURNITURE, standardBank, twoChannelRig } from './support/two-channel-rig.js';

const keys = {
  shortcuts: { '98': { play: 'F1' } },
  nextShortcuts: { '98': 'Alt+F1' },
  spaceShortcut: { layer: 99, verb: 'clear' },
} as const;

function profile(layerShortcuts?: unknown) {
  return {
    kind: 'apasai-cg-layer-profile',
    version: 1,
    items: [{ layer: 99, templateId: FURNITURE.templateId, fields: {} }],
    ...(layerShortcuts === undefined ? {} : { layerShortcuts }),
  };
}

it('restores exact shortcut settings or defaults on the destination channel and persists the result', async () => {
  const scratch = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-profile-keys-')), (dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(scratch, 'fixed.json');
  const first = { ...standardBank(1), ...keys };
  const second = { ...standardBank(2), ...keys };
  const { handle } = await twoChannelRig({
    banks: [first, second],
    bridge: { fixedLayersPath: file },
  });
  const client = await openClient(handle);
  let sequence = 0;
  const load = (layerShortcuts?: unknown) =>
    client.ask(String(++sequence), 'stack.load-profile', {
      channel: 1,
      profile: profile(layerShortcuts),
    });
  const bank = () => handle.runtime.fixedLayerBanks()[0];

  expect((await load()).payload).toEqual({ loaded: 1, issues: [] });
  expect(bank()).toEqual(first);

  const empty = { shortcuts: {}, nextShortcuts: {}, spaceShortcut: null };
  expect((await load(empty)).payload).toMatchObject({
    loaded: 1,
    shortcuts: { status: 'restored' },
  });
  expect(bank()).toEqual({ ...standardBank(1), ...empty });

  expect((await load({})).payload).toMatchObject({ shortcuts: { status: 'restored' } });
  expect(bank()).toEqual(standardBank(1));

  expect((await load(keys)).payload).toMatchObject({ shortcuts: { status: 'restored' } });
  expect(handle.runtime.fixedLayerBanks()).toEqual([first, second]);
  expect(loadFixedLayerBanks(file)).toEqual([first, second]);

  for (const [invalid, message] of [
    [{ shortcuts: { '79': { play: 'F1' } } }, 'Layer is not in the bank'],
    [{ ...keys, nextShortcuts: { '98': 'F1' } }, 'Shortcut is already assigned in this channel'],
    [{ shortcuts: { '98': { play: 'Space' } } }, 'Invalid layer shortcut'],
  ] as const) {
    expect((await load(invalid)).payload).toEqual({
      loaded: 1,
      issues: [],
      shortcuts: { status: 'invalid', message },
    });
    expect(handle.runtime.fixedLayerBanks()).toEqual([first, second]);
    expect(loadFixedLayerBanks(file)).toEqual([first, second]);
  }

  const item = handle.runtime.stackSnapshot(1)[0];
  if (item === undefined) throw new Error('Missing prepared layer');
  expect(await handle.runtime.take(item.itemId)).toMatchObject({ accepted: true });
  expect((await load({})).payload).toEqual({ loaded: 0, refusal: 'on-air', issues: [] });
  expect(handle.runtime.fixedLayerBanks()).toEqual([first, second]);
});

it('lets an operator load prepared rows while requiring station admin for shortcut restoration', async () => {
  const { handle, playout } = await startAuthedBridge({ fixedLayers: standardBank(1) });
  track(playout, (value) => value.stop());
  track(handle, (value) => value.close());
  handle.runtime.templateImport(FURNITURE, '<!doctype html><body>Logo</body>', 1);

  const operator = await openClient(handle);
  const operatorToken = await playout.issueToken({ user: 'operator' });
  expect((await operator.authenticate('auth-operator', operatorToken.token)).error).toBeUndefined();
  const request = { channel: 1, profile: profile(keys) };
  expect((await operator.ask('operator-load', 'stack.load-profile', request)).payload).toEqual({
    loaded: 1,
    issues: [],
    shortcuts: { status: 'admin-required' },
  });
  expect(handle.runtime.fixedLayerBanks()[0]).toEqual(standardBank(1));
  expect(handle.runtime.stackSnapshot(1)[0]?.templateId).toBe(FURNITURE.templateId);

  const admin = await openClient(handle);
  const adminToken = await playout.issueToken({ user: 'admin' });
  expect((await admin.authenticate('auth-admin', adminToken.token)).error).toBeUndefined();
  expect((await admin.ask('admin-load', 'stack.load-profile', request)).payload).toEqual({
    loaded: 1,
    issues: [],
    shortcuts: { status: 'restored' },
  });
  expect(handle.runtime.fixedLayerBanks()[0]).toEqual({ ...standardBank(1), ...keys });
});

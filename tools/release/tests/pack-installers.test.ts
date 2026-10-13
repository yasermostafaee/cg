import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packArgs, packPlan } from '../src/pack-installers.mjs';

/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — each installer is CG Setup with its product's engine behind it.
 * The plan names each output exactly as the build always named it (so the artifacts, the smokes and
 * the release are unchanged), and measures what the window shows as "Needed" and follows as
 * "Copying files" from the files themselves.
 */

let scratch: string | null = null;
afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}

function fixture(): string {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pack-'));
  const put = (rel: string, bytes: number) => {
    const file = path.join(scratch as string, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(bytes));
  };
  put('tools/bridge-installer/payload/cg-bridge.exe', 1000);
  put('tools/bridge-installer/payload/shawl.exe', 200);
  put('tools/bridge-installer/payload/bridge/caspar-bridge.mjs', 30);
  put('tools/bridge-installer/payload/licenses/node.txt', 4);
  put('target/release/cg-control.exe', 700);
  put('target/release/cg-designer.exe', 800);
  return scratch;
}

describe('packPlan', () => {
  it('names each installer as the build always did, and finds its engine', () => {
    const root = fixture();
    const plan = packPlan({ root, version: '0.10.0', outDir: path.join(root, 'out') });
    expect(plan.map((p) => path.basename(p.out))).toEqual([
      'CG-Bridge_0.10.0_x64-setup.exe',
      'CG Control_0.10.0_x64-setup.exe',
      'CG Designer_0.10.0_x64-setup.exe',
    ]);
    expect(plan[0]?.engine).toBe(path.join(root, 'tools', 'bridge-installer', 'CG-Bridge_0.10.0_x64-setup.exe'));
    expect(plan[1]?.engine).toBe(
      path.join(root, 'target', 'release', 'bundle', 'nsis', 'CG Control_0.10.0_x64-setup.exe'),
    );
  });

  it("measures CG Bridge's payload: all of it is Needed, its three programs are Copying files", () => {
    const root = fixture();
    const [bridge] = packPlan({ root, version: '0.10.0', outDir: root });
    expect(bridge?.installBytes).toBe(1234);
    expect(bridge?.mainFiles).toEqual([
      { path: 'cg-bridge.exe', bytes: 1000 },
      { path: 'shawl.exe', bytes: 200 },
      { path: 'bridge\\caspar-bridge.mjs', bytes: 30 },
    ]);
  });

  it('gives each app its own tile, and CG Bridge the console’s', () => {
    const root = fixture();
    const [bridge, control, designer] = packPlan({ root, version: '0.10.0', outDir: root });
    expect(control?.mainFiles).toEqual([{ path: 'cg-control.exe', bytes: 700 }]);
    expect(designer?.installBytes).toBe(800);
    expect(bridge?.tile).toBe(control?.tile);
    expect(designer?.tile).not.toBe(control?.tile);
    expect(designer?.icon.endsWith(path.join('designer', 'src-tauri', 'icons', 'icon.ico'))).toBe(true);
  });
});

describe('packArgs', () => {
  it('passes the release version, every main file and the guide only when there is one', () => {
    const root = fixture();
    const bridge = must(packPlan({ root, version: '0.10.0', outDir: root, guide: 'g.pdf' })[0]);
    const args = packArgs(bridge, { version: '0.10.0', setupDir: 'S' });
    expect(args.slice(0, 10)).toEqual([
      '--ui',
      path.join('S', 'cg-setup.exe'),
      '--engine',
      bridge.engine,
      '--product',
      'bridge',
      '--version',
      '0.10.0',
      '--install-bytes',
      '1234',
    ]);
    expect(args.filter((a) => a === '--main')).toHaveLength(3);
    expect(args).toContain('cg-bridge.exe=1000');
    expect(args[args.indexOf('--guide') + 1]).toBe('g.pdf');
    const control = must(packPlan({ root, version: '0.10.0', outDir: root })[1]);
    expect(packArgs(control, { version: '0.10.0', setupDir: 'S' })).not.toContain('--guide');
  });
});

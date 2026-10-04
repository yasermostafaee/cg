/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — the clean-Windows smokes' hands on CG Setup's window: launch an
 * installer, read and press what its window exposes through UI Automation (`setup-uia.ps1`), capture
 * it as it is on screen, and read its exit code. Node built-ins only (the runners have nothing built).
 *
 * Shared by `setup-smoke.mjs` (the two apps, unelevated), `setup-window-smoke.mjs` (the window on two
 * Windows images) and `tools/bridge-installer/setup-smoke.mjs` (CG Bridge, elevated).
 */
/* global process, setTimeout, Buffer */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PS = path.join(HERE, 'setup-uia.ps1');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A check list that never throws: every check is recorded, and a failure fails the run. */
export function checks(out) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail: String(detail) });
    process.stdout.write(
      `${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  — ${String(detail)}`}\n`,
    );
    return Boolean(ok);
  };
  const save = (file = 'results.json') => {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, file), JSON.stringify(results, null, 2));
    return results.every((r) => r.ok);
  };
  return { check, save, results };
}

/** One UI Automation command against the window titled `title`; its JSON answer. */
export function uia(title, cmd, arg = '', timeout = 60) {
  const argv = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    PS,
    '-Title',
    title,
    '-Cmd',
    cmd,
  ];
  // PowerShell drops an empty-string argument, so an absent value is not passed at all.
  if (arg !== '') argv.push('-Arg', arg);
  argv.push('-Timeout', String(timeout));
  const r = spawnSync('powershell.exe', argv, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: (timeout + 60) * 1000,
  });
  const last = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  try {
    return JSON.parse(last);
  } catch {
    return { ok: false, error: `${(r.stderr ?? '').trim().slice(0, 400)} ${last}`.trim() };
  }
}

/** The page as UI Automation reads it: every element, and its texts by automation id. */
export function page(title, timeout = 30) {
  const r = uia(title, 'dump', '', timeout);
  const elements = r.ok ? r.elements : [];
  const byId = Object.fromEntries(elements.map((e) => [e.id, e]));
  return { ok: r.ok, elements, byId, names: elements.map((e) => e.name), error: r.error };
}

/** Wait until an element of the window reads `text`; the page then. */
export function until(title, text, timeout = 120) {
  const r = uia(title, 'until', text, timeout);
  return r.ok ? page(title) : { ok: false, elements: [], byId: {}, names: [], error: r.error };
}

/**
 * Start an installer as a person double-clicks it (no argument unless given), keeping its process so
 * its exit code can be read. A raw command-line tail can be given for an argument NSIS wants unquoted.
 */
export function launch(installer, rawTail = '') {
  const child =
    rawTail === ''
      ? spawn(installer, [], { stdio: 'ignore', windowsHide: false })
      : spawn(`"${installer}" ${rawTail}`, { shell: true, stdio: 'ignore', windowsHide: false });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited };
}

/** The exit code within `ms`, or `null`. */
export async function exitCode(run, ms = 30_000) {
  return Promise.race([run.exited, sleep(ms).then(() => null)]);
}

/** Capture the window (and the shadow round it) to `file`. */
export function shot(title, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return uia(title, 'shot', file, 30);
}

function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  ).trim();
}

/** The DLLs a running process has loaded (the "no WebView2" proof reads these). */
export function modulesOf(pid) {
  try {
    return powershell(`(Get-Process -Id ${String(pid)}).Modules | ForEach-Object { $_.ModuleName }`)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Make WebView2 unavailable to every program on this machine, as a Windows without it is: the
 * documented policy that points every WebView2 app at a runtime folder — here, one that does not
 * exist. `restore()` removes it.
 */
export function blockWebView2() {
  const key = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\BrowserExecutableFolder';
  powershell(
    `New-Item -Path '${key}' -Force | Out-Null; New-ItemProperty -Path '${key}' -Name '*' -Value 'C:\\no-webview2-here' -PropertyType String -Force | Out-Null`,
  );
  return () =>
    powershell(`Remove-Item -Path '${key}' -Recurse -Force -ErrorAction SilentlyContinue`);
}

/** Display configuration: the resolution, and the scale Windows applies (100, 125, 150, …). */
const DISPLAY_CS = String.raw`
using System; using System.Runtime.InteropServices;
public static class CgDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
  public static string Largest() {
    DEVMODE best = new DEVMODE(); best.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); int area = 0;
    DEVMODE dm = new DEVMODE(); dm.dmSize = best.dmSize;
    for (int i = 0; EnumDisplaySettings(null, i, ref dm); i++) {
      if (dm.dmPelsWidth * dm.dmPelsHeight > area && dm.dmPelsWidth <= 2560) { area = dm.dmPelsWidth * dm.dmPelsHeight; best = dm; }
    }
    if (area == 0) return "none";
    best.dmFields = 0x80000 | 0x100000;
    int r = ChangeDisplaySettings(ref best, 0);
    return best.dmPelsWidth + "x" + best.dmPelsHeight + " " + r;
  }
  [StructLayout(LayoutKind.Sequential)] public struct LUID { public uint Low; public int High; }
  [StructLayout(LayoutKind.Sequential)] public struct PATH {
    public LUID srcAdapter; public uint srcId, srcMode, srcStatus;
    public LUID tgtAdapter; public uint tgtId, tgtMode, tech, rotation, scaling, rateN, rateD, scan; public int available; public uint tgtStatus;
    public uint flags;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MODE { public int type; public uint id; public LUID adapter; [MarshalAs(UnmanagedType.ByValArray, SizeConst = 48)] public byte[] info; }
  [StructLayout(LayoutKind.Sequential)] public struct HEADER { public int type; public int size; public LUID adapter; public uint id; }
  [StructLayout(LayoutKind.Sequential)] public struct GETDPI { public HEADER h; public int min, cur, max; }
  [StructLayout(LayoutKind.Sequential)] public struct SETDPI { public HEADER h; public int rel; }
  [DllImport("user32.dll")] public static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);
  [DllImport("user32.dll")] public static extern int QueryDisplayConfig(uint f, ref uint np, [Out] PATH[] p, ref uint nm, [Out] MODE[] m, IntPtr t);
  [DllImport("user32.dll")] public static extern int DisplayConfigGetDeviceInfo(ref GETDPI g);
  [DllImport("user32.dll")] public static extern int DisplayConfigSetDeviceInfo(ref SETDPI s);
  static readonly int[] Scales = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };
  public static string Scale(int percent) {
    uint np, nm; GetDisplayConfigBufferSizes(2, out np, out nm);
    PATH[] p = new PATH[np]; MODE[] m = new MODE[nm];
    int q = QueryDisplayConfig(2, ref np, p, ref nm, m, IntPtr.Zero); if (q != 0 || np == 0) return "query " + q;
    GETDPI g = new GETDPI(); g.h.type = -3; g.h.size = Marshal.SizeOf(typeof(GETDPI)); g.h.adapter = p[0].srcAdapter; g.h.id = p[0].srcId;
    int r = DisplayConfigGetDeviceInfo(ref g); if (r != 0) return "get " + r;
    int recommended = Math.Abs(g.min);
    int want = Array.IndexOf(Scales, percent); if (want < 0) return "unknown scale";
    int rel = want - recommended;
    if (rel < g.min || rel > g.max) return "out of range: min " + g.min + " cur " + g.cur + " max " + g.max;
    SETDPI s = new SETDPI(); s.h.type = -4; s.h.size = Marshal.SizeOf(typeof(SETDPI)); s.h.adapter = p[0].srcAdapter; s.h.id = p[0].srcId; s.rel = rel;
    return "set " + DisplayConfigSetDeviceInfo(ref s);
  }
}
`;

/** Switch the display to its largest mode (up to 2560 wide), so a 150 % window fits. */
export function largestResolution() {
  try {
    return powershell(`Add-Type -TypeDefinition @'\n${DISPLAY_CS}\n'@\n[CgDisplay]::Largest()`);
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
}

/** Set Windows' display scale for the primary display, in per cent; Windows' own answer. */
export function displayScale(percent) {
  try {
    return powershell(
      `Add-Type -TypeDefinition @'\n${DISPLAY_CS}\n'@\n[CgDisplay]::Scale(${String(percent)})`,
    );
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
}

/** Windows' "Animation effects" (Settings > Accessibility > Visual effects), on or off. */
export function animationEffects(on) {
  const cs = String.raw`
using System; using System.Runtime.InteropServices;
public static class CgAnim {
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);
  public static bool Set(bool on) { return SystemParametersInfo(0x1043, 0, on ? (IntPtr)1 : IntPtr.Zero, 3); }
}`;
  return powershell(
    `Add-Type -TypeDefinition @'\n${cs}\n'@\n[CgAnim]::Set($${on ? 'true' : 'false'})`,
  );
}

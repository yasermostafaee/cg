#!/usr/bin/env node
/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — **THE SETUP WINDOW ON A CLEAN WINDOWS, BEFORE ANYTHING IS
 * INSTALLED.** Run on two images — Windows Server 2022 (the Windows 10 code base: square window edge)
 * and Windows Server 2025 (the Windows 11 one: rounded corners) — it installs nothing:
 *
 *   1. WebView2 is made unavailable to every program (the documented `BrowserExecutableFolder` policy,
 *      pointed at a folder that does not exist) — and each installer still opens its first screen,
 *      with no WebView2 module loaded and no WebView2 process started (the positive control: the
 *      same read finds the setup's own Direct2D and DirectWrite);
 *   2. each Welcome says what §2 asks for — the question, the publisher, the release version;
 *   3. the keyboard: Tab and Shift+Tab move the focus, Enter presses the primary, Esc cancels — and a
 *      cancelled setup exits 1, as the NSIS installer did;
 *   4. Welcome at 150 % (and 200 % where the display allows it): the window is drawn at the new
 *      scale, its size measured;
 *   5. each Welcome, captured as it is on screen.
 *
 * Usage: node setup-window-smoke.mjs --installers <dir> --version <x.y.z> --label <name> --out <dir>
 */
/* global process */
import fs from 'node:fs';
import path from 'node:path';
import {
  blockWebView2,
  checks,
  displayScale,
  exitCode,
  largestResolution,
  launch,
  modulesOf,
  page,
  shot,
  sleep,
  uia,
} from './setup-window.mjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, v, i, all) => (i % 2 === 0 ? [...pairs, [v.replace(/^--/, ''), all[i + 1]]] : pairs),
      [],
    ),
);
const OUT = path.resolve(args.out ?? 'setup-window');
const VERSION = args.version;
const LABEL = args.label ?? 'windows';
const { check, save } = checks(OUT);

const PRODUCTS = [
  { name: 'CG Bridge', file: `CG-Bridge_${VERSION}_x64-setup.exe`, key: 'bridge' },
  { name: 'CG Control', file: `CG Control_${VERSION}_x64-setup.exe`, key: 'control' },
  { name: 'CG Designer', file: `CG Designer_${VERSION}_x64-setup.exe`, key: 'designer' },
];
const installer = (p) => path.join(args.installers, p.file);
const title = (p) => `${p.name} Setup`;
const WEBVIEW2 = /webview2|embeddedbrowser|msedge/i;

async function welcome(p, tag) {
  const run = launch(installer(p));
  const ready = uia(title(p), 'wait', '', 90);
  check(`${p.name}: the setup window opens on ${LABEL}${tag}`, ready.ok, ready.error ?? '');
  await sleep(800);
  return run;
}

// ── 1, 2, 5 — every installer's first screen, with WebView2 unavailable ─────────────────────────
const restore = blockWebView2();
try {
  for (const p of PRODUCTS) {
    const run = await welcome(p, ' with WebView2 unavailable');
    const pg = page(title(p));
    check(
      `${p.name}: Welcome asks "Install ${p.name}?"`,
      pg.byId.title?.name === `Install ${p.name}?`,
      pg.byId.title?.name,
    );
    check(
      `${p.name}: …names the publisher and this release`,
      pg.names.includes('Publisher: APASAI') && pg.names.includes(`Version ${VERSION}`),
      pg.names.join(' | '),
    );
    check(
      `${p.name}: …its rail marks Welcome as the current step`,
      pg.byId['step-1']?.status === 'current',
      JSON.stringify(pg.byId['step-1']),
    );
    const mods = modulesOf(run.child.pid);
    check(
      `${p.name}: …and loads no WebView2 (control: it loaded Direct2D and DirectWrite)`,
      mods.length > 0 &&
        !mods.some((m) => WEBVIEW2.test(m)) &&
        mods.some((m) => /^d2d1\.dll$/i.test(m)) &&
        mods.some((m) => /^dwrite\.dll$/i.test(m)),
      mods.filter((m) => WEBVIEW2.test(m) || /d2d1|dwrite/i.test(m)).join(', '),
    );
    const s = shot(title(p), path.join(OUT, `${LABEL}-${p.key}-welcome.png`));
    check(
      `${p.name}: Welcome captured (${String(s.how)})`,
      s.ok,
      s.error ?? `${String(s.width)}x${String(s.height)}`,
    );
    // 3 — Esc cancels: the window closes and the installer exits 1, as NSIS's did.
    uia(title(p), 'keys', '{ESC}', 20);
    const code = await exitCode(run, 20_000);
    check(`${p.name}: Esc cancels, and the installer exits 1`, code === 1, String(code));
  }
} finally {
  restore();
}

// ── 3 — the keyboard, end to end, on CG Control's window ─────────────────────────────────────────
{
  const p = PRODUCTS[1];
  const run = await welcome(p, ' (keyboard)');
  const focused = () => page(title(p)).elements.find((e) => e.focused)?.id ?? null;
  const f = uia(title(p), 'focus', '', 20);
  check('the window takes the keyboard focus', f.ok, JSON.stringify(f));
  check('…its primary (Next) holds the focus first', focused() === 'next', String(focused()));
  uia(title(p), 'keys', '{TAB}', 20);
  const afterTab = focused();
  check('Tab moves the focus on', afterTab !== null && afterTab !== 'next', String(afterTab));
  uia(title(p), 'keys', '+{TAB}', 20);
  check('Shift+Tab moves it back', focused() === 'next', String(focused()));
  const s = shot(title(p), path.join(OUT, `${LABEL}-control-welcome-focus.png`));
  check('the focus is drawn, captured', s.ok, s.error ?? '');
  uia(title(p), 'keys', '{ENTER}', 20);
  await sleep(600);
  check(
    'Enter presses the primary: the Location page',
    page(title(p)).byId.title?.name === 'Location',
    page(title(p)).byId.title?.name,
  );
  uia(title(p), 'keys', '{ESC}', 20);
  const code = await exitCode(run, 20_000);
  check('Esc on Location cancels: exit 1', code === 1, String(code));
}

// ── 4 — Welcome at 150 % and 200 % ───────────────────────────────────────────────────────────────
{
  const res = largestResolution();
  check(
    'the display can be set to a large mode (so a scaled window fits)',
    !res.startsWith('failed') && res !== 'none',
    res,
  );
  for (const percent of [150, 200]) {
    const set = displayScale(percent);
    const applied = set === 'set 0';
    if (percent === 150)
      check(`Windows accepts ${String(percent)} % display scaling`, applied, set);
    else if (!applied) {
      process.stdout.write(
        `note: ${String(percent)} % not offered by this display (${set}); not measured\n`,
      );
      continue;
    }
    if (!applied) continue;
    await sleep(1500);
    const p = PRODUCTS[1];
    const run = await welcome(p, ` at ${String(percent)} %`);
    const rect = uia(title(p), 'rect', '', 20);
    const want = 800 * (percent / 100);
    check(
      `${p.name}: at ${String(percent)} % the window is drawn ${String(want)} px wide (per-monitor DPI)`,
      rect.ok && Math.abs(rect.width - want) <= 2,
      `${String(rect.width)}x${String(rect.height)}`,
    );
    const s = shot(title(p), path.join(OUT, `${LABEL}-control-welcome-${String(percent)}.png`));
    check(`${p.name}: Welcome at ${String(percent)} % captured`, s.ok, s.error ?? '');
    uia(title(p), 'keys', '{ESC}', 20);
    check(`${p.name}: …and Esc still cancels (exit 1)`, (await exitCode(run, 20_000)) === 1);
  }
  displayScale(100);
}

fs.writeFileSync(
  path.join(OUT, `${LABEL}-os.txt`),
  `${process.env.ImageOS ?? ''} ${process.env.ImageVersion ?? ''}\n`,
);
process.exit(save(`results-${LABEL}.json`) ? 0 : 1);

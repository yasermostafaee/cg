/**
 * 🔴 `D-162` / `R-094` — **THE INSTALLED APPS' WINDOWS, AS WINDOWS AND AN OPERATOR MEET THEM**: how many
 * of an app run, a close as Windows sends one, and the page functions that read and answer the
 * dialog a held close raises — ONE copy, used by the desktop smoke (`installer-smoke.mjs`) and the
 * release acceptance (`release-acceptance.mjs`, `RELEASE-0114-01-C`: an upgrade over open apps).
 *
 * The page functions run INSIDE the installed apps (serialised through DevTools), so each uses only
 * its own argument and the page's globals.
 */
/* global Buffer, setTimeout */
/* global document, HTMLInputElement, Event */
import { execFileSync } from 'node:child_process';

const run = (file, argv) => execFileSync(file, argv, { encoding: 'utf8', windowsHide: true });

function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}

/** How many processes of `image` are running. */
export function processCount(image) {
  return pidsOf(image).length;
}

/** The PIDs of every running `image`. */
export function pidsOf(image) {
  return run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'])
    .split('\n')
    .filter((l) => l.toLowerCase().startsWith(`"${image.toLowerCase()}"`))
    .map((l) => Number(l.split(',')[1]?.replace(/"/g, '')));
}

/**
 * 🔴 `D-162` / `R-094` — **A CLOSE, AS WINDOWS SENDS ONE**: `WM_CLOSE` posted to the app's MAIN
 * window — what its title bar's ×, Alt+F4 and the taskbar's Close window all become. Aimed at that
 * one window on purpose: a bare `taskkill /PID` posts `WM_CLOSE` to every top-level window the
 * process owns, tao's hidden event window among them. `posted`, or `no-window` when none is found.
 */
export function sendClose(image) {
  const name = image.replace(/\.exe$/i, '');
  return powershell(
    [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -Namespace CgSmoke -Name Win -MemberDefinition \'[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, System.IntPtr lParam);\'',
      `$p = Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1`,
      "if ($null -eq $p) { 'no-window' } else { [void][CgSmoke.Win]::PostMessage($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero); 'posted' }",
    ].join('\n'),
  ).trim();
}

// ── Page functions ───────────────────────────────────────────────────────────

/**
 * 🔴 `D-162` / `R-094` — the dialog a HELD close raised, as the page shows it, or `null` when there
 * is none: its title, its buttons' words (the ✕ has none), which one has focus, CG Designer's
 * project name, CG Control's fact line, and how many dialogs are open at all.
 */
export function closeDialogProbe(title) {
  const dialog = document.querySelector(`[role="dialog"][aria-label="${title}"]`);
  if (dialog === null) return null;
  return {
    title: dialog.querySelector('h2')?.textContent ?? '',
    buttons: [...dialog.querySelectorAll('button')]
      .map((b) => b.textContent?.trim() ?? '')
      .filter((t) => t !== ''),
    focused: document.activeElement?.textContent?.trim() ?? '',
    project: dialog.querySelector('[data-unsaved-project]')?.textContent ?? null,
    fact: dialog.querySelector('[data-modal-body]')?.textContent ?? null,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  };
}

/**
 * Press one of that dialog's buttons by its words — on the page's NEXT turn, so a press that closes
 * the window does not take this evaluation's answer down with it. `false` when there is no such
 * button.
 */
export function pressInDialog({ title, label }) {
  const dialog = document.querySelector(`[role="dialog"][aria-label="${title}"]`);
  const button = [...(dialog?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === label,
  );
  if (button === undefined) return false;
  setTimeout(() => button.click(), 50);
  return true;
}

/** `D-162` — a new project from CG Designer's landing page, through its own dialog. */
export async function designerNewProject(name) {
  const wait = async (find) => {
    for (let i = 0; i < 150; i++) {
      const found = find();
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  // By its NAME: the landing button reads `+ New project`, its name is `New project`.
  const open = [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === 'New project',
  );
  if (open === undefined) return { ok: false, said: 'no New project button' };
  open.click();
  const dialog = await wait(() =>
    document.querySelector('[role="dialog"][aria-label="New project"]'),
  );
  if (dialog === null) return { ok: false, said: 'no New project dialog' };
  // The name, typed into the React-held field the way an input event delivers it.
  const input = dialog.querySelector('input[aria-label="Project name"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(input, name);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
  [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Create')?.click();
  const canvas = await wait(() => document.querySelector('[data-testid="canvas-surface"]'));
  return { ok: canvas !== null, said: document.title };
}

/** `D-162` — one edit: a new composition from the Compositions panel. The title then reads `* name`. */
export async function designerEdit() {
  document.querySelector('button[aria-label="New composition"]')?.click();
  for (let i = 0; i < 50 && !document.title.startsWith('* '); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return document.title;
}

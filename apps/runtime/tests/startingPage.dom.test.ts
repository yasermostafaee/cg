// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { composeStartingPage } from '../src-tauri/starting/compose.mjs';

/**
 * 🔴 `FIELD-FIXES-01` J — **WHAT THE STARTING PAGE SAYS WHILE IT WAITS, AND A FAILURE, REACH THE
 * USER INSIDE THE ONE SPLASH.** The composed page, with its own `start.js` run as shipped: the
 * splash's phase slot names what the window is waiting for, and a start failure — the shell's
 * sentence, who holds a port, where the log is — appears INSIDE the splash, never on a page of
 * its own. `start.css` is read into the document too, because what the failure hides is a
 * declared style (jsdom's cascade is real for that; it has no layout, and nothing here needs one).
 */

// Resolved from the workspace cwd: under jsdom `import.meta.url` is an `http://` URL.
const read = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');
const page = composeStartingPage(read('index.html'));
const startJs = read('src-tauri/starting/start.js');
const startCss = read('src-tauri/starting/start.css');

interface StartFailure {
  message: string;
  held?: string[];
  log?: string | null;
}

function load(): void {
  const head = /<head>([\s\S]*)<\/head>/.exec(page)?.[1] ?? '';
  const body = /<body data-state="starting">([\s\S]*)<\/body>/.exec(page)?.[1] ?? '';
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  document.body.dataset.state = 'starting';
  const style = document.createElement('style');
  style.textContent = startCss;
  document.head.appendChild(style);
  // The shipped script, character for character — as the page's deferred `<script>` runs it.
  new Function(startJs)();
}

function fail(failure: StartFailure): void {
  (window as unknown as { cgStartFailed: (f: StartFailure) => void }).cgStartFailed(failure);
}

const FAILURE: StartFailure = {
  message: 'The control service could not listen on 127.0.0.1:5174 — it is in use.',
  held: ['TCP 5174 — node.exe (process 4812)'],
  log: 'C:\\ProgramData\\CG Control\\logs\\bridge.log',
};

beforeEach(() => {
  load();
});

describe('FIELD-FIXES-01 J — the starting page speaks inside the splash', () => {
  it('🔴 while it waits, the splash’s own phase slot says what the window is waiting for', () => {
    expect(document.querySelector('#cg-splash .cg-splash__wordmark')).not.toBeNull();
    expect(document.getElementById('cg-splash-phase')?.textContent).toBe('STARTING BRIDGE');
    // CONTROL — nothing has failed: no failure, and the progress is shown.
    expect(document.getElementById('cg-start-failed')).toBeNull();
    const progress = document.querySelector<HTMLElement>('.cg-splash__progress');
    expect(progress === null ? 'absent' : getComputedStyle(progress).display).not.toBe('none');
  });

  it('🔴 a start failure is said INSIDE the splash: the sentence, who holds the port, and where the log is', () => {
    fail(FAILURE);
    const section = document.querySelector('#cg-splash .cg-splash__stage #cg-start-failed');
    expect(section, 'the failure sits inside the splash').not.toBeNull();
    expect(section?.getAttribute('role')).toBe('alert');
    expect(section?.textContent).toContain(FAILURE.message);
    expect(section?.textContent).toContain('TCP 5174 — node.exe (process 4812)');
    expect(section?.textContent).toContain('C:\\ProgramData\\CG Control\\logs\\bridge.log');
    expect(document.body.dataset.state).toBe('failed');
    expect(document.getElementById('cg-splash')?.getAttribute('aria-label')).toBe(
      'CG CONTROL could not start',
    );
    // The progress stops being a promise: it is hidden while the failure stands.
    const progress = document.querySelector<HTMLElement>('.cg-splash__progress');
    expect(progress === null ? 'absent' : getComputedStyle(progress).display).toBe('none');
  });

  it('the shell replays the failure on every page load: said twice, it is shown once', () => {
    fail(FAILURE);
    fail({ ...FAILURE, held: [] });
    expect(document.querySelectorAll('#cg-start-failed')).toHaveLength(1);
    expect(document.querySelectorAll('.cg-start-failed__message')).toHaveLength(1);
    expect(document.querySelectorAll('.cg-start-failed__held li')).toHaveLength(0);
  });
});

/* global window, document */
// FIELD-FIXES-01 J — the starting page IS the console's splash (composed by `compose.mjs` at
// staging, from the built console). This script is the page's only behaviour: it names what the
// window is waiting for in the splash's own phase slot, and says a start failure INSIDE the
// splash. It never dismisses the splash: the shell replaces this page with the console, whose
// splash continues it.
(() => {
  const phase = document.getElementById('cg-splash-phase');
  if (phase !== null) phase.textContent = 'STARTING BRIDGE';
})();

// DESKTOP-APPS-01 — the shell calls this (through `eval`) when the bridge cannot be started, and
// again on every finished page load (`replay_failure`), so it must be idempotent.
// `failure` is { message, held: string[], log: string | null }, built in `sidecar.rs`.
window.cgStartFailed = (failure) => {
  const splash = document.getElementById('cg-splash');
  const stage = splash?.querySelector('.cg-splash__stage');
  if (splash === null || stage === null || stage === undefined) return;
  document.body.dataset.state = 'failed';
  splash.setAttribute('aria-label', 'CG CONTROL could not start');
  let section = document.getElementById('cg-start-failed');
  if (section === null) {
    section = document.createElement('section');
    section.id = 'cg-start-failed';
    section.className = 'cg-start-failed';
    section.setAttribute('role', 'alert');
    stage.appendChild(section);
  }
  const message = document.createElement('p');
  message.className = 'cg-start-failed__message';
  message.textContent = failure.message;
  const held = document.createElement('ul');
  held.className = 'cg-start-failed__held';
  held.replaceChildren(
    ...(failure.held ?? []).map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }),
  );
  const log = document.createElement('p');
  log.className = 'cg-start-failed__log';
  log.textContent = failure.log ?? '';
  section.replaceChildren(message, held, log);
};

/* global window, document */
// DESKTOP-APPS-01 — the shell calls this (through `eval`) when the bridge cannot be started.
// `failure` is { message, held: string[], log: string | null }, built in `sidecar.rs`.
window.cgStartFailed = (failure) => {
  document.body.dataset.state = 'failed';
  document.getElementById('message').textContent = failure.message;
  document.getElementById('held').replaceChildren(
    ...(failure.held ?? []).map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }),
  );
  document.getElementById('log').textContent = failure.log ?? '';
};

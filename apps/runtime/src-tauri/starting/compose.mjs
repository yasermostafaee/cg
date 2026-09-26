/**
 * 🔴 `FIELD-FIXES-01` J — **CG CONTROL'S STARTING PAGE IS THE CONSOLE'S OWN SPLASH.**
 *
 * A launch of the installed app used to show two loading screens one after the other: this
 * folder's own page — a name and a sliding bar, while the bridge started — and then the
 * console's splash (`apps/runtime/index.html`, R-035). Now there is one design from one source:
 * the staging step (`tools/caspar-bridge/scripts/stage-control.mjs`) composes the starting page
 * from the BUILT console's `index.html` — its title, the splash's critical CSS and the splash
 * markup, byte for byte, build stamp included — and adds only this folder's two files:
 * `start.js` (what the page says while it waits, and a start failure, inside the splash) and
 * `start.css` (how that failure sits in it).
 *
 * The console's splash CLOCK is NOT taken: this page has no boot to time, and must never dismiss
 * itself — it is replaced when the shell loads the console, whose own splash then continues it.
 *
 * Tested in `apps/runtime/tests/startingPage.test.ts`, against the source `index.html`.
 */

/** This page's own script and stylesheet, copied beside the composed page. */
export const STARTING_SCRIPT = 'start.js';
export const STARTING_STYLE = 'start.css';

/** The console page's `<title>`. */
export function pageTitle(html) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  if (title === undefined) throw new Error('the console page has no <title>');
  return title;
}

/** The splash's critical CSS: the `<style>` block that styles `.cg-splash`. */
export function splashStyle(html) {
  for (const match of html.matchAll(/<style>[\s\S]*?<\/style>/g)) {
    if (match[0].includes('.cg-splash {')) return match[0];
  }
  throw new Error('the console page has no splash <style> block');
}

/** The splash element: `<div … id="cg-splash" …>` to its own closing tag. */
export function splashMarkup(html) {
  const id = html.indexOf('id="cg-splash"');
  if (id < 0) throw new Error('the console page has no splash element');
  const start = html.lastIndexOf('<div', id);
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error('the splash element is never closed');
}

/** The starting page, composed from the console page's HTML. */
export function composeStartingPage(consoleHtml) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    `    <title>${pageTitle(consoleHtml)}</title>`,
    "    <!-- Composed by src-tauri/starting/compose.mjs from the console's own index.html. -->",
    `    ${splashStyle(consoleHtml)}`,
    `    <link rel="stylesheet" href="${STARTING_STYLE}" />`,
    `    <script src="${STARTING_SCRIPT}" defer></script>`,
    '  </head>',
    '  <body data-state="starting">',
    `    ${splashMarkup(consoleHtml)}`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

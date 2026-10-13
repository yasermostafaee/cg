/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE INSTALL GUIDE'S MARKDOWN, AS HTML** — the few forms the guide
 * uses, and nothing else (no dependency is taken for them):
 *
 *   # / ## / ###      headings                      - item / 1. item    lists (2-space continuation)
 *   **bold**          strong                        `Check`             an app's own words — see below
 *   ![caption](src "45%")   a figure, its width     [confirm with the Playout team]   a marked point
 *   ![caption](src "22% side")   a figure beside the text that follows it
 *   figure lines with no blank line between them    one row of figures, side by side
 *
 * AN APP'S OWN WORDS ARE ISOLATED. The guide is Persian and right to left; a button's name is English
 * (`Use this channel`) or a file name (`CG Control_0.9.0_x64-setup.exe`). Set in the Persian sentence
 * as one text run, their placement is decided by the bidi algorithm — a trailing `.` or `)` jumps to
 * the wrong end (golden rule 11's lesson). Each backticked name is its own `<bdi dir="ltr">`.
 */

/** HTML-escape text (the guide's words are data, never markup). */
export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The marker the guide puts on a Playout-side point our records do not file. */
export const CONFIRM_MARKER = '[confirm with the Playout team]';

/**
 * One line of prose. Code spans are set aside first (their content is literal, and bold may span
 * them — `**the password of `cg-admin`**`), then the line is escaped, bold and the marker applied, and
 * each code span put back as its own isolated run. The placeholders are private-use characters,
 * which never occur in the guide.
 */
export function inline(text) {
  const spans = [];
  const held = text.replace(/`([^`]+)`/g, (_whole, code) => {
    spans.push(code);
    return `${String(spans.length - 1)}`;
  });
  return escapeHtml(held)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(
      escapeHtml(CONFIRM_MARKER),
      `<mark class="confirm" dir="ltr">${escapeHtml(CONFIRM_MARKER)}</mark>`,
    )
    .replace(
      /(\d+)/g,
      (_whole, index) => `<bdi class="ui" dir="ltr">${escapeHtml(spans[Number(index)])}</bdi>`,
    );
}

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;

/**
 * The guide's markdown as an HTML fragment. `resolveImage(src)` turns an image's source into the URL
 * the page embeds (the builder inlines each as a `data:` URI).
 */
export function markdownToHtml(markdown, resolveImage = (src) => src) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = null;
  let figures = [];

  const closeFigures = () => {
    if (figures.length === 1) html.push(figures[0]);
    else if (figures.length > 1) html.push(`<div class="figures">${figures.join('')}</div>`);
    figures = [];
  };
  const closeParagraph = () => {
    if (paragraph.length > 0) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list !== null) {
      const items = list.items.map((item) => `<li>${inline(item.join(' '))}</li>`).join('');
      html.push(`<${list.tag}>${items}</${list.tag}>`);
    }
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^-\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    const figure = FIGURE.exec(line.trim());
    if (figure === null) closeFigures();
    if (line.trim() === '') {
      closeParagraph();
      closeList();
    } else if (heading !== null) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${String(level)}>${inline(heading[2])}</h${String(level)}>`);
    } else if (figure !== null) {
      closeParagraph();
      closeList();
      const [, caption, src, title] = figure;
      const [width, place] = (title ?? '').split(/\s+/);
      const style = width !== undefined && width !== '' ? ` style="width:${escapeHtml(width)}"` : '';
      const side = place === 'side' ? ' class="side"' : '';
      figures.push(
        `<figure${side}${style}><img src="${escapeHtml(resolveImage(src))}" alt="${escapeHtml(caption.replaceAll('`', ''))}">` +
          `<figcaption>${inline(caption)}</figcaption></figure>`,
      );
    } else if (bullet !== null || numbered !== null) {
      closeParagraph();
      const tag = bullet !== null ? 'ul' : 'ol';
      if (list !== null && list.tag !== tag) closeList();
      if (list === null) list = { tag, items: [] };
      list.items.push([(bullet ?? numbered)[1]]);
    } else if (list !== null && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1].push(line.trim());
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  closeFigures();
  closeParagraph();
  closeList();
  return html.join('\n');
}

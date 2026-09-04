import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { inline, inlineMuted } from './prose.css.js';

/**
 * `DESIGNER-FIX-0905` — the `i` and the one-line state it sits on.
 *
 * The button is a `ghost` {@link Control}: quiet at rest, full text on hover, the shared
 * focus ring. It is sized to sit at the end of a line of inspector text without raising
 * the line's height.
 */
export const button = style({
  verticalAlign: 'middle',
  marginInlineStart: '0.25rem',
  flexShrink: 0,
});

/** A state line the author ACTS on — full text colour, the legible inline size. */
export const stateText = style([
  inline,
  {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.15rem',
    color: colors.text,
  },
]);

/** A caption-weight state line — muted, same size. */
export const stateMuted = style([
  inlineMuted,
  {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.15rem',
  },
]);

export const stateBody = style({ flex: '1 1 auto', minWidth: 0 });

/**
 * The modal body — reading size, a reading measure. The modal already sets 0.9rem; the
 * measure is capped so a wide window does not stretch a paragraph past what the eye
 * tracks.
 */
export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  maxWidth: '62ch',
  lineHeight: 1.5,
});

globalStyle(`${body} p`, { margin: 0 });
globalStyle(`${body} code`, {
  fontSize: '0.85em',
  background: colors.panelMuted,
  padding: '0 0.25em',
  borderRadius: '0.2em',
});

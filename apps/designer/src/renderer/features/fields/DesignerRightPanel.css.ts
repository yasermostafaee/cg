import { globalStyle, style } from '@vanilla-extract/css';
import { colors, hoverWash } from '../../theme.js';

export const shell = style({
  width: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  overflow: 'hidden',
});

export const tabs = style({
  flexShrink: 0,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  padding: '0.3rem',
  gap: '0.2rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const tab = style({
  minWidth: 0,
  padding: '0.35rem 0.45rem',
  borderRadius: '0.22rem',
  color: colors.textMuted,
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  selectors: { '&:hover': { backgroundImage: hoverWash() } },
});

export const tabActive = style([tab, { background: colors.menuHover, color: colors.text }]);

export const body = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  selectors: { '&[hidden]': { display: 'none' } },
});

// The tab shell owns the outside border. Every Inspector variant is itself an
// `<aside>` with the legacy panel border, so suppress that nested frame here.
globalStyle(`${body} > aside`, {
  border: 0,
  borderRadius: 0,
});

export const variables = style({
  width: '100%',
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.55rem',
  boxSizing: 'border-box',
  fontSize: '0.74rem',
});

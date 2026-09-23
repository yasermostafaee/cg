import { Check, Clock, Copy, TriangleAlert, X } from 'lucide-react';
import type { ConnectionCheckLine } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

/**
 * `DESKTOP-APPS-01` §2F — **THE CONNECTION CHECK, one line per link.** Shown in first-run and in
 * Station setup. Each line is the bridge's own sentence; a line that needs somebody else to act
 * carries the ONE command or CORS entry they must use, shown on its own to be copied.
 *
 * ⚠ Pass is NOT the on-air green: that colour means a graphic is on the output. A passing link is
 * the quiet ink with a check mark; a failure is the error ink; the topology advice is a warning;
 * a link not judged yet (`DESKTOP-APPS-01-B`: AMCP before a station admin signs in) is the quiet
 * ink with a clock — neutral, never a failure.
 */
const INK: Record<ConnectionCheckLine['status'], string> = {
  pass: colors.textSecondary,
  fail: colors.errorText,
  warn: colors.pending,
  wait: colors.textSecondary,
};

const ICON = { pass: Check, fail: X, warn: TriangleAlert, wait: Clock } as const;

const styles = {
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  line: {
    display: 'grid',
    gridTemplateColumns: '16px 1fr',
    columnGap: 8,
    alignItems: 'start',
    fontSize: cssVars['--r-text-sm'],
    lineHeight: 1.5,
  },
  command: {
    gridColumn: '2',
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  code: {
    flex: 1,
    minWidth: 0,
    padding: '4px 8px',
    borderRadius: cssVars['--r-radius-sm'],
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    color: colors.text,
    fontFamily: cssVars['--r-font-mono'],
    userSelect: 'all' as const,
    overflowWrap: 'anywhere' as const,
  },
} as const;

export function ConnectionCheckList({
  lines,
}: {
  lines: readonly ConnectionCheckLine[];
}): JSX.Element {
  return (
    <ul style={styles.list} aria-label="Connection check">
      {lines.map((line) => (
        <li key={line.id} style={styles.line} data-check={line.id} data-status={line.status}>
          <span style={{ color: INK[line.status], paddingTop: 2 }} aria-label={line.status}>
            <Icon icon={ICON[line.status]} size={14} />
          </span>
          <span style={{ color: line.status === 'pass' ? colors.text : INK[line.status] }}>
            {line.text}
          </span>
          {line.command !== undefined && (
            <div style={styles.command}>
              <code style={styles.code} dir="ltr">
                {line.command}
              </code>
              <Button
                variant="icon"
                aria-label="Copy"
                title="Copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(line.command ?? '');
                }}
              >
                <Icon icon={Copy} size={14} />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

import {
  Check,
  CircleDashed,
  Clock,
  Copy,
  LoaderCircle,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion.js';
import type { ShownCheckLine } from './firstRunStation.js';

/**
 * `DESKTOP-APPS-01` §2F — **THE CONNECTION CHECK, one line per link.** Shown in first-run and in
 * Station setup. Each line is the bridge's own sentence; a line that needs somebody else to act
 * carries the ONE command or CORS entry they must use, shown on its own to be copied.
 *
 * ⚠ Pass is NOT the on-air green: that colour means a graphic is on the output. A passing link is
 * the quiet ink with a check mark; a failure is the error ink; the topology advice is a warning;
 * a link not judged yet (`DESKTOP-APPS-01-B`: AMCP before a station admin signs in) is the quiet
 * ink with a clock — neutral, never a failure.
 *
 * `CHECK-RERUN-01` — two more neutral states, in the layer table's own grammar: a line NOT CHECKED
 * because a line it needs failed (`skip`) wears the dashed ring of "nothing here", and a line whose
 * check is RUNNING (`checking`, the console's own) wears the moving loader of "not arrived yet",
 * in the muted ink. Neither is ever the error ink.
 */
const INK: Record<ShownCheckLine['status'], string> = {
  pass: colors.textSecondary,
  fail: colors.errorText,
  warn: colors.pending,
  wait: colors.textSecondary,
  skip: colors.textSecondary,
  checking: colors.textMuted,
};

const ICON: Record<ShownCheckLine['status'], LucideIcon> = {
  pass: Check,
  fail: X,
  warn: TriangleAlert,
  wait: Clock,
  skip: CircleDashed,
  checking: LoaderCircle,
};

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

export function ConnectionCheckList({ lines }: { lines: readonly ShownCheckLine[] }): JSX.Element {
  const still = usePrefersReducedMotion();
  const checking = lines.some((l) => l.status === 'checking');
  return (
    <ul style={styles.list} aria-label="Connection check" aria-busy={checking}>
      {lines.map((line) => (
        <li key={line.id} style={styles.line} data-check={line.id} data-status={line.status}>
          <span style={{ color: INK[line.status], paddingTop: 2 }} aria-label={line.status}>
            <Icon
              icon={ICON[line.status]}
              size={14}
              // The same moving mark the layer table's waiting rows wear, still under reduced motion.
              {...(line.status === 'checking' && !still
                ? { style: { animation: 'cg-spin 1s linear infinite' } }
                : {})}
            />
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

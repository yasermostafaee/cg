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
import { CONNECTION_CHECK_GROUPS } from '@cg/shared-ipc';
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
 * ⚠ Pass is NOT the on-air green: that colour means a graphic is on the output. 🔴 `UI-POLISH-01`
 * F (the owner, 2026-09-26): a passing line's ✓ IS green now — in its OWN token, `checkPass`, a
 * quieter green of a third the saturation (`theme.ts` measures the two side by side), so the rule
 * above still holds: `onAir` stays reserved for air. Only the ICON takes it; the line's text keeps
 * its ink. A failure is the error ink; a finding that is advice (a VPN or proxy that intercepts
 * nothing of ours, `B-318`) is a warning; a link not judged yet
 * (`DESKTOP-APPS-01-B`: AMCP before a station admin signs in) is the quiet ink with a clock —
 * neutral, never a failure.
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

/** The ICON's ink: the line's own, except a pass's ✓, which wears `checkPass`. */
const ICON_INK: Record<ShownCheckLine['status'], string> = { ...INK, pass: colors.checkPass };

const ICON: Record<ShownCheckLine['status'], LucideIcon> = {
  pass: Check,
  fail: X,
  warn: TriangleAlert,
  wait: Clock,
  skip: CircleDashed,
  checking: LoaderCircle,
};

const styles = {
  groups: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  // `R-081` — a group's head: the step heads' grammar, one rank quieter.
  groupHead: {
    margin: '0 0 6px',
    fontSize: cssVars['--r-text-xs'],
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
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

/**
 * 🔴 `R-081` (`CONSOLE-POLISH-01` §6) — **GROUPED, IN THE ORDER THINGS HAPPEN.** With `grouped`, the
 * lines are shown under the four headings of `CONNECTION_CHECK_GROUPS` — Reachable, Versions,
 * Sign-in, After sign-in — so the sign-in reads as the gate between what needs nothing and what needs
 * a signed-in session. A group with no line is not shown. Without `grouped` (a compact surface that
 * shows the ONE deciding line, the sign-in gate) the lines are one plain list, as before.
 */
export function ConnectionCheckList({
  lines,
  grouped = false,
}: {
  lines: readonly ShownCheckLine[];
  grouped?: boolean | undefined;
}): JSX.Element {
  const still = usePrefersReducedMotion();
  const checking = lines.some((l) => l.status === 'checking');
  if (grouped) {
    return (
      <div style={styles.groups} aria-label="Connection check" aria-busy={checking} role="group">
        {CONNECTION_CHECK_GROUPS.map((group) => {
          // In the group's own order, whatever order the lines arrived in.
          const mine = (group.lines as readonly string[]).flatMap((id) =>
            lines.filter((l) => l.id === id),
          );
          if (mine.length === 0) return null;
          return (
            // A GROUP, not a landmark: four sections per check would crowd the page's regions.
            <div key={group.id} role="group" aria-label={group.title} data-check-group={group.id}>
              <h4 style={styles.groupHead}>{group.title}</h4>
              <CheckLines lines={mine} still={still} />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <ul style={styles.list} aria-label="Connection check" aria-busy={checking}>
      <CheckLineItems lines={lines} still={still} />
    </ul>
  );
}

function CheckLines({
  lines,
  still,
}: {
  lines: readonly ShownCheckLine[];
  still: boolean;
}): JSX.Element {
  return (
    <ul style={styles.list}>
      <CheckLineItems lines={lines} still={still} />
    </ul>
  );
}

function CheckLineItems({
  lines,
  still,
}: {
  lines: readonly ShownCheckLine[];
  still: boolean;
}): JSX.Element {
  return (
    <>
      {lines.map((line) => (
        <li key={line.id} style={styles.line} data-check={line.id} data-status={line.status}>
          <span
            style={{ color: ICON_INK[line.status], paddingTop: 2 }}
            aria-label={line.status}
            data-check-icon=""
          >
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
    </>
  );
}

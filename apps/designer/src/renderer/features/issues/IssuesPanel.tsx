import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  issues: readonly ExportIssue[];
}

const severityColor: Record<ExportIssue['severity'], string> = {
  error: '#fda4af',
  warning: '#fcd34d',
  info: '#93c5fd',
};

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.5rem 0.6rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
  },
  heading: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: (color: string): React.CSSProperties => ({
    fontSize: '0.7rem',
    padding: '0.05rem 0.4rem',
    borderRadius: '0.7rem',
    border: `1px solid ${color}`,
    color,
    fontWeight: 700,
  }),
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '0.4rem',
    alignItems: 'baseline',
    fontSize: '0.78rem',
    cursor: 'pointer',
    padding: '0.15rem 0.2rem',
    borderRadius: '0.2rem',
  },
  rowText: { color: colors.text },
  meta: { fontSize: '0.7rem', color: colors.textMuted, marginLeft: '0.3rem' },
} as const;

/**
 * Issues panel — shows the live `export.preflight` output. Clicking an
 * issue with an `elementId` selects that element so the operator can
 * jump to the source. Clicking the heading badge cycles through severities.
 *
 * Phase 8 §10's exit criterion ("Designer rejects an export with an
 * unbound required field") relies on the preflight returning that
 * issue at `severity: error`, which `ExportService.preflight` does as
 * of M7.3.
 */
export function IssuesPanel({ issues }: Props): JSX.Element | null {
  if (issues.length === 0) return null;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const summary =
    errorCount > 0
      ? `${String(errorCount)} error${errorCount === 1 ? '' : 's'}`
      : warningCount > 0
        ? `${String(warningCount)} warning${warningCount === 1 ? '' : 's'}`
        : `${String(issues.length)} issue${issues.length === 1 ? '' : 's'}`;
  const summaryColor =
    errorCount > 0
      ? severityColor.error
      : warningCount > 0
        ? severityColor.warning
        : severityColor.info;
  return (
    <section style={styles.panel} aria-label="Issues">
      <h3 style={styles.heading}>
        <span>ISSUES</span>
        <span style={styles.badge(summaryColor)}>{summary}</span>
      </h3>
      {issues.map((issue, idx) => (
        <IssueRow key={idx} issue={issue} />
      ))}
    </section>
  );
}

function IssueRow({ issue }: { issue: ExportIssue }): JSX.Element {
  const color = severityColor[issue.severity];
  function onClick(): void {
    if (issue.elementId !== undefined) {
      designerStore.setSelection([issue.elementId]);
    }
  }
  return (
    <div style={styles.row} onClick={onClick} role="button" tabIndex={0}>
      <span style={styles.badge(color)}>{issue.severity}</span>
      <span style={styles.rowText}>
        {issue.message}
        {issue.elementId !== undefined && (
          <span style={styles.meta}>· element {issue.elementId}</span>
        )}
        {issue.fieldId !== undefined && <span style={styles.meta}>· field {issue.fieldId}</span>}
      </span>
    </div>
  );
}

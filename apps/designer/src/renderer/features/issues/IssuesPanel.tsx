import { LocateFixed } from 'lucide-react';
import type { ExportIssue } from '@cg/shared-ipc';
import { designerStore } from '../../state/store.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './IssuesPanel.css.js';

interface Props {
  issues: readonly ExportIssue[];
  /** Called after navigating to the affected element (e.g. to close a host modal). */
  onPick?: () => void;
  /**
   * When true, render just the issue rows without the bordered panel chrome
   * and "ISSUES" heading — for embedding inside a host that already supplies a
   * title (e.g. the status-bar issues modal).
   */
  embedded?: boolean;
}

const severityColor: Record<ExportIssue['severity'], string> = {
  error: '#fda4af',
  warning: '#fcd34d',
  info: '#93c5fd',
};

/**
 * The badge colour is per-severity (dynamic), so it stays an inline style
 * builder rather than a static vanilla-extract class.
 */
const badge = (color: string): React.CSSProperties => ({
  fontSize: '0.7rem',
  padding: '0.05rem 0.4rem',
  borderRadius: '0.7rem',
  border: `1px solid ${color}`,
  color,
  fontWeight: 700,
});

/**
 * Issues panel — shows the live `export.preflight` output. An issue with
 * an `elementId` has a dedicated control to select that element.
 *
 * Phase 8 §10's exit criterion ("Designer rejects an export with an
 * unbound required field") relies on the preflight returning that
 * issue at `severity: error`, which `ExportService.preflight` does as
 * of M7.3.
 */
export function IssuesPanel({ issues, onPick, embedded = false }: Props): JSX.Element | null {
  if (issues.length === 0) return null;
  if (embedded) {
    return (
      <>
        {issues.map((issue, idx) => (
          <IssueRow key={idx} issue={issue} onPick={onPick} />
        ))}
      </>
    );
  }
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
    <section className={s.panel} aria-label="Issues">
      <h3 className={s.heading}>
        <span>ISSUES</span>
        <span style={badge(summaryColor)}>{summary}</span>
      </h3>
      {issues.map((issue, idx) => (
        <IssueRow key={idx} issue={issue} onPick={onPick} />
      ))}
    </section>
  );
}

function IssueRow({
  issue,
  onPick,
}: {
  issue: ExportIssue;
  onPick?: (() => void) | undefined;
}): JSX.Element {
  const color = severityColor[issue.severity];
  const { elementId } = issue;
  return (
    <div className={s.row}>
      <span style={badge(color)}>{issue.severity}</span>
      <span className={s.rowText}>
        {issue.message}
        {issue.fieldId !== undefined && <span className={s.meta}>· field {issue.fieldId}</span>}
      </span>
      {elementId !== undefined && (
        <Control
          size="sm"
          aria-label="Go to element"
          title="Go to element"
          onClick={() => {
            designerStore.setSelection([elementId]);
            onPick?.();
          }}
        >
          <Icon icon={LocateFixed} size={14} />
        </Control>
      )}
    </div>
  );
}

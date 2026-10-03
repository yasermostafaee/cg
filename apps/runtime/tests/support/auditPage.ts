import type { AuditEntry } from '@cg/shared-schema';
import {
  AUDIT_PAGE_SIZE,
  auditMatches,
  type AuditCursor,
  type AuditFilter,
  type AuditNaming,
  type BankSet,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { templateDisplayName } from '../../src/renderer/features/library/templateName.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — a stub `audit.page` over a list of rows, NEWEST FIRST, paged and
 * filtered by the SAME `auditMatches` CG Bridge pages with — worded against the bank and templates
 * the spec declares, so a search a spec types finds what the bridge's would. Every request is kept,
 * for a spec that asserts what was ASKED.
 */
export function auditPageOf(
  entries: readonly AuditEntry[],
  names: { bank?: BankSet; templates?: readonly TemplateInfo[] } = {},
): {
  page: (req: {
    cursor?: AuditCursor;
    filter?: AuditFilter;
  }) => Promise<{ entries: AuditEntry[]; next: AuditCursor | null }>;
  requests: { cursor?: AuditCursor; filter?: AuditFilter }[];
} {
  const naming: AuditNaming = {
    bank: names.bank ?? null,
    templateLabel: (id) => {
      const t = names.templates?.find((x) => x.templateId === id);
      return t === undefined ? null : templateDisplayName(t);
    },
  };
  const requests: { cursor?: AuditCursor; filter?: AuditFilter }[] = [];
  return {
    requests,
    page: (req) => {
      requests.push(req);
      const matching = entries.filter((e) => auditMatches(e, req.filter ?? {}, naming));
      const start = req.cursor?.before ?? 0;
      const end = start + AUDIT_PAGE_SIZE;
      return Promise.resolve({
        entries: matching.slice(start, end),
        next: end < matching.length ? { file: 'stub', before: end } : null,
      });
    },
  };
}

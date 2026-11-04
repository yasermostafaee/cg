export { AuditWriter, DEFAULT_AUDIT_ROTATION } from './writer.js';
export type { AuditRotation, AuditWriterOptions, AuditWriterEvents } from './writer.js';

export {
  AuditRecordMovedError,
  readAuditCount,
  readAuditPage,
  readRecentEntries,
} from './reader.js';
export type {
  AuditPageCursor,
  ReadAuditCountOptions,
  ReadAuditOptions,
  ReadAuditPageOptions,
} from './reader.js';

// `CONSOLE-POLISH-01` (`R-083`) — the record's files, for the logs download.
export { auditFiles, CURRENT_UNNAMED, type AuditFile } from './files.js';

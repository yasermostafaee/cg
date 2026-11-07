import {
  imageFieldAllowsUpload,
  numberFieldAllowedValues,
  numberFieldValueError,
  numberFieldValueLabel,
  type ListItem,
  type ListItemField,
} from '@cg/shared-schema';
import { colors, cssVars } from '../../theme.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import { useAuthoredPictureThumbnails } from '../book/authoredPictures.js';

const styles = {
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--r-space-2)',
    flexWrap: 'wrap' as const,
    marginBottom: 'var(--r-space-3)',
  },
  tableWrap: {
    minHeight: 0,
    maxHeight: 'min(62vh, 38rem)',
    overflow: 'auto',
    border: `1px solid ${colors.border}`,
    borderRadius: 'var(--r-radius-md)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 'var(--r-text-sm)',
  },
  head: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
    padding: 'var(--r-space-2) var(--r-space-3)',
    background: colors.panelMuted,
    color: colors.textMuted,
    textAlign: 'start' as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: `1px solid ${colors.border}`,
  },
  cell: {
    minWidth: '8rem',
    maxWidth: '20rem',
    padding: 'var(--r-space-2) var(--r-space-3)',
    borderBottom: `1px solid ${cssVars['--r-border-soft']}`,
    verticalAlign: 'top' as const,
    overflowWrap: 'anywhere' as const,
  },
  rowNumber: {
    width: '1%',
    minWidth: '3rem',
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  invalid: {
    background: cssVars['--r-caution-bg'],
    color: cssVars['--r-caution-text'],
    boxShadow: `inset 3px 0 0 ${cssVars['--r-caution-text']}`,
  },
  error: {
    display: 'block',
    marginTop: 'var(--r-space-1)',
    color: cssVars['--r-caution-text'],
    fontSize: 'var(--r-text-xs)',
    lineHeight: 1.35,
  },
  image: {
    display: 'block',
    width: '2.5rem',
    height: '2.5rem',
    objectFit: 'contain' as const,
    objectPosition: 'center',
  },
} as const;

function imageAssetId(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const assetId = (value as Record<string, unknown>)['assetId'];
  return typeof assetId === 'string' && assetId !== '' ? assetId : undefined;
}

export function structuredCellError(field: ListItemField, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return field.required ? 'A value is required.' : undefined;
  }
  switch (field.type) {
    case 'number':
      return typeof value === 'number' ? numberFieldValueError(field, value) : 'Must be a number.';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Must be true or false.';
    case 'select':
      return typeof value === 'string' && field.options.some((option) => option.value === value)
        ? undefined
        : `Must be one of: ${field.options.map((option) => option.label).join(', ')}.`;
    case 'image': {
      const assetId = imageAssetId(value);
      if (assetId === undefined) return 'Must be a picture.';
      if (imageFieldAllowsUpload(field)) return undefined;
      return field.assetOptions !== undefined &&
        !field.assetOptions.some((option) => option.assetId === assetId)
        ? 'This picture is not packaged with the template.'
        : undefined;
    }
    case 'color':
      return typeof value === 'string' && /^#[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/u.test(value)
        ? undefined
        : 'Must be a hex color.';
    case 'text':
    case 'multiline':
      return typeof value === 'string' ? undefined : 'Must be text.';
  }
}

function cellText(field: ListItemField, value: unknown): string {
  if (field.type === 'number' && typeof value === 'number') {
    const allowed = numberFieldAllowedValues(field);
    if (allowed?.includes(value) === true) {
      const label = numberFieldValueLabel(field, value);
      return label === String(value) ? label : `${label} (${String(value)})`;
    }
  }
  if (field.type === 'select' && typeof value === 'string') {
    const option = field.options.find((candidate) => candidate.value === value);
    if (option !== undefined) return option.label === value ? value : `${option.label} (${value})`;
  }
  if (field.type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'image') {
    const assetId = imageAssetId(value);
    const option = field.assetOptions?.find((candidate) => candidate.assetId === assetId);
    return option?.label ?? assetId ?? '—';
  }
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Compact, uncropped picture cell shared by direct Repeater and paged Sequence data tables. */
export function StructuredCellValue({
  field,
  value,
  pictureUrls,
}: {
  field: ListItemField;
  value: unknown;
  pictureUrls: Readonly<Record<string, string>>;
}): JSX.Element {
  if (field.type !== 'image') return <>{cellText(field, value)}</>;
  const assetId = imageAssetId(value);
  if (assetId === undefined) return <>—</>;
  const src = assetId.startsWith('data:image/') ? assetId : pictureUrls[assetId];
  if (src === undefined) return <>—</>;
  const label =
    field.assetOptions?.find((option) => option.assetId === assetId)?.label ?? 'Picture';
  return <img src={src} alt="" title={label} style={styles.image} loading="lazy" />;
}

/** Read-only, schema-aware rows shared by direct Repeater and paged Sequence file flows. */
export function StructuredRowsDialog({
  open,
  onClose,
  rows,
  fields,
  label,
  templateId,
  channel,
}: {
  open: boolean;
  onClose: () => void;
  rows: readonly ListItem[];
  fields: readonly ListItemField[];
  label: string;
  templateId?: string | undefined;
  channel?: number | undefined;
}): JSX.Element | null {
  const pictureUrls = useAuthoredPictureThumbnails(templateId, channel);
  if (!open) return null;
  const invalidCount = rows.reduce(
    (total, row) =>
      total +
      fields.filter((field) => structuredCellError(field, row[field.id]) !== undefined).length,
    0,
  );

  return (
    <Modal
      title="Current file-only data"
      subtitle={label}
      ariaLabel={`Current file-only data · ${label}`}
      size="wide"
      frame="fixed"
      onClose={onClose}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Close
        </ModalAction>
      }
    >
      <div style={styles.summary} role="status">
        <Tag>{String(rows.length)} rows</Tag>
        <Tag>{String(fields.length)} columns</Tag>
        <Tag
          className={
            invalidCount === 0
              ? 'cg-sequence-data-status--valid'
              : 'cg-sequence-data-status--invalid'
          }
        >
          {invalidCount === 0
            ? 'All values match the template'
            : `${String(invalidCount)} invalid ${invalidCount === 1 ? 'cell' : 'cells'}`}
        </Tag>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th scope="col" style={{ ...styles.head, ...styles.rowNumber }}>
                Row
              </th>
              {fields.map((field) => (
                <th key={field.id} scope="col" style={styles.head} title={field.id}>
                  {field.label.trim() || field.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th scope="row" style={{ ...styles.cell, ...styles.rowNumber, textAlign: 'start' }}>
                  {String(rowIndex + 1)}
                </th>
                {fields.map((field) => {
                  const error = structuredCellError(field, row[field.id]);
                  return (
                    <td
                      key={field.id}
                      style={{ ...styles.cell, ...(error === undefined ? {} : styles.invalid) }}
                      title={error}
                      aria-label={
                        error === undefined
                          ? undefined
                          : `Row ${String(rowIndex + 1)}, ${field.label || field.id}: ${error}`
                      }
                    >
                      <StructuredCellValue
                        field={field}
                        value={row[field.id]}
                        pictureUrls={pictureUrls}
                      />
                      {error !== undefined && <span style={styles.error}>{error}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

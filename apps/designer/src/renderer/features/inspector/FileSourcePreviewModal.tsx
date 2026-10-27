import { useState } from 'react';
import type { FieldValue, ListItem } from '@cg/shared-schema';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
import { DesignerDelimitersModal } from '../settings/DesignerDelimitersModal.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { isVisibleWindowsSourcePath } from './bridgeTextFile.js';
import * as s from './FileSourcePreviewModal.css.js';

export function FileSourcePreviewModal({
  sourcePath,
  bridgePath,
  content,
  value,
  delimiter,
  delimiterValues,
  delimiterLabels,
  onDelimiter,
  onReload,
  onClose,
}: {
  sourcePath: string;
  bridgePath: string;
  content: string;
  value: FieldValue;
  delimiter?: string | undefined;
  delimiterValues: readonly string[];
  delimiterLabels: readonly string[];
  onDelimiter?: ((delimiter: string) => void) | undefined;
  onReload: () => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const items = Array.isArray(value) ? (value as ListItem[]) : null;
  const [manageDelimitersOpen, setManageDelimitersOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const fullSourcePathVisible = isVisibleWindowsSourcePath(sourcePath);
  const reload = async (): Promise<void> => {
    setReloading(true);
    setReloadError(null);
    try {
      await onReload();
    } catch (cause) {
      setReloadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReloading(false);
    }
  };
  return (
    <>
      <Modal
        title="File content and fields"
        ariaLabel="File content and fields"
        width="min(1120px, 96vw)"
        minBodyHeight="66vh"
        onClose={onClose}
        footer={<ModalButton onClick={onClose}>Done</ModalButton>}
      >
        <div className={s.layout}>
          <section className={s.sourceCard} aria-label="Selected file path">
            <div>
              <span>{fullSourcePathVisible ? 'Full Windows/UNC path' : 'Selected file'}</span>
              <code>{sourcePath}</code>
              <Button
                size="sm"
                variant="secondary"
                disabled={reloading}
                aria-label="Reload selected file"
                onClick={() => void reload()}
              >
                <Icon icon={RefreshCw} size={14} />
                {reloading ? 'Reloading…' : 'Reload'}
              </Button>
              {!fullSourcePathVisible && (
                <small>
                  Browser mode does not expose the full disk path. Open the installed Designer to
                  verify the complete Windows/UNC path.
                </small>
              )}
            </div>
            <div>
              <span>Saved for CG Control</span>
              <code>{bridgePath}</code>
            </div>
          </section>
          {reloadError !== null && (
            <p className={s.reloadError} role="alert">
              {reloadError}
            </p>
          )}

          {onDelimiter !== undefined && (
            <div className={s.delimiterRow}>
              <span>
                <strong>File delimiter</strong>
                <small>Choose how the file becomes separate list items.</small>
              </span>
              <div className={s.delimiterActions}>
                <Select
                  value={delimiter ?? ''}
                  onChange={(event) => onDelimiter(event.currentTarget.value)}
                  aria-label="File delimiter"
                >
                  {delimiterValues.map((option, index) => (
                    <option key={option} value={option}>
                      {delimiterLabels[index] ?? option}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" onClick={() => setManageDelimitersOpen(true)}>
                  Manage delimiters…
                </Button>
              </div>
            </div>
          )}

          <div className={s.contentGrid}>
            <label className={s.panel}>
              <span className={s.panelHeading}>
                <strong>File content</strong>
                <small>{String(content.length)} characters</small>
              </span>
              <textarea readOnly value={content} aria-label="Current file content" />
            </label>

            <section className={s.panel} aria-label="Field preview">
              <span className={s.panelHeading}>
                <strong>{items === null ? 'Field value' : 'Parsed fields'}</strong>
                {items !== null && <small>{String(items.length)} items</small>}
              </span>
              <div className={s.previewBody}>
                {items === null ? (
                  <pre>{typeof value === 'string' ? value : String(value)}</pre>
                ) : items.length === 0 ? (
                  <p className={s.empty}>No items were found with this delimiter.</p>
                ) : (
                  <ol className={s.items}>
                    {items.map((item, index) => (
                      <li key={item.id}>
                        <span>{String(index + 1)}</span>
                        <bdi>{typeof item.text === 'string' ? item.text : ''}</bdi>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        </div>
      </Modal>
      {manageDelimitersOpen && (
        <DesignerDelimitersModal onClose={() => setManageDelimitersOpen(false)} />
      )}
    </>
  );
}

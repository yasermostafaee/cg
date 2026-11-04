import { useEffect, useState } from 'react';
import { useHoldsStationAdmin } from '../../hooks/useCanOperate.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { TextInput } from '../../ui/TextInput.js';

/**
 * The station-wide folder as seen by the CG Bridge server. A console may run on another computer,
 * so this is intentionally a server path field rather than a native picker for the console's disk.
 */
export function SharedFilesSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  const admin = useHoldsStationAdmin();
  const [stored, setStored] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    void window.cg.sharedFiles
      .get()
      .then((state) => {
        if (cancelled) return;
        setStored(state.path);
        setDraft(state.path);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        report({
          role: 'refusal',
          text: err instanceof Error ? err.message : 'Could not read the shared-files path.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  const save = async (): Promise<{ accepted: boolean; message?: string }> => {
    const result = await window.cg.sharedFiles.set({ path: draft.trim() });
    if (result.ok && result.path !== undefined) {
      setStored(result.path);
      setDraft(result.path);
      report(result.message === undefined ? null : { role: 'notice', text: result.message });
    } else {
      report({ role: 'refusal', text: result.message ?? 'The shared-files path was not changed.' });
    }
    return {
      accepted: result.ok,
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  };

  return (
    <section className="cg-card" aria-label="Shared files folder" data-shared-files-section="">
      <div className="cg-card__head">
        <span className="cg-card__title">Shared files folder</span>
      </div>
      <div className="cg-card__body">
        {admin ? (
          <div className="cg-setup-fields cg-shared-files-fields">
            <label className="cg-setup-field" htmlFor="shared-files-path">
              <span className="cg-setup-field__label">Path on CG Control server</span>
              <TextInput
                id="shared-files-path"
                className="cg-field--mono"
                dir="ltr"
                value={draft}
                onChange={setDraft}
              />
            </label>
            <div className="cg-shared-files-action">
              <AsyncButton
                variant="primary"
                disabled={draft.trim() === '' || draft.trim() === stored}
                run={save}
              >
                Save path
              </AsyncButton>
            </div>
          </div>
        ) : (
          <div className="cg-field-fact" data-shared-files-path="">
            <bdi>{stored ?? 'Loading…'}</bdi>
          </div>
        )}
      </div>
    </section>
  );
}

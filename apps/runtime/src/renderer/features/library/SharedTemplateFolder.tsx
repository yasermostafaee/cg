import { useEffect, useState } from 'react';
import { ArrowUp, FileUp, Folder, RotateCw } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { base64ToBytes } from './packageBytes.js';

const FOLDER_KEY = 'cg.runtime.shared-template-folder.v1';
type FolderListing = Awaited<ReturnType<typeof window.cg.sharedFiles.templateFolder>>;

function recentFolder(): string {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function SharedTemplateFolder({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (file: File) => void;
}): JSX.Element {
  const [folder, setFolder] = useState(recentFolder);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProblem(null);
    setSelected(null);
    setListing(null);
    void window.cg.sharedFiles.templateFolder({ folder }).then(
      (result) => {
        if (!active) return;
        setListing(result);
        setLoading(false);
        try {
          localStorage.setItem(FOLDER_KEY, result.folder);
        } catch {
          // Listing still works for the current session.
        }
      },
      () => {
        if (!active) return;
        setProblem(
          'CG Bridge could not read this folder. Check the Shared files path in Station setup.',
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [folder, revision]);

  async function readPackage(): Promise<void> {
    if (selected === null || loading || reading) return;
    setReading(true);
    setProblem(null);
    try {
      const result = await window.cg.sharedFiles.templateRead({ folder, name: selected });
      const bytes = Uint8Array.from(base64ToBytes(result.base64));
      onImport(new File([bytes.buffer], result.name, { type: 'application/octet-stream' }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'CG Bridge could not read this package.');
      setReading(false);
    }
  }

  const up = folder.split('/').slice(0, -1).join('/');
  return (
    <Modal
      title="Shared template folder"
      layer="sub"
      onClose={() => {
        if (!reading) onClose();
      }}
      message={problem === null ? [] : { role: 'refusal', text: problem }}
      footer={
        <>
          <ModalAction actionRole="cancel" disabled={reading} onClick={onClose}>
            Cancel
          </ModalAction>
          <ModalAction
            actionRole="primary"
            disabled={selected === null || loading || reading}
            onClick={() => void readPackage()}
          >
            {reading ? 'Reading…' : 'Import package'}
          </ModalAction>
        </>
      }
    >
      <div className="cg-setup-filter">
        <Button variant="neutral" disabled={folder === '' || reading} onClick={() => setFolder(up)}>
          <Icon icon={ArrowUp} size={14} /> Up
        </Button>
        <Button
          variant="neutral"
          disabled={loading || reading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <Icon icon={RotateCw} size={14} /> Refresh
        </Button>
      </div>
      <p>
        <IsolatedName>{listing?.root ?? 'Shared files'}</IsolatedName>
        {folder !== '' && (
          <>
            {' '}
            / <IsolatedName>{folder}</IsolatedName>
          </>
        )}
      </p>
      {loading && <p>Reading folder…</p>}
      {listing?.entries.length === 0 && <p>No folders or .vcg packages here.</p>}
      {listing !== null && listing.entries.length > 0 && (
        <div className="cg-table-scroll">
          <table className="cg-table" aria-label="Shared template packages">
            <tbody>
              {listing.entries.map(({ kind, name }) => (
                <tr key={name}>
                  <td>
                    <Button
                      variant="ghost"
                      active={selected === name}
                      aria-pressed={kind === 'package' ? selected === name : undefined}
                      disabled={reading}
                      onClick={() => {
                        if (kind === 'folder') setFolder([folder, name].filter(Boolean).join('/'));
                        else setSelected(name);
                      }}
                    >
                      <Icon icon={kind === 'folder' ? Folder : FileUp} size={14} />
                      <IsolatedName>{name}</IsolatedName>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

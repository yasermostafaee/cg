import { feedbackFailure, useUiText } from '../../i18n/locale.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  Check,
  FileUp,
  Folder,
  RotateCw,
} from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { readSharedTemplateFile } from './sharedTemplateSource.js';
import type { SharedTemplateSource } from './templateSourceStore.js';
import { SharedTemplateThumbnail } from './SharedTemplateThumbnail.js';
import { createThumbnailLoader, type ThumbnailLoader } from './templateThumbnailLoader.js';

const FOLDER_KEY = 'cg.runtime.shared-template-folder.v1';
type FolderListing = Awaited<ReturnType<typeof window.cg.sharedFiles.templateFolder>>;
type Thumbnail = Awaited<ReturnType<typeof window.cg.sharedFiles.templateThumbnail>>['thumbnail'];
type ThumbnailRequest = Parameters<typeof window.cg.sharedFiles.templateThumbnail>[0];

const entryNames = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });

function compareEntryNames(a: string, b: string): number {
  return entryNames.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

function orderedEntries(
  entries: readonly FolderListing['entries'][number][],
  newestFirst: boolean,
): FolderListing['entries'] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'package' && b.kind === 'package') {
      const first = a.modifiedAtMs;
      const second = b.modifiedAtMs;
      if (first !== second) {
        if (first === undefined) return 1;
        if (second === undefined) return -1;
        return newestFirst ? second - first : first - second;
      }
    }
    return compareEntryNames(a.name, b.name);
  });
}

function folderParts(folder: string): string[] {
  return folder.split(/[/\\]/).filter(Boolean);
}

function recentFolder(): string {
  try {
    return folderParts(localStorage.getItem(FOLDER_KEY) ?? '').join('/');
  } catch {
    return '';
  }
}

function VisiblePackageThumbnail({
  folder,
  name,
  expectedRoot,
  load,
}: {
  folder: string;
  name: string;
  expectedRoot: string;
  load: ThumbnailLoader<ThumbnailRequest>;
}): JSX.Element {
  const tile = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<Thumbnail>();
  useEffect(() => {
    const element = tile.current;
    if (element === null) return;
    const cancel = new AbortController();
    const read = () => {
      void load({ folder, name, expectedRoot }, cancel.signal).then((result) => {
        if (!cancel.signal.aborted) setPreview(result);
      });
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            read();
          });
    if (observer === null) read();
    else observer.observe(element);
    return () => {
      cancel.abort();
      observer?.disconnect();
    };
  }, [folder, name, expectedRoot, load]);

  return (
    <span
      ref={tile}
      className="cg-shared-template-entry__preview"
      data-thumbnail-state={
        preview === undefined ? 'loading' : preview === null ? 'unavailable' : 'ready'
      }
      aria-hidden="true"
    >
      <SharedTemplateThumbnail
        preview={preview ?? null}
        fallback={<Icon icon={FileUp} size={14} />}
      />
    </span>
  );
}

export function SharedTemplateFolder({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (file: File, source?: SharedTemplateSource) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const [folder, setFolder] = useState(recentFolder);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadThumbnail] = useState(() =>
    createThumbnailLoader((request: ThumbnailRequest) =>
      window.cg.sharedFiles.templateThumbnail(request),
    ),
  );
  const currentFolder = listing?.folder ?? folder;
  const trail = folderParts(currentFolder);
  const parent = trail.slice(0, -1).join('/');
  const entries = useMemo(
    () => (listing === null ? [] : orderedEntries(listing.entries, newestFirst)),
    [listing, newestFirst],
  );

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
      (error: unknown) => {
        if (!active) return;
        setProblem(
          feedbackFailure(
            error instanceof Error && error.message.startsWith('CG Bridge ') ? error : undefined,
            'CG Bridge could not read this folder. Check the Shared files path in Station setup.',
          ),
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [folder, revision]);

  async function readPackage(): Promise<void> {
    if (selected === null || listing === null || loading || reading) return;
    setReading(true);
    setProblem(null);
    try {
      const bridgeAddress = window.cg.link.bridgeAddress();
      const path = { folder: listing.folder, root: listing.root, name: selected };
      const file = await readSharedTemplateFile(path);
      if (window.cg.link.bridgeAddress() !== bridgeAddress) {
        throw new Error('CG Bridge changed. Open Shared folder again.');
      }
      onImport(file, bridgeAddress === null ? undefined : { ...path, bridgeAddress });
    } catch (error) {
      setProblem(feedbackFailure(error, 'CG Bridge could not read this package.'));
      setReading(false);
    }
  }

  return (
    <Modal
      title={localizeUi('Shared template folder')}
      layer="sub"
      size="wide"
      frame="fixed"
      onClose={() => {
        if (!reading) onClose();
      }}
      message={problem === null ? [] : { role: 'refusal', text: problem }}
      footer={
        <>
          <ModalAction actionRole="cancel" disabled={reading} onClick={onClose}>
            {localizeUi('Cancel')}
          </ModalAction>
          <ModalAction
            actionRole="primary"
            disabled={selected === null || loading || reading}
            onClick={() => void readPackage()}
          >
            {localizeUi(reading ? 'Reading…' : 'Import package')}
          </ModalAction>
        </>
      }
    >
      <div className="cg-shared-template-browser" data-shared-template-browser="">
        <div className="cg-setup-filter cg-shared-template-toolbar">
          <Button
            variant="neutral"
            disabled={trail.length === 0}
            title={localizeUi(
              trail.length === 0 ? 'At the Shared files root' : 'Open parent folder',
            )}
            onClick={() => setFolder(parent)}
          >
            <Icon icon={ArrowUp} size={14} /> {localizeUi('Up')}
          </Button>
          <Button
            variant="neutral"
            disabled={loading || reading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <Icon icon={RotateCw} size={14} /> {localizeUi('Refresh')}
          </Button>
          <Button
            variant="neutral"
            className="cg-shared-template-sort"
            disabled={reading}
            aria-label={localizeUi(
              newestFirst ? 'Newest first. Show oldest first' : 'Oldest first. Show newest first',
            )}
            title={localizeUi('Sort templates by date modified')}
            onClick={() => setNewestFirst((current) => !current)}
          >
            <Icon icon={newestFirst ? ArrowDownWideNarrow : ArrowUpNarrowWide} size={14} />
            {localizeUi(newestFirst ? 'Newest first' : 'Oldest first')}
          </Button>
        </div>
        <p
          className="cg-shared-template-location"
          role="status"
          aria-label={localizeUi('Shared folder location')}
        >
          <IsolatedName alignWithInterface title={listing?.root ?? localizeUi('Shared files')}>
            {localizeUi('Shared files')}
          </IsolatedName>
          {trail.map((part, index) => (
            <span key={trail.slice(0, index + 1).join('/')}>
              <span aria-hidden="true"> / </span>
              <IsolatedName alignWithInterface>{part}</IsolatedName>
            </span>
          ))}
        </p>
        <div className="cg-table-scroll cg-shared-template-list" data-shared-template-list="">
          {loading && <p>{localizeUi('Reading folder…')}</p>}
          {listing?.entries.length === 0 && (
            <p>{localizeUi('No folders or .vcg packages here.')}</p>
          )}
          {listing !== null && entries.length > 0 && (
            <table className="cg-table" aria-label={localizeUi('Shared template packages')}>
              <tbody>
                {entries.map(({ kind, name }) => {
                  const withPreview = kind === 'package' && listing.thumbnails === true;
                  return (
                    <tr key={name}>
                      <td>
                        <div className="cg-shared-template-entry-row">
                          <Button
                            variant="ghost"
                            className="cg-shared-template-entry"
                            aria-pressed={kind === 'package' ? selected === name : undefined}
                            disabled={reading}
                            onClick={() => {
                              if (kind === 'folder') setFolder([...trail, name].join('/'));
                              else setSelected(name);
                            }}
                          >
                            {withPreview ? (
                              <span
                                className="cg-shared-template-entry__preview-space"
                                aria-hidden="true"
                              />
                            ) : kind === 'folder' ? (
                              <span
                                className="cg-shared-template-entry__folder-icon"
                                aria-hidden="true"
                              >
                                <Icon icon={Folder} size={28} />
                              </span>
                            ) : (
                              <Icon icon={FileUp} size={14} />
                            )}
                            <IsolatedName
                              alignWithInterface
                              className="cg-shared-template-entry__name"
                            >
                              {name}
                            </IsolatedName>
                            {selected === name && <Icon icon={Check} size={14} />}
                          </Button>
                          {withPreview && (
                            <VisiblePackageThumbnail
                              key={JSON.stringify([listing.root, currentFolder, revision, name])}
                              folder={currentFolder}
                              name={name}
                              expectedRoot={listing.root}
                              load={loadThumbnail}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Public surface of @cg/storage.
//
// One `Workspace` interface, three backends (File System Access for real
// on-disk folders, OPFS for sandboxed real files, in-memory for tests),
// plus a small KV for preferences and IndexedDB handle persistence.

export type { Workspace, WorkspaceEntry, KeyValueStore } from './types.js';

export { DirectoryWorkspace } from './directory-workspace.js';
export { MemoryWorkspace } from './memory-workspace.js';

export { LocalStorageKv, MemoryKv } from './kv.js';
export {
  decodeTextSource,
  MAX_TEXT_SOURCE_BYTES,
  readTextSourceFile,
  WORD_TEXT_FILE_TYPES,
} from './document-text.js';

export {
  isFileSystemAccessSupported,
  isOpfsSupported,
  pickDirectoryWorkspace,
  openOpfsWorkspace,
  connectAndRememberDirectory,
  restoreRememberedDirectory,
} from './capabilities.js';

export {
  saveDirectoryHandle,
  loadDirectoryHandle,
  forgetDirectoryHandle,
  saveFileHandle,
  loadFileHandle,
  forgetFileHandle,
  ensureHandlePermission,
} from './handle-store.js';

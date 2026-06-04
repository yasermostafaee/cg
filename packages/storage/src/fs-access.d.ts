// Minimal ambient declarations for the File System Access API picker entry
// points that are not yet in TypeScript's bundled `lib.dom.d.ts`.
//
// `FileSystemDirectoryHandle`, `FileSystemFileHandle`,
// `FileSystemWritableFileStream`, and `StorageManager.getDirectory()` (OPFS)
// already ship in lib.dom; only the `show*Picker` entry points are missing.

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
}

interface Window {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor,
  ) => Promise<PermissionState>;
}

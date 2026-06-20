// Ambient declarations for the File System Access API entry points the
// Designer uses for native file save/load dialogs. lib.dom already ships
// the `FileSystemFileHandle` + `FileSystemWritableFileStream` types; only
// the `show*Picker` entry points are missing.

interface SaveFilePickerOptions {
  suggestedName?: string;
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
  types?: readonly {
    description?: string;
    accept: Record<string, readonly string[]>;
  }[];
  excludeAcceptAllOption?: boolean;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
  types?: readonly {
    description?: string;
    accept: Record<string, readonly string[]>;
  }[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

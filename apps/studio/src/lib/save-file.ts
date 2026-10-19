/** How a save ended: written where the author chose, handed to the browser's downloads, or called off. */
export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled';

export interface SaveOptions {
  suggestedName: string;
  /** For the save dialog, for example "SillyTavern 主题". */
  description: string;
  mimeType: string;
  extension: string;
}

// The File System Access save dialog is newer than TypeScript's DOM types.
interface SaveFilePicker {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle>;
}

/**
 * Saves a file the author asked for (docs/plan/P1.md §9). Call it from their
 * click: the save dialog opens only then. Where the browser has no save
 * dialog, the file goes to its downloads, and the outcome says so.
 */
export async function saveFile(content: Blob, options: SaveOptions): Promise<SaveOutcome> {
  const { showSaveFilePicker } = window as Window & Partial<SaveFilePicker>;
  if (!showSaveFilePicker) {
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.suggestedName;
    link.click();
    // The download has started from the URL by now.
    setTimeout(() => URL.revokeObjectURL(url));
    return 'downloaded';
  }
  let handle: FileSystemFileHandle;
  try {
    handle = await showSaveFilePicker.call(window, {
      suggestedName: options.suggestedName,
      types: [
        { description: options.description, accept: { [options.mimeType]: [options.extension] } },
      ],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return 'saved';
}

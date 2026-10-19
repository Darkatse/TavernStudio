import { zip, type Zippable } from 'fflate';

/**
 * Zips files at their paths. Import this module where the author asks for a
 * zip, never statically from the first screen: it brings the zip library.
 */
export function zipFiles(files: Zippable): Promise<Blob> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) =>
      error
        ? reject(error)
        : resolve(new Blob([new Uint8Array(data)], { type: 'application/zip' })),
    );
  });
}

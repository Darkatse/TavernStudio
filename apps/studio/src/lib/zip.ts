import { unzip, zip, type Unzipped, type Zippable } from 'fflate';

/*
 * Import this module where the author asks for a zip, never statically from
 * the first screen: it brings the zip library.
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

/** Folders are included, as paths ending in a slash. */
export function unzipFiles(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

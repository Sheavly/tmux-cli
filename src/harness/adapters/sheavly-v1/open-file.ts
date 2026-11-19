import { open, type FileHandle } from 'node:fs/promises';

/** A file opened for reading, or nothing when it is not there (a chat has no history until it speaks). */
export async function openIfExists(file: string): Promise<FileHandle | undefined> {
  try {
    return await open(file, 'r');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return undefined;

    throw caughtError;
  }
}

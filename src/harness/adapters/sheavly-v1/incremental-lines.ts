import { stat, type FileHandle } from 'node:fs/promises';
import { openIfExists } from './open-file.ts';

const READ_CHUNK_BYTES = 1024 * 1024;

/** Where reading an append-only file got to, so each look reads only what was added since. */
export type Cursor = {
  /** Bytes of the file read so far. */
  offset: number;
  /** The end of the last read, which is a line that isn't complete yet. */
  carry: Buffer;
};

export function newCursor(): Cursor {
  return { offset: 0, carry: Buffer.alloc(0) };
}

/**
 * Puts the cursor `bytes` before the end of a file that is longer than that, so a reader that only
 * wants the latest does not start with megabytes. True when it did; the first line read after it is
 * cut off at its start. Nothing happens when the file is shorter or not there.
 */
export async function skipToTail(params: {
  file: string;
  cursor: Cursor;
  bytes: number;
}): Promise<boolean> {
  const size = await stat(params.file).then(
    (info) => info.size,
    () => 0,
  );

  if (size <= params.bytes) return false;

  params.cursor.offset = size - params.bytes;

  return true;
}

/**
 * The lines added to `file` since the cursor, which moves past them. A file that got shorter is
 * read again from its start and `restarted` says so, since whatever was built from it is stale.
 * Nothing when the file is not there.
 */
export async function readAppended(params: {
  file: string;
  cursor: Cursor;
}): Promise<{ lines: string[]; restarted: boolean } | undefined> {
  const { file, cursor } = params;
  const handle = await openIfExists(file);

  if (!handle) return undefined;

  try {
    const { size } = await handle.stat();
    const restarted = size < cursor.offset;

    if (restarted) {
      cursor.offset = 0;
      cursor.carry = Buffer.alloc(0);
    }

    const lines: string[] = [];

    while (cursor.offset < size) {
      const chunk = await readNewLines({ handle, cursor, size });

      if (chunk === undefined) break;

      lines.push(...chunk);
    }

    return { lines, restarted };
  } finally {
    await handle.close();
  }
}

/**
 * Reads the next chunk and gives the lines it completed; the end of it that is not a whole line
 * yet is kept in the cursor for the next read. Nothing when the file ended sooner than its size said.
 */
async function readNewLines(params: {
  handle: FileHandle;
  cursor: Cursor;
  size: number;
}): Promise<string[] | undefined> {
  const { handle, cursor, size } = params;
  const buffer = Buffer.alloc(Math.min(READ_CHUNK_BYTES, size - cursor.offset));
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, cursor.offset);

  if (bytesRead === 0) return undefined;

  cursor.offset += bytesRead;

  const data = Buffer.concat([cursor.carry, buffer.subarray(0, bytesRead)]);
  const end = data.lastIndexOf(0x0a);

  cursor.carry = end === -1 ? data : data.subarray(end + 1);

  return end === -1 ? [] : data.subarray(0, end).toString('utf8').split('\n');
}

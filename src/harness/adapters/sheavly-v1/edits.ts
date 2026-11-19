import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { EditKind, EditState } from '../../adapter.types.ts';
import { openIfExists } from './open-file.ts';

/** The tools that change a file, and what each one does to it. */
const EDIT_TOOLS: Record<string, EditKind> = {
  edit_file: 'edited',
  write_file: 'written',
  delete_file: 'deleted',
};

const READ_CHUNK_BYTES = 1024 * 1024;

/** Where reading a chat's history got to, so each look reads only what was added since. */
type Cursor = {
  /** Bytes of the history file read so far. */
  offset: number;
  /** The end of the last read, which is a line that isn't complete yet. */
  carry: Buffer;
};

/** One line of a chat's history, as far as the file changes in it are concerned. */
type HistoryRecord = {
  at?: unknown;
  entry?: { role?: unknown; toolCalls?: unknown; at?: unknown };
};

function cursorOf(state: EditState): Cursor {
  const cursor = (state.cursor as Cursor | undefined) ?? { offset: 0, carry: Buffer.alloc(0) };

  state.cursor = cursor;

  return cursor;
}

/**
 * The file changes one history line records: an assistant message's tool calls. (A `messages-replay`
 * record repeats earlier ones inside a message, so only the message's own `toolCalls` count.)
 */
export function parseEditLine(line: string): { path: string; kind: EditKind; at: number }[] {
  if (!line.includes('"toolCalls"')) return [];

  let record: HistoryRecord;

  try {
    record = JSON.parse(line) as HistoryRecord;
  } catch {
    return [];
  }

  const calls = record.entry?.role === 'assistant' ? record.entry.toolCalls : undefined;

  if (!Array.isArray(calls)) return [];

  // Newer histories time a message inside the entry, older ones on the record around it.
  const stamp = [record.entry?.at, record.at].find((value) => typeof value === 'number');
  const at = typeof stamp === 'number' ? stamp : 0;
  const changes: { path: string; kind: EditKind; at: number }[] = [];

  for (const call of calls as { name?: unknown; input?: { path?: unknown } }[]) {
    const kind = typeof call?.name === 'string' ? EDIT_TOOLS[call.name] : undefined;
    const file = call?.input?.path;

    if (kind && typeof file === 'string' && file !== '') changes.push({ path: file, kind, at });
  }

  return changes;
}

/**
 * Reads what was added to a chat's history since the last call and folds its file changes into the
 * state. Returns whether anything changed. A history that got shorter starts over.
 */
export async function updateEdits(params: {
  dir: string;
  workspace: string;
  state: EditState;
}): Promise<boolean> {
  const { dir, workspace, state } = params;
  const cursor = cursorOf(state);
  const handle = await openIfExists(path.join(dir, 'history.jsonl'));

  if (!handle) return false;

  let changed = false;

  try {
    const { size } = await handle.stat();

    if (size < cursor.offset) {
      cursor.offset = 0;
      cursor.carry = Buffer.alloc(0);
      state.files.clear();
      changed = true;
    }

    while (cursor.offset < size) {
      const lines = await readNewLines({ handle, cursor, size });

      if (lines === undefined) break;

      for (const change of lines.flatMap((line) => parseEditLine(line))) {
        fold({ state, workspace, change });
        changed = true;
      }
    }
  } finally {
    await handle.close();
  }

  return changed;
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

function fold(params: {
  state: EditState;
  workspace: string;
  change: { path: string; kind: EditKind; at: number };
}): void {
  const { state, workspace, change } = params;
  const file = path.resolve(workspace, change.path);
  const before = state.files.get(file);

  state.files.set(file, {
    path: file,
    kind: change.kind,
    at: change.at,
    count: (before?.count ?? 0) + 1,
  });
}

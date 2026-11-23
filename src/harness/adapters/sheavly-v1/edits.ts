import path from 'node:path';
import type { EditKind, EditState } from '../../adapter.types.ts';
import { newCursor, readAppendedInChunks, type Cursor } from './incremental-lines.ts';

/** The tools that change a file, and what each one does to it. */
export const EDIT_TOOLS: Record<string, EditKind> = {
  edit_file: 'edited',
  write_file: 'written',
  delete_file: 'deleted',
};

/** One line of a chat's history, as far as the file changes in it are concerned. */
type HistoryRecord = {
  at?: unknown;
  entry?: { role?: unknown; toolCalls?: unknown; at?: unknown };
};

function cursorOf(state: EditState): Cursor {
  const cursor = (state.cursor as Cursor | undefined) ?? newCursor();

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
  let changed = false;

  await readAppendedInChunks({
    file: path.join(dir, 'history.jsonl'),
    cursor: cursorOf(state),
    onRestart: () => {
      state.files.clear();
      changed = true;
    },
    onLines: (lines) => {
      for (const change of lines.flatMap((line) => parseEditLine(line))) {
        foldEdit({ state, workspace, change });
        changed = true;
      }
    },
  });

  return changed;
}

export function foldEdit(params: {
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

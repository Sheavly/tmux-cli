import type { EditedFile, EditState } from './adapter.types.ts';

export function newEditState(): EditState {
  return { files: new Map(), cursor: undefined };
}

/** The changed files, the most recently changed first. */
export function latestFirst(state: EditState): EditedFile[] {
  return [...state.files.values()].toSorted((a, b) => b.at - a.at);
}

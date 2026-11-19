import type { ViewRow } from './diff.ts';

/** A file ready to show: its rows, and how many lines changed. */
export type Loaded = {
  rows: ViewRow[];
  added: number;
  removed: number;
  /** Why there is nothing to show, or what is special about what is shown. */
  note: string;
};

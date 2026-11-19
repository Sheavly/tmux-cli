import os from 'node:os';
import path from 'node:path';
import type { EditKind, EditedFile } from '../harness/adapter.types.ts';
import type { Accent } from '../sidebar/render.ts';
import { relativeTime } from '../sidebar/view.ts';
import { displayWidth, fitColumns, takeLastColumns } from '../terminal/width.utils.ts';

const MARKS: Record<EditKind, { mark: string; style: Accent['style'] }> = {
  edited: { mark: '~', style: 'yellow' },
  written: { mark: '+', style: 'green' },
  deleted: { mark: '✕', style: 'red' },
};

/**
 * One line of the edited-files list: a mark, the path (its end kept if long) and how long ago, with
 * the mark in its colour and the folder part of the path and the age dimmed so the name stands out.
 */
export function fileItem(params: {
  file: EditedFile;
  workspace: string;
  width: number;
  now: number;
}): { text: string; accents: Accent[] } {
  const { file, workspace, width, now } = params;
  const age = file.at > 0 ? relativeTime({ now, then: file.at }) : '';
  const nameWidth = Math.max(8, width - 7);
  const name = displayPath(file.path, workspace, nameWidth);
  const { mark, style } = MARKS[file.kind];
  const folder = name.lastIndexOf('/') + 1;

  return {
    text: `${mark} ${fitColumns(name, nameWidth)} ${age.padStart(4)}`,
    accents: [
      { start: 0, length: 1, style },
      ...(folder > 0 ? [{ start: 2, length: folder, style: 'dim' as const }] : []),
      { start: 2 + nameWidth + 1, length: 4, style: 'dim' },
    ],
  };
}

/** Relative to the chat's folder when inside it, else with `~`; a long path keeps its end. */
export function displayPath(file: string, workspace: string, max: number): string {
  const relative = path.relative(workspace, file);
  const home = os.homedir();
  const inside = !relative.startsWith('..') && !path.isAbsolute(relative);
  const text = inside ? relative : withHome(file, home);

  return displayWidth(text) <= max ? text : `…${takeLastColumns(text, max - 1)}`;
}

/** A path under the home folder written with `~`; any other path as it is. */
function withHome(file: string, home: string): string {
  if (file === home || file.startsWith(`${home}/`)) return `~${file.slice(home.length)}`;

  return file;
}

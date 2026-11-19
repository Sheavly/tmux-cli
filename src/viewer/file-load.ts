import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { git } from '../files/git.ts';
import { allAdded, buildRows, emptyDiff, parseDiff, type FileDiff, type ViewRow } from './diff.ts';
import type { Loaded } from './viewer.types.ts';

const MAX_BYTES = 5 * 1024 * 1024;

/** The file's rows, marked with what changed since the last commit when it is in a git repo. */
export async function loadFile(file: string): Promise<Loaded> {
  const cwd = path.dirname(file);
  const name = path.basename(file);
  const info = await stat(file).catch(() => undefined);
  const inRepo = (await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok;

  if (!info) return loadDeleted({ cwd, name, inRepo });

  if (!info.isFile()) return empty('Not a file.');

  if (info.size > MAX_BYTES) return empty('Too large to view.');

  const buffer = await readFile(file);

  if (buffer.includes(0)) return empty('Binary file.');

  const lines = splitLines(buffer.toString('utf8'));
  const diff = inRepo ? await diffOf({ cwd, name, lineCount: lines.length }) : emptyDiff();

  return summarize({
    rows: buildRows({ lines, diff }),
    diff,
    note: inRepo ? '' : 'not in a git repo',
  });
}

/** A file that is gone: shown as it was at the last commit, every line removed. */
async function loadDeleted(params: {
  cwd: string;
  name: string;
  inRepo: boolean;
}): Promise<Loaded> {
  const { cwd, name, inRepo } = params;
  const before = inRepo ? await git(cwd, ['show', `HEAD:./${name}`]) : undefined;

  if (!before?.ok) return empty('The file does not exist.');

  const diff = emptyDiff();

  diff.removed.set(1, splitLines(before.stdout));

  return summarize({ rows: buildRows({ lines: [], diff }), diff, note: 'deleted' });
}

async function diffOf(params: { cwd: string; name: string; lineCount: number }): Promise<FileDiff> {
  const { cwd, name, lineCount } = params;
  const known = await git(cwd, ['ls-files', '--error-unmatch', '--', name]);

  if (!known.ok) {
    const ignored = await git(cwd, ['check-ignore', '-q', '--', name]);

    return ignored.ok ? emptyDiff() : allAdded(lineCount);
  }

  const diff = await git(cwd, ['diff', '-U0', '--no-color', '--no-ext-diff', 'HEAD', '--', name]);

  // No commit yet: everything is new.
  return diff.ok ? parseDiff(diff.stdout) : allAdded(lineCount);
}

function summarize(params: { rows: ViewRow[]; diff: FileDiff; note: string }): Loaded {
  const { rows, diff, note } = params;
  const removed = [...diff.removed.values()].reduce((sum, lines) => sum + lines.length, 0);

  return { rows, added: diff.added.size, removed, note };
}

function empty(note: string): Loaded {
  return { rows: [], added: 0, removed: 0, note };
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');

  if (lines.at(-1) === '') lines.pop();

  return lines;
}

import path from 'node:path';
import type { EditedFile } from '../harness/adapter.types.ts';
import { git } from './git.ts';
import { displayWidth, truncateColumns } from '../terminal/width.utils.ts';

/** The most recent commits looked through for the ones that took the chat's edits. */
const MAX_COMMITS = 300;
/** A commit's time has whole-second precision, so an edit within that second is in it. */
const SECOND_MS = 999;

/** What a changed file is waiting on, or where it went. */
export type Group =
  | { kind: 'uncommitted' }
  | { kind: 'commit'; hash: string; subject: string; at: number }
  /** Changed in the chat but the same as in the repository now, so there is nothing to commit. */
  | { kind: 'clean' }
  | { kind: 'other' };

export type Grouping = {
  /** In the order they are shown: uncommitted, the commits newest first, clean, then the rest. */
  groups: Group[];
  /** The index in `groups` of each file (by absolute path). */
  of: Map<string, number>;
};

/** The repository's current commit, or undefined when the folder is no repository or has none. */
export async function headOf(cwd: string): Promise<string | undefined> {
  const head = await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']);

  return head.ok ? head.stdout.trim() : undefined;
}

/** Whether the folder is inside a git work tree. */
export async function isRepository(cwd: string): Promise<boolean> {
  return (await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok;
}

type Commit = { hash: string; subject: string; at: number; files: Set<string> };

/** `git log --name-only` as commits, newest first, with the files each touched. */
export function parseLog(output: string): Commit[] {
  return output
    .split('\u0001')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const [header = '', ...names] = block.split('\n');
      const [hash = '', seconds = '0', ...subject] = header.split('\t');

      return {
        hash,
        subject: subject.join('\t'),
        at: Number(seconds) * 1000,
        files: new Set(names.filter((name) => name.trim() !== '')),
      };
    });
}

/**
 * Sorts the files a chat changed by the commit that took them in. A file went into the first commit
 * that touches it and was made after the file's latest change; with no such commit it is still
 * uncommitted. Files outside the repository, and ones git ignores, are not committed at all and
 * go last. Undefined when the folder is not a repository.
 */
export async function groupByCommit(params: {
  files: EditedFile[];
  workspace: string;
}): Promise<Grouping | undefined> {
  const { files, workspace } = params;
  const top = await git(workspace, ['rev-parse', '--show-toplevel']);

  if (!top.ok) return undefined;

  const root = top.stdout.trim();
  const commits = await recentCommits(workspace);
  const { assigned, inside } = assignToCommits({ files, root, commits });

  await markIgnored({ root, inside, assigned });
  await markClean({ root, assigned });

  return arrange(assigned);
}

/** Where a file went: the commit that took it in, or what it is waiting on. */
type Placement = Commit | 'uncommitted' | 'clean' | 'other';
type Assigned = Map<string, Placement>;

/** The recent commits, oldest first, so the first one that fits a file is the earliest. */
async function recentCommits(workspace: string): Promise<Commit[]> {
  const log = await git(workspace, [
    ...['log', '-n', String(MAX_COMMITS), '--no-renames', '--name-only'],
    '--format=%x01%H%x09%ct%x09%s',
  ]);

  return log.ok ? parseLog(log.stdout).toReversed() : [];
}

/**
 * Gives each file the first commit that touches it after its change. `inside` holds the ones no
 * commit took in that lie in the repository; the ones outside it are not committed at all.
 */
function assignToCommits(params: { files: EditedFile[]; root: string; commits: Commit[] }): {
  assigned: Assigned;
  inside: string[];
} {
  const { files, root, commits } = params;
  const assigned: Assigned = new Map();
  const inside: string[] = [];

  for (const file of files) {
    const relative = path.relative(root, file.path);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      assigned.set(file.path, 'other');
      continue;
    }

    const name = relative.split(path.sep).join('/');
    const commit = commits.find(
      (candidate) => candidate.at + SECOND_MS >= file.at && candidate.files.has(name),
    );

    assigned.set(file.path, commit ?? 'uncommitted');

    if (!commit) inside.push(file.path);
  }

  return { assigned, inside };
}

/** A file that git ignores is never committed, so it is not "waiting" for the next commit. */
async function markIgnored(params: {
  root: string;
  inside: string[];
  assigned: Assigned;
}): Promise<void> {
  const { root, inside, assigned } = params;

  if (inside.length === 0) return;

  const ignored = await git(root, ['check-ignore', '-z', '--stdin'], inside.join('\0'));

  for (const name of ignored.stdout.split('\0').filter((entry) => entry !== '')) {
    const match = inside.find((file) => file === name || path.resolve(root, name) === file);

    if (match) assigned.set(match, 'other');
  }
}

/**
 * No commit took the rest in, but that only means they are waiting for one if they differ from
 * the repository: a file created and deleted again, or changed back, has nothing to commit.
 */
async function markClean(params: { root: string; assigned: Assigned }): Promise<void> {
  const { root, assigned } = params;
  const waiting = [...assigned]
    .filter(([, value]) => value === 'uncommitted')
    .map(([file]) => file);

  if (waiting.length === 0) return;

  const changed = await changedPaths(root, waiting);

  for (const file of waiting) {
    const name = path.relative(root, file).split(path.sep).join('/');

    if (!changed.has(name)) assigned.set(file, 'clean');
  }
}

/** The groups in the order they are shown, and the group of each file. */
function arrange(assigned: Assigned): Grouping {
  const used = new Map<string, Commit>();

  for (const value of assigned.values()) {
    if (typeof value === 'object') used.set(value.hash, value);
  }

  const order = [...used.values()].toSorted((a, b) => b.at - a.at);
  const groups: Group[] = [
    { kind: 'uncommitted' },
    ...order.map((commit) => ({
      kind: 'commit' as const,
      hash: commit.hash,
      subject: commit.subject,
      at: commit.at,
    })),
    { kind: 'clean' },
    { kind: 'other' },
  ];
  const of = new Map<string, number>();

  for (const [file, value] of assigned) {
    of.set(file, groupIndex({ value, order, count: groups.length }));
  }

  return { groups, of };
}

function groupIndex(params: { value: Placement; order: Commit[]; count: number }): number {
  const { value, order, count } = params;

  if (value === 'uncommitted') return 0;

  if (value === 'clean') return count - 2;

  if (value === 'other') return count - 1;

  return 1 + order.indexOf(value);
}

/** Which of the files (absolute paths) differ from the repository: modified, added, deleted or new. */
async function changedPaths(root: string, files: string[]): Promise<Set<string>> {
  const names = files.map((file) => path.relative(root, file).split(path.sep).join('/'));
  const status = await git(root, [
    ...['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'],
    ...['--', ...names],
  ]);

  // Each entry is two status letters, a space and the path, relative to the repository's root.
  return new Set(
    status.stdout
      .split('\0')
      .filter((entry) => entry.length > 3)
      .map((entry) => entry.slice(3)),
  );
}

function markerText(group: Group): string {
  switch (group.kind) {
    case 'uncommitted':
      return 'not committed yet';
    case 'commit':
      return `commit: ${group.subject}`;
    case 'clean':
      return 'no changes to commit';
    case 'other':
      return 'not in git';
  }
}

/** The text of a divider between groups, as wide as `width` with the rule running to the edge. */
export function groupMarker(group: Group, width: number): string {
  const lead = `── ${markerText(group)} `;
  const shown = truncateColumns(lead, width);

  return shown + '─'.repeat(Math.max(0, width - displayWidth(shown)));
}

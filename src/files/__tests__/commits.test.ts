import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import type { EditedFile } from '../../harness/adapter.types.ts';
import { groupByCommit, groupMarker, headOf, isRepository, parseLog } from '../commits.ts';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version']);

    return true;
  } catch {
    return false;
  }
})();
const options = { skip: !hasGit && 'git is not installed' };
const T = 1_700_000_000;
const ms = (seconds: number): number => (T + seconds) * 1000;

let repo = '';
let outside = '';

/** A commit made at a moment of our choosing. */
function commit(subject: string, seconds: number): void {
  const date = `${T + seconds} +0000`;

  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', subject],
    {
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    },
  );
}

const file = (name: string, seconds: number): EditedFile => ({
  path: name.startsWith('/') ? name : path.join(repo, name),
  kind: 'edited',
  at: ms(seconds),
  count: 1,
});

before(async () => {
  if (!hasGit) return;

  repo = await mkdtemp(path.join(os.tmpdir(), 'shv-git-'));
  outside = path.join(await mkdtemp(path.join(os.tmpdir(), 'shv-out-')), 'elsewhere.txt');

  const run = (...args: string[]) => execFileSync('git', args, { cwd: repo });

  run('init', '-q');
  await writeFile(path.join(repo, '.gitignore'), '*.log\n');
  await writeFile(path.join(repo, 'a.txt'), 'a\n');
  run('add', '.');
  commit('first commit', 100);
  await writeFile(path.join(repo, 'b.txt'), 'b\n');
  await writeFile(path.join(repo, 'a.txt'), 'a2\n');
  run('add', '.');
  commit('second commit', 200);
  await writeFile(path.join(repo, 'c.txt'), 'untracked\n');
  await writeFile(path.join(repo, 'd.log'), 'ignored\n');
});

test('parseLog reads commits and the files each touched', () => {
  const output =
    '\u0001aaa\t1700000200\tsecond: with\ttab\nb.txt\na.txt\n\n\u0001bbb\t1700000100\tfirst\n.gitignore\n';
  const [second, first] = parseLog(output);

  assert.equal(second?.hash, 'aaa');
  assert.equal(second?.subject, 'second: with\ttab');
  assert.equal(second?.at, 1_700_000_200_000);
  assert.deepEqual([...(second?.files ?? [])], ['b.txt', 'a.txt']);
  assert.deepEqual([...(first?.files ?? [])], ['.gitignore']);
  assert.deepEqual(parseLog(''), []);
});

test('each file goes under the commit that took it in', options, async () => {
  const grouping = await groupByCommit({
    workspace: repo,
    files: [
      file('c.txt', 300), // never committed
      file('b.txt', 150), // edited, then taken by the second commit
      file('a.txt', 50), // edited, then taken by the first commit
      file('d.log', 300), // ignored, so never going to be committed
      file(outside, 300), // not in this repository
      file('ghost.txt', 120), // created and deleted again, never in a commit
    ],
  });

  assert.ok(grouping);

  const names = grouping.groups.map((group) =>
    group.kind === 'commit' ? group.subject : group.kind,
  );

  assert.deepEqual(names, ['uncommitted', 'second commit', 'first commit', 'clean', 'other']);

  const where = (name: string) =>
    grouping.of.get(name.startsWith('/') ? name : path.join(repo, name));

  assert.equal(where('c.txt'), 0);
  assert.equal(where('b.txt'), 1);
  assert.equal(where('a.txt'), 2);
  assert.equal(where('ghost.txt'), 3);
  assert.equal(where('d.log'), 4);
  assert.equal(where(outside), 4);
});

test(
  'a file edited again after the last commit that touched it is uncommitted if it differs',
  options,
  async () => {
    const files = [file('a.txt', 250), file('b.txt', 150)];

    // Same as in the repository: nothing to commit, whatever the chat did to it.
    const same = await groupByCommit({ workspace: repo, files });

    assert.equal(same?.groups[same.of.get(path.join(repo, 'a.txt')) ?? 0]?.kind, 'clean');
    assert.equal(same?.of.get(path.join(repo, 'b.txt')), 1);

    // Changed since the last commit: waiting for the next one.
    await writeFile(path.join(repo, 'a.txt'), 'a3\n');

    try {
      const changed = await groupByCommit({ workspace: repo, files });

      assert.equal(changed?.of.get(path.join(repo, 'a.txt')), 0);
      assert.equal(changed?.of.get(path.join(repo, 'b.txt')), 1);
    } finally {
      execFileSync('git', ['checkout', '-q', '--', 'a.txt'], { cwd: repo });
    }
  },
);

test('a tracked file deleted but not yet committed is waiting for a commit', options, async () => {
  const run = (...args: string[]) => execFileSync('git', args, { cwd: repo });

  run('rm', '-q', '--cached', 'b.txt');
  await rm(path.join(repo, 'b.txt'));

  try {
    const grouping = await groupByCommit({
      workspace: repo,
      files: [{ ...file('b.txt', 400), kind: 'deleted' }],
    });

    assert.equal(grouping?.of.get(path.join(repo, 'b.txt')), 0);
  } finally {
    run('checkout', '-q', 'HEAD', '--', 'b.txt');
  }
});

test('an edit in the same second as a commit is in that commit', options, async () => {
  const grouping = await groupByCommit({
    workspace: repo,
    files: [{ ...file('a.txt', 100), at: ms(100) + 500 }],
  });

  assert.equal(grouping?.groups[grouping.of.get(path.join(repo, 'a.txt')) ?? 0]?.kind, 'commit');
});

test('a folder that is not a repository has no groups', options, async () => {
  const plain = await mkdtemp(path.join(os.tmpdir(), 'shv-plain-'));

  assert.equal(await isRepository(plain), false);
  assert.equal(await headOf(plain), undefined);
  assert.equal(await groupByCommit({ workspace: plain, files: [file('/x', 1)] }), undefined);
  assert.equal(await isRepository(repo), true);
  assert.match((await headOf(repo)) ?? '', /^[0-9a-f]{40}$/);
});

test('a marker is as wide as it is told, with the rule running to the edge', () => {
  const marker = groupMarker(
    { kind: 'commit', hash: 'x', subject: 'feat: copy from a chat', at: 0 },
    40,
  );

  assert.equal(Array.from(marker).length, 40);
  assert.ok(marker.startsWith('── commit: feat: copy from a chat ─'));
  assert.equal(
    Array.from(
      groupMarker({ kind: 'commit', hash: 'x', subject: 'a very long subject indeed', at: 0 }, 16),
    ).length,
    16,
  );
  assert.ok(
    groupMarker(
      { kind: 'commit', hash: 'x', subject: 'a very long subject indeed', at: 0 },
      16,
    ).endsWith('…'),
  );
  assert.ok(groupMarker({ kind: 'uncommitted' }, 30).includes('not committed yet'));
  assert.ok(groupMarker({ kind: 'other' }, 30).includes('not in git'));
  assert.ok(groupMarker({ kind: 'clean' }, 30).includes('no changes to commit'));
});

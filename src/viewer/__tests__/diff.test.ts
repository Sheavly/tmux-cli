import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allAdded, buildRows, changeStarts, parseDiff } from '../diff.ts';

const DIFF = [
  'diff --git a/f b/f',
  '--- a/f',
  '+++ b/f',
  '@@ -2 +2,2 @@',
  '-old two',
  '+new two',
  '+new two b',
  '@@ -5,2 +5,0 @@',
  '-gone five',
  '-gone six',
  '@@ -9,0 +8 @@',
  '+inserted',
].join('\n');

test('parseDiff reads added lines and where removed lines sat', () => {
  const diff = parseDiff(DIFF);

  assert.deepEqual([...diff.added], [2, 3, 8]);
  assert.deepEqual(
    [...diff.removed],
    [
      [2, ['old two']],
      // `+5,0` names the line before the gap, so the removal sits in front of line 6.
      [6, ['gone five', 'gone six']],
    ],
  );
});

test('buildRows puts removed lines back in front of the line they preceded', () => {
  const lines = ['one', 'new two', 'new two b', 'four', 'seven', 'inserted'];
  const rows = buildRows({ lines, diff: parseDiff(DIFF) });

  assert.deepEqual(
    rows.map((row) =>
      row.kind === 'removed' ? `-${row.text}` : `${row.number}${row.added ? '+' : ' '}`,
    ),
    ['1 ', '-old two', '2+', '3+', '4 ', '5 ', '-gone five', '-gone six', '6 '],
  );
});

test('changeStarts finds the first row of each run of changes', () => {
  const rows = buildRows({
    lines: ['a', 'b', 'c', 'd', 'e'],
    diff: parseDiff(['@@ -2 +2,2 @@', '-x', '+b', '+c', '@@ -5 +5 @@', '-y', '+e'].join('\n')),
  });

  // a, -x, b, c, d, -y, e: the runs start at the two removals.
  assert.deepEqual(changeStarts(rows), [1, 5]);
});

test('a file git does not know is all added', () => {
  const rows = buildRows({ lines: ['a', 'b'], diff: allAdded(2) });

  assert.ok(rows.every((row) => row.kind === 'line' && row.added));
});

test('nothing but a header changes nothing', () => {
  const diff = parseDiff('diff --git a/f b/f\n--- a/f\n+++ b/f\n');

  assert.equal(diff.added.size, 0);
  assert.equal(diff.removed.size, 0);
});

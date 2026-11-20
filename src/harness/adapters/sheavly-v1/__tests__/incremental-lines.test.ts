import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { newChildrenState, runningChildren, updateChildren } from '../children.ts';
import { newCursor, readAppended, readAppendedInChunks } from '../incremental-lines.ts';
import { agent, started, A, MAIN } from '../testing/stream-lines.fake.ts';

const FILLER = `{"kind":"event","event":{"type":"text","text":"${'x'.repeat(200)}"}}`;

async function bigFile(lines: string[]): Promise<string> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'incremental-')), 'stream.jsonl');

  await writeFile(file, `${lines.join('\n')}\n`);

  return file;
}

/** Enough filler that the file takes several 1 MB chunks, with the lines that matter at both ends. */
function aroundFiller(): string[] {
  return [
    agent('session_started', A, MAIN, 'First'),
    ...Array.from({ length: 15_000 }, () => FILLER),
    started('t1', 'Last'),
  ];
}

test('a large file is handed over a chunk at a time, never as one list', async () => {
  const file = await bigFile(aroundFiller());
  const sizes: number[] = [];
  let total = 0;

  await readAppendedInChunks({
    file,
    cursor: newCursor(),
    onRestart: () => undefined,
    onLines: (lines) => {
      sizes.push(lines.length);
      total += lines.length;
    },
  });

  assert.ok(sizes.length > 2, `read in ${sizes.length} chunks`);
  assert.equal(total, 15_002);
});

test('lines that cross a chunk boundary arrive whole, and readAppended still gives them all', async () => {
  const lines = aroundFiller();
  const file = await bigFile(lines);
  const read = await readAppended({ file, cursor: newCursor() });

  assert.deepEqual(read?.lines, lines);
  assert.equal(read?.restarted, false);
});

test('the children of a stream larger than a chunk are found at both of its ends', async () => {
  const file = await bigFile(aroundFiller());
  const state = newChildrenState();

  await updateChildren({ dir: path.dirname(file), state });

  assert.deepEqual(
    runningChildren({ state, since: 0 }).map((child) => child.name),
    ['Last', 'First'],
  );
});

test('a file that is not there is reported as missing', async () => {
  const found = await readAppendedInChunks({
    file: path.join(tmpdir(), 'no-such-sheavly-dir', 'stream.jsonl'),
    cursor: newCursor(),
    onRestart: () => undefined,
    onLines: () => undefined,
  });

  assert.equal(found, false);
});

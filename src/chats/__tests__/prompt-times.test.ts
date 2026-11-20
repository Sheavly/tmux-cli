import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readPromptTimes, writePromptTimes } from '../prompt-times.ts';

const tempFile = async () => path.join(await mkdtemp(path.join(os.tmpdir(), 'pt-')), 'pt.json');

test('saved times come back, and only for the chats that are kept', async () => {
  const file = await tempFile();
  const times = new Map([
    ['a', { at: 1, updatedAt: 2 }],
    ['gone', { at: 3, updatedAt: 4 }],
  ]);

  await writePromptTimes({ file, times, keep: new Set(['a']) });

  assert.deepEqual([...(await readPromptTimes(file))], [['a', { at: 1, updatedAt: 2 }]]);
});

test('a missing or damaged file is an empty cache, never an error', async () => {
  const file = await tempFile();

  assert.equal((await readPromptTimes(file)).size, 0);

  await writeFile(file, '{not json');
  assert.equal((await readPromptTimes(file)).size, 0);

  await writeFile(file, JSON.stringify({ a: { at: 'x' }, b: { at: 1, updatedAt: 2 } }));
  assert.deepEqual([...(await readPromptTimes(file))], [['b', { at: 1, updatedAt: 2 }]]);
});

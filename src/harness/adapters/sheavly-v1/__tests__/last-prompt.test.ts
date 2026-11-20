import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lastPromptTime, readLastPromptAt } from '../last-prompt.ts';

const record = (role: string, origin: string | undefined, at: unknown) =>
  JSON.stringify({ entry: { role, ...(origin ? { origin } : {}), content: 'x', at } });

test('the last prompt is the last record the user typed, not a reply or an injected message', () => {
  const lines = [
    record('user', 'user', 10),
    record('assistant', undefined, 20),
    record('user', 'user', 30),
    record('user', undefined, 40),
    record('assistant', undefined, 50),
    'not json {',
  ];

  assert.equal(lastPromptTime(lines), 30);
  assert.equal(lastPromptTime([record('assistant', undefined, 5)]), undefined);
  assert.equal(lastPromptTime([record('user', 'user', 'soon')]), undefined);
});

test('the history file is read from its end, and a chat with none has no prompt time', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'last-prompt-'));

  assert.equal(await readLastPromptAt({ dir }), undefined);

  // Larger than the first window, with the only prompt at the very start.
  const filler = record('assistant', undefined, 99).padEnd(1000, ' ');

  await writeFile(
    path.join(dir, 'history.jsonl'),
    [record('user', 'user', 7), ...Array.from({ length: 400 }, () => filler)].join('\n'),
  );

  assert.equal(await readLastPromptAt({ dir }), 7);
});

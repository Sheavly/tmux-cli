import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildRecap, parseRecapLine, readRecap } from '../recap.ts';

const user = (content: string, origin = 'user') =>
  JSON.stringify({ entry: { role: 'user', origin, content } });
const assistant = (content: string, calls = 0) =>
  JSON.stringify({
    entry: {
      role: 'assistant',
      content,
      toolCalls: Array.from({ length: calls }, () => ({ name: 'x' })),
    },
  });
const tool = (content: string) => JSON.stringify({ entry: { role: 'tool', content } });

test('only what the user typed and what the assistant said is a message', () => {
  assert.deepEqual(parseRecapLine(user('hi')), { role: 'user', text: 'hi', toolCalls: 0 });
  assert.deepEqual(parseRecapLine(assistant('ok', 2)), {
    role: 'assistant',
    text: 'ok',
    toolCalls: 2,
  });
  assert.equal(parseRecapLine(user('rules', 'agents-md')), undefined);
  assert.equal(parseRecapLine(tool('output')), undefined);
  assert.equal(parseRecapLine('{"entry":{"role":"user","orig'), undefined);
});

test('escape sequences never reach the terminal', () => {
  assert.equal(parseRecapLine(user('a\u001b[31mb\u0007c\nd'))?.text, 'a[31mbc\nd');
});

test('a run of assistant steps is one message, and the last ones are kept', () => {
  const lines = [
    user('one'),
    assistant('first answer', 1),
    tool('result'),
    assistant('', 2),
    assistant('done', 0),
    user('two'),
    assistant('', 1),
  ];

  assert.deepEqual(buildRecap(lines, 10), [
    { role: 'user', text: 'one', toolCalls: 0 },
    { role: 'assistant', text: 'first answer\n\ndone', toolCalls: 3 },
    { role: 'user', text: 'two', toolCalls: 0 },
    { role: 'assistant', text: '', toolCalls: 1 },
  ]);
  assert.deepEqual(
    buildRecap(lines, 2).map((message) => message.text),
    ['two', ''],
  );
});

test('readRecap reads from the end of a long history and drops what the cut left half', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-recap-'));
  const filler = tool('x'.repeat(1000));
  const lines = [user('old question'), assistant('old answer')];

  for (let index = 0; index < 600; index++) lines.push(filler);

  lines.push(user('new question'), assistant('new answer'));
  await writeFile(path.join(dir, 'history.jsonl'), `${lines.join('\n')}\n`);

  assert.deepEqual(
    (await readRecap({ dir, limit: 2 })).map((message) => message.text),
    ['new question', 'new answer'],
  );
  // The whole file is read when it is wanted: the oldest message is complete.
  assert.deepEqual(
    (await readRecap({ dir, limit: 4 })).map((message) => message.text),
    ['old question', 'old answer', 'new question', 'new answer'],
  );
  assert.deepEqual(await readRecap({ dir: path.join(dir, 'missing'), limit: 2 }), []);
});

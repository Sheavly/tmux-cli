import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { stripEscapes } from '../../../../terminal/ansi.ts';
import { followChild } from '../follow.ts';
import { A, LOG, MAIN, agent, conversation, ended, started } from '../testing/stream-lines.fake.ts';

/** What a command's pane starts with: its name, then the command line the fake gives it. */
const header = (name: string, id: string): string => `${name}\n$ run ${id}\n\n`;

/** Follows a child to its end (or for `ms`, when it does not end), and gives what was written. */
async function follow(params: { dir: string; childId: string; ms?: number }): Promise<string> {
  const controller = new AbortController();
  const written: string[] = [];
  const timer = setTimeout(() => controller.abort(), params.ms ?? 5000);

  await followChild({
    dir: params.dir,
    childId: params.childId,
    columns: 60,
    write: (text) => written.push(text),
    signal: controller.signal,
  });
  clearTimeout(timer);

  return written.join('');
}

test('a command that has ended is shown with how it ended', async () => {
  const { dir } = await conversation([
    started('t1', 'Checks', { ref: LOG }),
    ended('t1', { ref: LOG, status: 'failed', exitCode: 2 }),
  ]);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), 'one\ntwo\nlast without newline');

  assert.equal(
    stripEscapes(await follow({ dir, childId: 't1' })),
    `${header('Checks', 't1')}one\ntwo\nlast without newline\n— failed (exit 2) —\n`,
  );
});

test('a running command is followed as it writes, until it ends', async () => {
  const { dir, stream } = await conversation([started('t1', 'Server', { ref: LOG })]);
  const log = path.join(dir, 'outputs', `${LOG}.log`);

  await writeFile(log, 'booting\n');

  const done = follow({ dir, childId: 't1' });

  await new Promise((resolve) => setTimeout(resolve, 600));
  await appendFile(log, 'listening\n');
  await appendFile(stream, `${ended('t1', { ref: LOG, status: 'cancelled' })}\n`);

  assert.equal(
    stripEscapes(await done),
    `${header('Server', 't1')}booting\nlistening\n— cancelled —\n`,
  );
});

test('what a command prints cannot move the cursor or change the terminal', async () => {
  const { dir } = await conversation([
    started('t1', 'Progress', { ref: LOG }),
    ended('t1', { ref: LOG, status: 'completed', exitCode: 0 }),
  ]);

  await writeFile(
    path.join(dir, 'outputs', `${LOG}.log`),
    'a\u001b[2Jb \u001b[32mgreen\u001b[0m\n10%\r50%\r100%\n',
  );

  const text = await follow({ dir, childId: 't1' });

  // Colours stay; the clear-screen and the progress that was drawn over do not.
  assert.ok(text.endsWith('ab \u001b[32mgreen\u001b[0m\n100%\n— completed (exit 0) —\n'));
  assert.ok(!text.includes('\u001b[2J'));
});

test('a long log is followed from its last part', async () => {
  const { dir } = await conversation([
    started('t1', 'Noisy', { ref: LOG }),
    ended('t1', { ref: LOG, status: 'completed', exitCode: 0 }),
  ]);
  const rows = Array.from({ length: 80_000 }, (_, index) => `row ${index}`);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), `${rows.join('\n')}\n`);

  const text = stripEscapes(await follow({ dir, childId: 't1' })).slice(
    header('Noisy', 't1').length,
  );

  assert.ok(text.startsWith('… earlier output is not shown\n'));
  assert.ok(text.includes('\nrow 79999\n'));
  assert.ok(!text.includes('\nrow 0\n'));
  // The first row of the cut part is cut off at its start, so it is not shown.
  assert.match(text.split('\n')[1] ?? '', /^row \d+$/);
});

test('a sub-agent is followed from its history, to its end', async () => {
  const { dir } = await conversation([
    agent('session_started', A, MAIN, 'Research'),
    agent('session_ended', A, MAIN, 'Research'),
  ]);
  const entries = [
    { seq: 0, entry: { role: 'user', content: 'Find it' } },
    { seq: 1, entry: { role: 'assistant', content: 'Found.' } },
  ];

  await writeFile(
    path.join(dir, 'agents', `${A}.history.jsonl`),
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
  );

  const text = (await follow({ dir, childId: A })).replaceAll(/\u001b\[[0-9;]*m/g, '');

  assert.equal(text, 'Task\nFind it\n\nFound.\n\n— sub-agent finished —\n');
});

test('a child that is not there, or has no log, says so and ends', async () => {
  const { dir } = await conversation([
    started('t1', 'No log'),
    started('t2', 'Bad ref', { ref: '../../etc/passwd' }),
  ]);

  assert.equal(await follow({ dir, childId: 't9' }), 'This is not running any more.\n');
  assert.equal(await follow({ dir, childId: 't1' }), 'No output was kept.\n');
  assert.equal(await follow({ dir, childId: 't2' }), 'No output was kept.\n');
  assert.equal(await follow({ dir, childId: '../x' }), 'This is not running any more.\n');
});

test('following stops when asked to, without a footer', async () => {
  const { dir } = await conversation([started('t1', 'Server', { ref: LOG })]);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), 'up\n');

  assert.equal(
    stripEscapes(await follow({ dir, childId: 't1', ms: 700 })),
    `${header('Server', 't1')}up\n`,
  );
});

test('a command that has written nothing yet says so once, instead of a blank pane', async () => {
  const { dir } = await conversation([started('t1', 'Quiet', { ref: LOG })]);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), '');

  // Long enough for several looks at the empty log.
  const text = stripEscapes(await follow({ dir, childId: 't1', ms: 1300 }));

  assert.equal(text, `${header('Quiet', 't1')}(no output yet)\n`);
});

test('a command that ended without output is not called quiet, it just ended', async () => {
  const { dir } = await conversation([
    started('t1', 'Silent', { ref: LOG }),
    ended('t1', { ref: LOG, status: 'completed', exitCode: 0 }),
  ]);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), '');

  assert.equal(
    stripEscapes(await follow({ dir, childId: 't1' })),
    `${header('Silent', 't1')}— completed (exit 0) —\n`,
  );
});

test('the command line is cut to the pane, in columns', async () => {
  const long = 'x'.repeat(200);
  const { dir } = await conversation([
    started('t1', long, { ref: LOG }),
    ended('t1', { ref: LOG, status: 'completed', exitCode: 0 }),
  ]);

  await writeFile(path.join(dir, 'outputs', `${LOG}.log`), '');

  const [name = '', command = ''] = stripEscapes(await follow({ dir, childId: 't1' })).split('\n');

  assert.equal(name.length, 60);
  assert.ok(name.endsWith('…'));
  assert.equal(command, '$ run t1');
});

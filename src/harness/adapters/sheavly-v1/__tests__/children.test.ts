import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  newChildrenState,
  parseStreamLine,
  runningChildren,
  updateChildren,
  type ChildrenState,
} from '../children.ts';
import { A, B, MAIN, agent, conversation, ended, started } from '../testing/stream-lines.fake.ts';

async function running(lines: string[], since = 0) {
  const { dir } = await conversation(lines);
  const state = newChildrenState();

  await updateChildren({ dir, state });

  return runningChildren({ state, since });
}

test('only what is still running is listed: a child that ended is gone', async () => {
  const children = await running([
    agent('session_started', A, MAIN, 'Research'),
    agent('session_started', B, MAIN, 'Review'),
    agent('session_ended', A, MAIN, 'Research'),
    started('t1', 'Run the checks'),
    ended('t1'),
    started('t2', 'Dev server', { kind: 'service' }),
  ]);

  assert.deepEqual(
    children.map((child) => [child.id, child.kind, child.name]),
    [
      ['t2', 'service', 'Dev server'],
      [B, 'agent', 'Review'],
    ],
  );
});

test('a released sub-agent is not running either', async () => {
  const children = await running([
    agent('session_started', A, MAIN, 'Research'),
    agent('session_released', A, MAIN, 'Research'),
  ]);

  assert.deepEqual(children, []);
});

test('a sub-agent runs under the one that started it, and its commands under it', async () => {
  const children = await running([
    agent('session_started', A, MAIN, 'Outer'),
    agent('session_started', B, A, 'Inner'),
    started('t1', 'Build', { owner: B }),
    started('t2', 'Lint'),
  ]);

  assert.deepEqual(
    children.map((child) => [child.id, child.parentId]),
    [
      ['t2', undefined],
      [A, undefined],
      [B, A],
      ['t1', B],
    ],
  );
});

test('a child whose parent has ended moves up to the nearest one still running', async () => {
  const children = await running([
    agent('session_started', A, MAIN, 'Outer'),
    agent('session_started', B, A, 'Inner'),
    started('t1', 'Watch', { kind: 'service', owner: B }),
    agent('session_ended', B, A, 'Inner'),
  ]);

  assert.deepEqual(
    children.map((child) => [child.id, child.parentId]),
    [
      [A, undefined],
      ['t1', A],
    ],
  );
});

test('a sub-agent is listed once: its task of kind agent is not another child', async () => {
  const children = await running([
    agent('session_started', A, MAIN, 'Research'),
    started('t1', 'Research', { kind: 'agent' }),
  ]);

  assert.deepEqual(
    children.map((child) => child.id),
    [A],
  );
});

test('what an earlier run of the conversation left running is not listed', async () => {
  const lines = [
    // The chat was killed: neither of these ever ended.
    started('t1', 'Old server', { kind: 'service' }),
    agent('session_started', A, MAIN, 'Old'),
    // The run that is going now: task ids start again at t1.
    started('t1', 'New server', { kind: 'service' }).replace('"startedAt":5', '"startedAt":500'),
  ];

  assert.deepEqual(
    (await running(lines, 400)).map((child) => child.name),
    ['New server'],
  );
  assert.deepEqual(await running(lines.slice(0, 2), 400), []);
});

test('a name is one clean line, and a task with no description is named by its command', async () => {
  const children = await running([agent('session_started', A, MAIN, 'a\nb\tc'), started('t1', '')]);

  assert.deepEqual(
    children.map((child) => child.name),
    ['run t1', 'a b c'],
  );
});

test('lines that are not what the harness writes are skipped, not trusted', () => {
  assert.equal(parseStreamLine('{"kind":"update","update":{"type":"session_idle"}}'), undefined);
  assert.equal(parseStreamLine('not json "session_started"'), undefined);
  assert.equal(
    parseStreamLine('{"kind":"update","update":{"type":"session_started","session":{"id":5}}}'),
    undefined,
  );
  assert.equal(parseStreamLine(started('t1', 'x', { kind: 'cron' })), undefined);
});

async function namesAfter(dir: string, state: ChildrenState): Promise<string[]> {
  await updateChildren({ dir, state });

  return runningChildren({ state, since: 0 }).map((child) => child.name);
}

test('each look reads only what was added, and a line still being written waits', async () => {
  const { dir, stream } = await conversation([]);
  const state = newChildrenState();
  const second = started('t2', 'Two');

  await writeFile(stream, '');
  assert.deepEqual(await namesAfter(dir, state), [], 'an empty stream is no children');

  await writeFile(stream, `${started('t1', 'One')}\n${second.slice(0, 40)}`);
  assert.deepEqual(await namesAfter(dir, state), ['One']);

  await appendFile(stream, `${second.slice(40)}\n`);
  assert.deepEqual(await namesAfter(dir, state), ['One', 'Two']);

  // A stream that is shorter than what was read is another file: start over.
  await writeFile(stream, `${started('t9', 'F')}\n`);
  assert.deepEqual(await namesAfter(dir, state), ['F']);
});

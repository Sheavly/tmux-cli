import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { test } from 'node:test';
import { currentActivity } from '../activity.ts';
import { newChildrenState, updateChildren } from '../children.ts';
import { A, answered, asked, conversation, runState, turn } from '../testing/stream-lines.fake.ts';

async function activityOf(lines: string[], since = 0) {
  const { dir } = await conversation(lines);
  const state = newChildrenState();

  await updateChildren({ dir, state });

  return currentActivity({ state: state.activity, since });
}

test('a chat is running from a prompt until its turn is over', async () => {
  assert.equal(await activityOf([turn('session_resumed', 10)]), 'running');
  assert.equal(await activityOf([turn('session_resumed', 10), turn('session_idle', 20)]), 'idle');
});

test('a chat nothing was said about is idle', async () => {
  assert.equal(await activityOf([]), 'idle');
});

test('a chat held open for its tasks does no work, so it is idle, until it works again', async () => {
  const held = [turn('session_resumed', 10), runState('waiting', 20)];

  assert.equal(await activityOf(held), 'idle');
  assert.equal(await activityOf([...held, runState('working', 30)]), 'running');
});

test('the next prompt ends a hold even when the stream says nothing more about it', async () => {
  const lines = [turn('session_resumed', 10), runState('waiting', 20), turn('session_idle', 25)];

  assert.equal(await activityOf([...lines, turn('session_resumed', 30)]), 'running');
});

test('a chat of an older harness, which never says run_state, is told by its session updates', async () => {
  assert.equal(await activityOf([turn('session_started', 10)]), 'running');
  assert.equal(await activityOf([turn('session_started', 10), turn('session_ended', 20)]), 'idle');
});

test('an approval that was asked and not answered is awaiting input, even while running', async () => {
  const lines = [turn('session_resumed', 10), runState('working', 11), asked('a1', 12)];

  assert.equal(await activityOf(lines), 'awaiting_input');
  assert.equal(await activityOf([...lines, answered('a1', 13)]), 'running');
});

test('an approval a sub-agent asked for counts for the chat', async () => {
  const lines = [turn('session_resumed', 10), runState('waiting', 11), asked('a1', 12, A)];

  assert.equal(await activityOf(lines), 'awaiting_input');
});

test('a sub-agent working while the chat waits for it leaves the chat idle', async () => {
  const lines = [
    turn('session_resumed', 10),
    turn('session_started', 11, A),
    runState('waiting', 12),
    runState('working', 13, A),
  ];

  assert.equal(await activityOf(lines), 'idle');
});

test('a session whose turn is over has nothing left to ask', async () => {
  const lines = [turn('session_resumed', 10), asked('a1', 11), turn('session_idle', 12)];

  assert.equal(await activityOf(lines), 'idle');
});

test('what happened before the process started is not what it is doing', async () => {
  const lines = [turn('session_resumed', 10), asked('a1', 11)];

  assert.equal(await activityOf(lines, 100), 'idle');
  assert.equal(await activityOf([turn('session_resumed', 10)], 100), 'idle');
});

test('lines added later are folded in without reading the stream again', async () => {
  const { dir, stream } = await conversation([turn('session_resumed', 10)]);
  const state = newChildrenState();

  await updateChildren({ dir, state });
  assert.equal(currentActivity({ state: state.activity, since: 0 }), 'running');

  await appendFile(stream, `${asked('a1', 20)}\n`);
  await updateChildren({ dir, state });
  assert.equal(currentActivity({ state: state.activity, since: 0 }), 'awaiting_input');
});

test('a line that is not what we expect says nothing', async () => {
  const lines = [
    '{"kind":"update","update":{"type":"session_resumed","session":{"id":5}}}',
    '{"kind":"approval","sessionId":"s","update":{"type":"approval_requested"}}',
    'not json "run_state"',
  ];

  assert.equal(await activityOf(lines), 'idle');
});

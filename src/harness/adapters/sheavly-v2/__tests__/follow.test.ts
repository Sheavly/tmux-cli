import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripEscapes } from '../../../../terminal/ansi.ts';
import {
  AGENT,
  MAIN,
  sessionEnded,
  sessionStarted,
  taskStarted,
  textDelta,
  toolBatch,
  toolResult,
  turnEnd,
} from '../testing/entries.fake.ts';
import { sseOf } from '../testing/sheavly-server.fake.ts';
import { CHAT, ID, withAdapter } from '../testing/with-adapter.fake.ts';

const STREAM = `QUERY /conversations/${ID}/stream`;

/** What following `childId` writes, with the colours taken out. */
async function followed(params: {
  entries: readonly object[] | undefined;
  childId: string;
}): Promise<string> {
  let written = '';

  await withAdapter(async ({ server, adapter }) => {
    if (params.entries) server.answers.set(STREAM, { status: 200, sse: sseOf(params.entries) });

    await adapter.children?.follow({
      chat: CHAT,
      childId: params.childId,
      columns: 80,
      write: (text) => (written += text),
      signal: new AbortController().signal,
    });
  });

  return stripEscapes(written);
}

test('following a sub-agent writes what it says, the tools it calls and what they answer, then that it finished', async () => {
  const output = await followed({
    childId: AGENT,
    entries: [
      sessionStarted({ id: MAIN, depth: 1, at: 1 }),
      sessionStarted({ id: AGENT, depth: 2, at: 2, parentId: MAIN }),
      textDelta(AGENT, 'Looking at '),
      textDelta(AGENT, 'the tests'),
      turnEnd(AGENT),
      toolBatch({ sessionId: AGENT, at: 3, calls: [['read_file', { path: 'a.ts' }]] }),
      toolResult(AGENT, 'file contents'),
      textDelta(MAIN, 'not this: it is the chat'),
      sessionEnded({ id: AGENT, depth: 2, at: 4 }),
    ],
  });

  assert.match(output, /Looking at the tests/);
  assert.match(output, /▸ read_file {2}a\.ts/);
  assert.match(output, /↳ file contents/);
  assert.match(output, /— sub-agent finished —\n$/);
  assert.ok(!output.includes('not this'));
});

test('a command cannot be followed, and the pane says why', async () => {
  const output = await followed({
    childId: 'task-1',
    entries: [
      sessionStarted({ id: MAIN, depth: 1, at: 1 }),
      taskStarted({ owner: MAIN, id: 'task-1', at: 2 }),
    ],
  });

  assert.match(output, /output is not available from the server yet/);
});

test('following a chat that is not running says so', async () => {
  assert.match(await followed({ childId: AGENT, entries: undefined }), /not running/);
});

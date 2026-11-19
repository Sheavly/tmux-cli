import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lastTurnStart, recapChat, tidyRendered } from '../replay.ts';

const MAIN = 's-main';
const entry = (seq: number, type: string, sessionId = MAIN) =>
  JSON.stringify({ seq, sessionId, kind: 'event', event: { type } });

test('the last turn starts right after the done before it', () => {
  const lines = [
    entry(5, 'text_delta'),
    entry(6, 'done'),
    entry(7, 'text_delta'),
    entry(8, 'tool_result'),
    entry(9, 'done'),
  ];

  assert.equal(lastTurnStart(lines, MAIN), 7);
});

test('a turn that never ended is the last one', () => {
  assert.equal(
    lastTurnStart([entry(1, 'done'), entry(2, 'text_delta'), entry(3, 'reasoning')], MAIN),
    2,
  );
});

test('the session going idle after a done is not a turn of its own', () => {
  const update = (seq: number, type: string) =>
    JSON.stringify({ seq, sessionId: MAIN, kind: 'update', update: { type } });
  const lines = [
    entry(1, 'done'),
    update(2, 'session_resumed'),
    entry(3, 'text_delta'),
    entry(4, 'done'),
    update(5, 'session_idle'),
  ];

  // The turn is seq 2 to 4; what follows the last done is bookkeeping.
  assert.equal(lastTurnStart(lines, MAIN), 2);
});

test('what the script printed keeps its rows and colours and loses what could move the cursor', () => {
  const green = '\u001b[32m';
  const reset = '\u001b[0m';

  assert.equal(
    tidyRendered(`\none\u001b[2J  \n  ${green}two${reset}\u001b]0;title\u0007\n\n`),
    `one\n  ${green}two${reset}`,
  );
});

test('a sub-agent finishing is not the end of the turn', () => {
  const lines = [
    entry(1, 'done'),
    entry(2, 'text_delta'),
    entry(3, 'done', 's-sub'),
    entry(4, 'done'),
  ];

  assert.equal(lastTurnStart(lines, MAIN), 2);
});

test('with one turn in sight it starts at the first entry seen; with none there is no start', () => {
  assert.equal(lastTurnStart([entry(40, 'text_delta'), entry(41, 'done')], MAIN), 40);
  assert.equal(lastTurnStart(['{"seq":3,"sessi', 'not json', ''], MAIN), undefined);
});

test('without a harness to render the turn the last messages are shown as text', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-replay-'));

  await writeFile(
    path.join(dir, 'history.jsonl'),
    '{"entry":{"role":"user","origin":"user","content":"fix the bug"}}\n' +
      '{"entry":{"role":"assistant","content":"Fixed it."}}\n',
  );
  await writeFile(
    path.join(dir, 'stream.jsonl'),
    `${entry(0, 'text_delta')}\n${entry(1, 'done')}\n`,
  );

  const text = await recapChat({ dir, harnessDir: path.join(dir, 'no-such-harness'), columns: 80 });

  assert.match(text, /fix the bug/);
  assert.match(text, /Fixed it\./);
  assert.match(text, /resuming/);
});

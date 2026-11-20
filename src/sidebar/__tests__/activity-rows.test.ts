import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatActivity, StoredChat } from '../../harness/adapter.types.ts';
import { MAIN_SESSION } from '../../session/panes.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { SPINNER_FRAME_MS, SPINNER_FRAMES } from '../../terminal/spinner.constants.ts';
import { renderScreen } from '../render.ts';
import { buildRows, type Row } from '../view.ts';

const stored: StoredChat[] = [{ id: 'c1', workspace: '/a', startedAt: 10, updatedAt: 10 }];
const strip = (text: string): string => text.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '');

function rowsWith(params: { activity?: ChatActivity; session?: string; dead?: boolean }): Row[] {
  const { activity, session = 'sheavly-parked', dead = false } = params;

  return buildRows({
    chats: stored,
    labels: new Map([['c1', 'my chat']]),
    panes: [fakePane({ chat: 'c1', workspace: '/a', session, dead })],
    collapsed: new Set(),
    showAll: false,
    ...(activity ? { activity: new Map([['c1', activity]]) } : {}),
  });
}

function chatLine(rows: Row[], now: number): string {
  const { lines } = renderScreen({
    rows,
    cursor: 0,
    scrollTop: 0,
    width: 40,
    height: 6,
    now,
    home: '/home/me',
    footer: [],
    divider: false,
    focus: 'sidebar',
  });

  return strip(lines[1] as string);
}

test('a running chat that is not on screen carries what it is doing', () => {
  const row = rowsWith({ activity: 'awaiting_input' }).find(
    (candidate) => candidate.kind === 'chat',
  );

  assert.equal(row?.kind === 'chat' && row.activity, 'awaiting_input');
});

test('the chat on screen keeps its arrow, and a chat that ended keeps its cross', () => {
  const shown = rowsWith({ activity: 'running', session: MAIN_SESSION });
  const ended = rowsWith({ activity: 'running', dead: true });

  assert.match(chatLine(shown, 0), /▶ my chat/);
  assert.match(chatLine(ended, 0), /✕ my chat/);
});

test('a chat that waits for the user shows a question mark', () => {
  assert.match(chatLine(rowsWith({ activity: 'awaiting_input' }), 0), /\? my chat/);
});

test('an idle chat keeps the dot of a running one', () => {
  assert.match(chatLine(rowsWith({ activity: 'idle' }), 0), /● my chat/);
  assert.match(chatLine(rowsWith({}), 0), /● my chat/);
});

test('a working chat shows a spinner that turns with the clock', () => {
  const rows = rowsWith({ activity: 'running' });
  const symbols = SPINNER_FRAMES.map((_, frame) => chatLine(rows, frame * SPINNER_FRAME_MS)[2]);

  assert.deepEqual(symbols, SPINNER_FRAMES);
  assert.equal(chatLine(rows, SPINNER_FRAMES.length * SPINNER_FRAME_MS)[2], SPINNER_FRAMES[0]);
});

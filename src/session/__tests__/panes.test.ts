import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakePane } from '../../testing/pane.fake.ts';
import { parsePane, pendingChats, type PaneInfo } from '../panes.ts';

test('parsePane reads a tagged pane and one with no tags', () => {
  assert.deepEqual(parsePane('%3\tsheavly\t0\t\tchat\tabc\t/w\t1700'), {
    id: '%3',
    session: 'sheavly',
    role: 'chat',
    dead: false,
    deadStatus: 0,
    chat: 'abc',
    profile: '',
    workspace: '/w',
    startedAt: 1700,
    pid: 0,
    active: false,
    width: 0,
    height: 0,
  });
  assert.deepEqual(
    (({ active, width, height }) => ({ active, width, height }))(
      parsePane('%3\tsheavly\t0\t\tchat\tabc\t/w\t1700\t5\tp\t1\t120\t40'),
    ),
    { active: true, width: 120, height: 40 },
  );
  assert.equal(parsePane('%3\tsheavly\t0\t\tchat\tabc\t/w\t1700\t0\tprof-1').profile, 'prof-1');
  assert.equal(parsePane('%9\tother\t0\t\t\t\t\t').role, '');
  assert.equal(parsePane('%9\tsheavly\t1\t\tchat\t\t\t').deadStatus, -1);
  assert.throws(() => parsePane('garbage'));
});

const pane = (over: Partial<PaneInfo>): PaneInfo => fakePane({ startedAt: 100_000, ...over });

test('pendingChats lists chat panes with no conversation yet and the ids already running', () => {
  const { pending, taken } = pendingChats([
    pane({ id: '%1', chat: 'a' }),
    pane({ id: '%2', workspace: '/x', startedAt: 7 }),
    pane({ id: '%3', role: 'placeholder' }),
    pane({ id: '%4', workspace: '/y', startedAt: 9, profile: 'p1' }),
  ]);

  assert.deepEqual(pending, [
    { paneId: '%2', workspace: '/x', startedAt: 7 },
    { paneId: '%4', workspace: '/y', startedAt: 9, profile: 'p1' },
  ]);
  assert.deepEqual([...taken], ['a']);
});

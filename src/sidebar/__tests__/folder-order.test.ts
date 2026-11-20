import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderFolders, pinFolder, shiftFolder } from '../folder-order.utils.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { buildRows } from '../view.ts';

test('running only leaves out stored chats and folders with none running, moved ones too', () => {
  const rows = buildRows({
    chats: [
      { id: 'stored', workspace: '/a', startedAt: 1, updatedAt: 1 },
      { id: 'live', workspace: '/b', startedAt: 2, updatedAt: 2 },
    ],
    labels: new Map(),
    panes: [fakePane({ workspace: '/b', chat: 'live', session: 'main' })],
    collapsed: new Set(),
    showAll: false,
    runningOnly: true,
    folderOrder: ['/empty'],
  });

  assert.deepEqual(
    rows.map((row) => [row.kind, row.workspace]),
    [
      ['workspace', '/b'],
      ['chat', '/b'],
    ],
  );
});

test('a moved folder with no chats is still listed, in its place, marked as moved', () => {
  const rows = buildRows({
    chats: [{ id: '1', workspace: '/a', startedAt: 1, updatedAt: 1 }],
    labels: new Map(),
    panes: [],
    collapsed: new Set(),
    showAll: false,
    folderOrder: ['/empty'],
  });

  assert.deepEqual(
    rows.map((row) => [row.kind, row.workspace]),
    [
      ['workspace', '/empty'],
      ['workspace', '/a'],
      ['chat', '/a'],
    ],
  );
  assert.equal(rows[0]?.kind === 'workspace' && rows[0].pinned, true);
});

test('moved folders come first in the order given, the rest stay alphabetical', () => {
  const folders = ['/b', '/a', '/d', '/c'];

  assert.deepEqual(orderFolders({ folders, pinned: [] }), ['/a', '/b', '/c', '/d']);
  assert.deepEqual(orderFolders({ folders, pinned: ['/d', '/b'] }), ['/d', '/b', '/a', '/c']);
});

test('a new folder lands in the alphabetical part and never between moved ones', () => {
  const pinned = ['/z', '/y'];

  assert.deepEqual(orderFolders({ folders: ['/z', '/y', '/b'], pinned }), ['/z', '/y', '/b']);
  assert.deepEqual(orderFolders({ folders: ['/z', '/y', '/b', '/a'], pinned }), [
    '/z',
    '/y',
    '/a',
    '/b',
  ]);
});

test('a moved folder that is not among the folders given is skipped', () => {
  const pinned = ['/x', '/y'];

  assert.deepEqual(orderFolders({ folders: ['/y', '/a'], pinned }), ['/y', '/a']);
  assert.deepEqual(orderFolders({ folders: ['/x', '/y', '/a'], pinned }), ['/x', '/y', '/a']);
});

test('moving an unmoved folder puts it after the moved ones, once', () => {
  assert.deepEqual(pinFolder(['/a'], '/b'), ['/a', '/b']);
  assert.deepEqual(pinFolder(['/a', '/b'], '/a'), ['/a', '/b']);
});

test('a step swaps with the next folder that is shown and stops at the ends', () => {
  const shown = new Set(['/a', '/c']);
  const pinned = ['/a', '/b', '/c'];

  assert.deepEqual(shiftFolder({ pinned, folder: '/a', step: 1, shown }), ['/c', '/b', '/a']);
  assert.deepEqual(shiftFolder({ pinned, folder: '/a', step: -1, shown }), pinned);
  assert.deepEqual(shiftFolder({ pinned, folder: '/q', step: 1, shown }), pinned);
});

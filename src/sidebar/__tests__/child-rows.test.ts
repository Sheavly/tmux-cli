import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatChild } from '../../harness/adapter.types.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { stripEscapes } from '../../terminal/ansi.ts';
import { displayWidth } from '../../terminal/width.utils.ts';
import { renderScreen } from '../render.ts';
import { buildRows, type Row } from '../view.ts';

const CHAT = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
const stored = [{ id: CHAT, workspace: '/a', startedAt: 10, updatedAt: 10 }];
const kids: ChatChild[] = [
  { id: 'A', kind: 'agent', name: 'Research', startedAt: 1 },
  { id: 'B', parentId: 'A', kind: 'agent', name: 'Inner', startedAt: 2 },
  { id: 't1', parentId: 'B', kind: 'process', name: 'npm test', startedAt: 3 },
  { id: 't2', kind: 'service', name: 'dev server', startedAt: 4 },
];

function rowsOf(over: object = {}): Row[] {
  return buildRows({
    chats: stored,
    labels: new Map(),
    panes: [fakePane({ chat: CHAT, workspace: '/a' })],
    collapsed: new Set<string>(),
    showAll: false,
    children: new Map([[CHAT, kids]]),
    ...over,
  });
}

test('the running children of a chat are rows right under it, nested one step per level', () => {
  const rows = rowsOf();

  assert.deepEqual(
    rows.map((row) => (row.kind === 'child' ? [row.childId, row.depth] : [row.kind, 0])),
    [
      ['workspace', 0],
      ['chat', 0],
      ['A', 1],
      ['B', 2],
      ['t1', 3],
      ['t2', 1],
    ],
  );
  assert.equal(rows.find((row) => row.kind === 'child')?.workspace, '/a');
});

test('a chat with no running children, or no entry for it, has none under it', () => {
  assert.equal(
    rowsOf({ children: new Map() }).some((row) => row.kind === 'child'),
    false,
  );
  assert.equal(
    rowsOf({ children: undefined }).some((row) => row.kind === 'child'),
    false,
  );
});

test('a chat that is not running has no children, even while the list of them is stale', () => {
  const hasChildren = (panes: ReturnType<typeof fakePane>[]): boolean =>
    rowsOf({ panes }).some((row) => row.kind === 'child');

  // The chat was stopped: no pane, so it is a stored chat, but the map still has its children.
  assert.equal(hasChildren([]), false);
  // Its process ended and the pane is only kept to be read.
  assert.equal(hasChildren([fakePane({ chat: CHAT, dead: true })]), false);
  // A chat on screen, or parked, does have them.
  assert.equal(hasChildren([fakePane({ chat: CHAT, session: 'sheavly' })]), true);
  assert.equal(hasChildren([fakePane({ chat: CHAT })]), true);
});

test('collapsing the folder takes the children with it', () => {
  assert.deepEqual(
    rowsOf({ collapsed: new Set(['/a']) }).map((row) => row.kind),
    ['workspace'],
  );
});

test('the child that is on screen is marked, and only that one', () => {
  const onScreen = fakePane({
    id: '%9',
    role: 'follow',
    session: 'sheavly',
    follow: `${CHAT}:t2`,
  });
  const parked = fakePane({ id: '%8', role: 'follow', follow: `${CHAT}:A` });
  const rows = rowsOf({ panes: [fakePane({ chat: CHAT }), onScreen, parked] });
  const marked = rows.flatMap((row) => (row.kind === 'child' && row.shown ? [row.childId] : []));

  assert.deepEqual(marked, ['t2']);
});

function draw(rows: Row[], width: number, cursor = 0): string[] {
  return renderScreen({
    rows,
    cursor,
    scrollTop: 0,
    width,
    height: 20,
    now: 100,
    home: '/h',
    footer: [],
    divider: false,
    focus: 'sidebar',
  }).lines;
}

test('a child row says what it is, is indented by its depth and fills the width exactly', () => {
  const rows = rowsOf({
    children: new Map([[CHAT, [...kids, { ...kids[3], id: 't3', name: '漢字'.repeat(30) }]]]),
  });

  for (const width of [14, 30, 60]) {
    for (const line of draw(rows, width, 2)) {
      assert.equal(displayWidth(stripEscapes(line)), width, JSON.stringify(stripEscapes(line)));
    }
  }

  const lines = draw(rows, 40).map((line) => stripEscapes(line).trimEnd());

  assert.ok(lines.includes('    ◆ Research'));
  assert.ok(lines.includes('      ◆ Inner'));
  assert.ok(lines.includes('        ▸ npm test'));
  assert.ok(lines.includes('    ∞ dev server'));
});

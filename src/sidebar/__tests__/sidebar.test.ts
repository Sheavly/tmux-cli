import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StoredChat } from '../../harness/adapter.types.ts';
import type { PaneInfo } from '../../session/panes.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { displayWidth } from '../../terminal/width.utils.ts';
import { parseKeyOverrides, resolveBindings } from '../../keys/bindings.ts';
import { browserHelp, footerHints, listHelp } from '../help.ts';
import { parseKeys } from '../keys.ts';
import { renderBrowser, renderScreen, scrollFor, shortPath } from '../render.ts';
import { buildRows, relativeTime, RECENT_STORED } from '../view.ts';

const chat = (
  id: string,
  workspace: string,
  startedAt: number,
  updatedAt = startedAt,
): StoredChat => ({
  id,
  workspace,
  startedAt,
  updatedAt,
});
const pane = (over: Partial<PaneInfo>): PaneInfo =>
  fakePane({ workspace: '/a', startedAt: 5, ...over });
const input = (over: object = {}) => ({
  chats: [],
  labels: new Map<string, string>(),
  panes: [],
  collapsed: new Set<string>(),
  showAll: false,
  ...over,
});
const strip = (text: string): string => text.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '');

test('folders are alphabetical and each folder lists its newest chat first', () => {
  const rows = buildRows(
    input({
      chats: [
        chat('1', '/b', 10),
        chat('2', '/a', 30),
        chat('3', '/b', 20, 5),
        chat('4', '/B2', 1),
      ],
    }),
  );

  const named = (row: (typeof rows)[number]): string => {
    if (row.kind === 'workspace') return row.workspace;

    return row.kind === 'chat' ? row.chatId : '';
  };

  assert.deepEqual(rows.map(named), ['/a', '2', '/b', '3', '1', '/B2', '4']);
});

test('a running chat shows its state, a pane with no conversation yet is a starting one', () => {
  const rows = buildRows(
    input({
      chats: [chat('1', '/a', 10), chat('2', '/a', 9)],
      panes: [
        pane({ id: '%7', chat: '1', session: 'sheavly' }),
        pane({ id: '%8', chat: '', startedAt: 50 }),
      ],
    }),
  );
  const states = rows.flatMap((row) => (row.kind === 'chat' ? [[row.chatId, row.state]] : []));

  assert.deepEqual(states, [
    ['', 'starting'],
    ['1', 'shown'],
    ['2', 'stored'],
  ]);
});

test('older stored chats collapse into one row, but running ones never do', () => {
  const many = Array.from({ length: RECENT_STORED + 3 }, (_, index) =>
    chat(`c${index}`, '/a', index + 1),
  );
  const rows = buildRows(input({ chats: many, panes: [pane({ chat: 'c0' })] }));
  const more = rows.find((row) => row.kind === 'more');

  assert.equal(more?.kind === 'more' && more.hidden, 2);
  assert.ok(rows.some((row) => row.kind === 'chat' && row.chatId === 'c0'));
  assert.equal(
    buildRows(input({ chats: many, showAll: true })).some((row) => row.kind === 'more'),
    false,
  );
  assert.equal(buildRows(input({ chats: many, collapsed: new Set(['/a']) })).length, 1);
});

test('relativeTime', () => {
  const at = (ms: number) => relativeTime({ now: 1_000_000_000, then: 1_000_000_000 - ms });

  assert.deepEqual(
    [at(5_000), at(5 * 60_000), at(3 * 3_600_000), at(5 * 86_400_000)],
    ['now', '5m', '3h', '5d'],
  );
});

test('every line fills the width exactly, so one screen overwrites the last', () => {
  const rows = buildRows(
    input({
      chats: [chat('1', '/home/me/a-very-long-workspace-folder-name', 10)],
      labels: new Map([['1', 'a label that is far too long to fit in the sidebar width']]),
    }),
  );

  for (const width of [20, 34, 60]) {
    const { lines } = renderScreen({
      rows,
      cursor: 1,
      scrollTop: 0,
      width,
      height: 12,
      now: 1_000_000,
      home: '/home/me',
      footer: ['status', 'help one', 'help two'],
      divider: false,
      focus: 'sidebar',
    });

    assert.equal(lines.length, 12);
    assert.deepEqual(
      new Set(lines.map((line) => Array.from(strip(line)).length)),
      new Set([width]),
    );
  }
});

test('wide characters in a label, a folder or a message still fill the width exactly', () => {
  // Chinese, Japanese and emoji take two columns each; counting characters would overflow the row.
  const rows = buildRows(
    input({
      chats: [
        chat('1', '/home/me/プロジェクト/日本語のとても長いフォルダー名', 10),
        chat('2', '/a', 5),
      ],
      labels: new Map([
        ['1', '日本語のチャットのとても長いラベルでサイドバーの幅に収まらない🚀🚀'],
        ['2', 'ünïcödé with accents e\u0301 and 🚀 in the middle of a long label'],
      ]),
    }),
  );

  for (const width of [20, 34, 61]) {
    const { lines } = renderScreen({
      rows,
      cursor: 1,
      scrollTop: 0,
      width,
      height: 12,
      now: 1_000_000,
      home: '/home/me',
      footer: ['状態: 日本語のメッセージ', 'help', '🚀'],
      divider: true,
      focus: 'sidebar',
    });

    assert.deepEqual(
      new Set(lines.map((line) => displayWidth(strip(line)))),
      new Set([width]),
      `at ${width} columns`,
    );
  }

  const browser = renderBrowser({
    title: '日本語のフォルダー',
    items: ['日本語/', '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀/'],
    cursor: 1,
    scrollTop: 0,
    width: 30,
    height: 8,
    footer: ['状態'],
    divider: false,
    focus: 'sidebar',
  });

  assert.deepEqual(new Set(browser.lines.map((line) => displayWidth(strip(line)))), new Set([30]));
});

test('a long path keeps its end, measured in columns', () => {
  assert.equal(
    displayWidth(shortPath({ path: '/srv/日本語/とても長い/パス', home: '/h', max: 12 })),
    12,
  );
  assert.match(
    shortPath({ path: '/srv/日本語/とても長い/パス', home: '/h', max: 12 }),
    /^….*パス$/,
  );
});

test('a title row sits above the list and takes one row of its height', () => {
  const rows = buildRows(input({ chats: [chat('a', '/a', 1), chat('b', '/a', 2)] }));
  const draw = (title?: string) =>
    renderScreen({
      rows,
      cursor: 0,
      scrollTop: 0,
      width: 30,
      height: 6,
      now: 10_000,
      home: '/home',
      footer: ['', '? help'],
      ...(title ? { title } : {}),
      divider: false,
      focus: 'sidebar',
    }).lines.map(strip);

  assert.equal(draw().length, 6);
  assert.equal(draw('Bedrock').length, 6);
  assert.equal(draw('Bedrock')[0]?.trimEnd(), ' Bedrock');
  assert.ok(draw('Bedrock').every((line) => Array.from(line).length === 30));
  assert.match(draw('Bedrock')[1] ?? '', /\/a/);
});

test('scrolling keeps the cursor in view', () => {
  assert.equal(scrollFor({ cursor: 0, scrollTop: 5, visible: 4, total: 20 }), 0);
  assert.equal(scrollFor({ cursor: 9, scrollTop: 0, visible: 4, total: 20 }), 6);
  assert.equal(scrollFor({ cursor: 2, scrollTop: 0, visible: 4, total: 20 }), 0);
  assert.equal(scrollFor({ cursor: 3, scrollTop: 9, visible: 10, total: 5 }), 0);
});

test('a scroll margin moves the window one row before the cursor reaches its edge', () => {
  const margin = (cursor: number, scrollTop: number) =>
    scrollFor({ cursor, scrollTop, visible: 6, total: 20, margin: 1 });

  assert.equal(margin(3, 0), 0); // rows 0 to 5 are shown; 3 is well inside
  assert.equal(margin(4, 0), 0); // the last row but one is still fine
  assert.equal(margin(5, 0), 1); // the last row: move, so one row is left under the cursor
  assert.equal(margin(6, 1), 2);
  assert.equal(margin(2, 2), 1); // going up: the first row of the window, so move up one
  assert.equal(margin(1, 1), 0);
  assert.equal(margin(0, 0), 0); // at the top there is nothing more to show
  assert.equal(margin(19, 14), 14); // at the bottom the window stops at the last row
  assert.equal(margin(18, 14), 14);
  assert.equal(margin(17, 14), 14);
  // A window too small for a margin on both sides of the cursor gives it up.
  assert.equal(scrollFor({ cursor: 5, scrollTop: 0, visible: 2, total: 20, margin: 1 }), 4);
  assert.equal(scrollFor({ cursor: 1, scrollTop: 0, visible: 1, total: 20, margin: 3 }), 1);
});

test('shortPath', () => {
  assert.equal(shortPath({ path: '/home/me/x', home: '/home/me', max: 20 }), '~/x');
  assert.equal(shortPath({ path: '/srv/some/long/path', home: '/home/me', max: 8 }), '…ng/path');
});

test('accents colour part of an item without changing its width, even on the selected row', () => {
  const draw = (cursor: number) =>
    renderBrowser({
      title: 'Files',
      items: ['~ src/a.ts   1m', '+ b.ts   2m'],
      accents: [
        [
          { start: 0, length: 1, style: 'yellow' },
          { start: 2, length: 4, style: 'dim' },
        ],
        [{ start: 0, length: 1, style: 'green' }],
      ],
      cursor,
      scrollTop: 0,
      width: 30,
      height: 6,
      footer: ['hint'],
      divider: false,
      focus: 'sidebar',
    }).lines;
  const [, first, second] = draw(1) as [string, string, string];

  assert.match(first, /\u001b\[33m~\u001b\[39m \u001b\[2msrc\/\u001b\[22ma\.ts/);
  assert.match(second, /^\u001b\[7m/);
  assert.match(second, /\u001b\[32m\+\u001b\[39m/);

  for (const line of draw(0)) assert.equal(Array.from(strip(line)).length, 30);
});

test('with nothing selected the list scrolls to where it is told, within its length', () => {
  const draw = (scrollTop: number) =>
    renderBrowser({
      title: 'Help',
      items: ['a', 'b', 'c', 'd', 'e', 'f'],
      cursor: -1,
      scrollTop,
      width: 20,
      height: 6,
      footer: ['hint'],
      divider: false,
      focus: 'sidebar',
    });
  const rows = (scrollTop: number) =>
    draw(scrollTop)
      .lines.slice(1, 5)
      .map((line) => strip(line).trim());

  // The title and the footer leave four rows for six items.
  assert.deepEqual(rows(0), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rows(2), ['c', 'd', 'e', 'f']);
  assert.equal(draw(2).scrollTop, 2);
  assert.equal(draw(99).scrollTop, 2);
  assert.equal(draw(-5).scrollTop, 0);
  // And no row is drawn as the selected one.
  assert.ok(draw(1).lines.every((line) => !line.includes('\u001b[7m')));
});

test('parseKeys', () => {
  assert.deepEqual(parseKeys('j\u001b[A\r'), ['j', 'up', 'enter']);
  assert.deepEqual(parseKeys('\u001b'), ['escape']);
  // Alt+f arrives as Escape then f; it is one key, not an Escape and an f.
  assert.deepEqual(parseKeys('\u001bfj'), ['alt+f', 'j']);
  assert.deepEqual(parseKeys('\u007fé😀'), ['backspace', 'é', '😀']);
  // Tab and the other control codes have no name here and are dropped.
  assert.deepEqual(parseKeys('\t\u001cx'), ['x']);
  // A sequence for a key we have no name for is dropped whole.
  assert.deepEqual(parseKeys('\u001b[1;5Hx'), ['x']);
});

test('the keys that terminals send in different ways come out as one key', () => {
  // Backspace is ^H on some and DEL on others; Enter is CR, or LF on a few.
  assert.deepEqual(parseKeys('\b\u007f'), ['backspace', 'backspace']);
  assert.deepEqual(parseKeys('\r\n'), ['enter', 'enter']);
  // Arrows are `ESC [ A` normally and `ESC O A` in the application cursor mode.
  assert.deepEqual(parseKeys('\u001b[A\u001bOA\u001b[D\u001bOD'), ['up', 'up', 'left', 'left']);
  // Alt+[ and Alt+O start a sequence when more follows, and are the Alt key when nothing does.
  assert.deepEqual(parseKeys('\u001b['), ['alt+[']);
  assert.deepEqual(parseKeys('\u001bO'), ['alt+O']);
  assert.deepEqual(parseKeys('\u001b[Ax'), ['up', 'x']);
});

test('parseKeys names Ctrl, Shift and Alt with an arrow, Page or Delete key, and Ctrl with a letter', () => {
  assert.deepEqual(parseKeys('\u001b[1;5Cx'), ['ctrl+right', 'x']);
  assert.deepEqual(parseKeys('\u001b[1;2D'), ['shift+left']);
  assert.deepEqual(parseKeys('\u001b[1;6A'), ['ctrl+shift+up']);
  assert.deepEqual(parseKeys('\u001b[1;3B'), ['alt+down']);
  assert.deepEqual(parseKeys('\u001b[5;5~'), ['ctrl+pageup']);
  assert.deepEqual(parseKeys('\u001b[3;2~'), ['shift+delete']);
  assert.deepEqual(parseKeys('\u0003\u0001'), ['ctrl+c', 'ctrl+a']);
});

test('the Delete key', () => {
  assert.deepEqual(parseKeys('\u001b[3~'), ['delete']);
});

test('the chat on screen is a green bar with dark text; the cursor makes it brighter', () => {
  const rows = buildRows(
    input({
      chats: [chat('1', '/a', 20), chat('2', '/a', 10)],
      labels: new Map([
        ['1', 'on screen'],
        ['2', 'stored'],
      ]),
      panes: [pane({ chat: '1', session: 'sheavly' })],
    }),
  );
  const draw = (cursor: number) =>
    renderScreen({
      rows,
      cursor,
      scrollTop: 0,
      width: 30,
      height: 8,
      now: 1_000_000,
      home: '/h',
      footer: ['x'],
      divider: false,
      focus: 'sidebar',
    }).lines;
  const [, shownLine, storedLine] = draw(0);

  assert.match(shownLine as string, /\u001b\[42m\u001b\[30m/);
  assert.doesNotMatch(storedLine as string, /\u001b\[42m/);
  assert.match(draw(1)[1] as string, /\u001b\[102m/);
  assert.doesNotMatch(draw(1)[1] as string, /\u001b\[7m/);
  assert.match(draw(2)[2] as string, /\u001b\[7m/);
});

test('with its own divider, each line leaves a gap and then draws the line', () => {
  const rows = buildRows(input({ chats: [chat('1', '/a', 10)], labels: new Map([['1', 'hi']]) }));
  const { lines } = renderScreen({
    rows,
    cursor: 1,
    scrollTop: 0,
    width: 30,
    height: 6,
    now: 1_000_000,
    home: '/h',
    footer: ['status'],
    divider: true,
    focus: 'sidebar',
  });

  assert.equal(lines.length, 6);

  for (const line of lines) {
    const text = strip(line);

    assert.equal(Array.from(text).length, 30);
    assert.ok(text.endsWith(' │'));
  }
});

test('the divider half beside the focused pane is lit, like tmux does', () => {
  const draw = (focus: 'sidebar' | 'chat') =>
    renderScreen({
      rows: [],
      cursor: 0,
      scrollTop: 0,
      width: 20,
      height: 10,
      now: 0,
      home: '/h',
      footer: ['x'],
      divider: true,
      focus,
    }).lines;
  const lit = '\u001b[38;5;72m';
  const grey = '\u001b[38;5;240m';

  assert.ok((draw('sidebar')[0] as string).includes(`${lit} │`));
  assert.ok((draw('sidebar')[9] as string).includes(`${grey} │`));
  assert.ok((draw('chat')[0] as string).includes(`${grey} │`));
  assert.ok((draw('chat')[9] as string).includes(`${lit} │`));
});

test('focus reports from tmux', () => {
  assert.deepEqual(parseKeys('\u001b[I\u001b[Oj'), ['focus', 'focus', 'j']);
});

const bindingsFor = (value: unknown) =>
  resolveBindings({ overrides: parseKeyOverrides({ file: 'test', value }) }).bindings;
const helpFor = (value: unknown, over: object = {}) =>
  listHelp({
    bindings: bindingsFor(value),
    profiles: true,
    deleting: true,
    files: true,
    chatEscape: true,
    ...over,
  }).join('\n');

test('the help shows the keys as they are now, and leaves out what has none', () => {
  const text = helpFor({
    list: { newChat: 'M-n', rename: null },
    global: { focusSidebar: 'M-j' },
  });

  assert.match(text, /^Alt\+n +new chat in the folder/m);
  assert.match(text, /^Alt\+j +go to the sidebar/m);
  assert.doesNotMatch(text, /rename chat/);
  assert.match(text, /^↑ k +move up/m);
  assert.match(text, /^q +detach/m);
  assert.match(text, /^Ctrl\+← +jump a word back/m);
});

test('the help leaves out what the adapter does not offer, and copy mode when it is off', () => {
  const text = helpFor(
    { copyMode: false },
    { profiles: false, deleting: false, files: false, chatEscape: false },
  );

  assert.doesNotMatch(text, /switch profile/);
  assert.doesNotMatch(text, /delete chat/);
  assert.doesNotMatch(text, /files the chat changed/);
  assert.doesNotMatch(text, /clears the prompt/);
  assert.doesNotMatch(text, /In copy mode/);
  assert.match(helpFor({}), /In copy mode/);
});

test('the footers name the keys as they are now, and say nothing of a key that has none', () => {
  const now = bindingsFor({
    text: { submit: 'C-s', cancel: 'C-g' },
    navigation: { help: 'H', open: 'M-o' },
    confirm: { delete: 'C-d', quit: 'C-q' },
    profiles: { close: 'C-p' },
    help: { scrollLeft: 'C-b', scrollRight: 'C-f', scrollUp: 'C-u', scrollDown: 'C-d' },
  });

  assert.equal(footerHints.rename(now), 'Ctrl+s save  Ctrl+g cancel');
  assert.equal(footerHints.files(now, { typed: false }), 'Ctrl+s view  Ctrl+g back');
  assert.equal(footerHints.files(now, { typed: true }), 'Ctrl+s view  Ctrl+g clear');
  assert.equal(footerHints.profiles(now), 'Alt+o switch  Ctrl+p cancel');
  assert.equal(footerHints.confirmDelete(now), 'Ctrl+d delete  any other key cancels');
  assert.equal(footerHints.list(now), 'H help');
  assert.equal(footerHints.confirmQuit(now), 'Ctrl+q stop all  any other key cancels');
  assert.equal(
    footerHints.help(now, { horizontal: true, vertical: true }),
    'Ctrl+bCtrl+f Ctrl+uCtrl+d scroll  other key: back',
  );
  assert.equal(footerHints.help(now, { horizontal: false, vertical: false }), 'any key: back');

  const none = bindingsFor({
    text: { submit: null, cancel: null },
    confirm: { delete: null, quit: null },
    navigation: { help: null },
  });

  assert.equal(footerHints.rename(none), '');
  assert.equal(footerHints.list(none), '');
  assert.equal(footerHints.confirmDelete(none), 'any other key cancels');
  assert.equal(footerHints.confirmQuit(none), 'any other key cancels');
});

test('with the defaults the footers say what they always did', () => {
  const now = bindingsFor({});

  assert.equal(footerHints.rename(now), '⏎ save  esc cancel');
  assert.equal(footerHints.files(now, { typed: false }), '⏎ view  esc back');
  assert.equal(footerHints.files(now, { typed: true }), '⏎ view  esc clear');
  assert.equal(footerHints.profiles(now), '⏎ switch  esc cancel');
  assert.equal(footerHints.confirmDelete(now), '⏎ delete  any other key cancels');
  assert.equal(footerHints.list(now), '? help');
  assert.equal(footerHints.confirmQuit(now), '⏎ stop all  any other key cancels');
  assert.equal(
    footerHints.help(now, { horizontal: true, vertical: true }),
    '←→ ↑↓ scroll  other key: back',
  );
});

test('the folder help lists the keys of the folder screen', () => {
  const text = browserHelp(bindingsFor({ browser: { home: 'H' } })).join('\n');

  assert.match(text, /^H +home folder/m);
  assert.match(text, /^⏎ → l +go into the folder/m);
});

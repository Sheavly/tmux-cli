import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MOUSE_ALL, type MouseSettings } from '../../config/mouse-settings.ts';
import { tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { applyMouse, mouseKeys } from '../mouse-bindings.ts';

const only = (...on: (keyof MouseSettings)[]): MouseSettings => ({
  scroll: on.includes('scroll'),
  copy: on.includes('copy'),
  focus: on.includes('focus'),
  sidebar: on.includes('sidebar'),
});
const commandOf = (mouse: MouseSettings, table: string, key: string): string | undefined =>
  mouseKeys(mouse)
    .find((entry) => entry.table === table && entry.key === key)
    ?.command?.join(' ');

test('with every action on, a click gives the pane the keyboard and the wheel, drag and double click are bound', () => {
  assert.match(
    commandOf(MOUSE_ALL, 'root', 'MouseDown1Pane') ?? '',
    /^select-pane -t = \\; send-keys -M$/,
  );

  for (const key of ['WheelUpPane', 'MouseDrag1Pane', 'DoubleClick1Pane', 'TripleClick1Pane']) {
    assert.ok(commandOf(MOUSE_ALL, 'root', key), key);
  }

  for (const key of ['MouseDragEnd1Pane', 'WheelUpPane', 'WheelDownPane', 'MouseDown1Pane']) {
    assert.ok(commandOf(MOUSE_ALL, 'copy-mode', key), key);
    assert.ok(commandOf(MOUSE_ALL, 'copy-mode-vi', key), key);
  }
});

test('with focus off the wheel and a drag still work and no key gives a pane the keyboard', () => {
  const mouse = only('scroll', 'copy');

  assert.equal(commandOf(mouse, 'root', 'MouseDown1Pane'), 'send-keys -M');
  assert.equal(commandOf(mouse, 'copy-mode', 'MouseDown1Pane'), undefined);

  const bound = mouseKeys(mouse).filter((entry) => entry.command);

  assert.ok(bound.length > 5);

  for (const { table, key, command } of bound) {
    assert.doesNotMatch((command ?? []).join(' '), /select-pane/, `${table} ${key}`);
  }
});

test('with copy off nothing selects or copies, and with scroll off nothing scrolls', () => {
  const noCopy = only('scroll', 'focus');

  for (const key of ['MouseDrag1Pane', 'DoubleClick1Pane', 'TripleClick1Pane', 'MouseDown2Pane']) {
    assert.equal(commandOf(noCopy, 'root', key), undefined, key);
  }

  assert.equal(commandOf(noCopy, 'copy-mode', 'MouseDragEnd1Pane'), undefined);
  assert.ok(commandOf(noCopy, 'root', 'WheelUpPane'));

  const noScroll = only('copy', 'focus');

  assert.equal(commandOf(noScroll, 'root', 'WheelUpPane'), undefined);
  assert.equal(commandOf(noScroll, 'copy-mode', 'WheelDownPane'), undefined);
  assert.ok(commandOf(noScroll, 'root', 'MouseDrag1Pane'));
});

test('a drag, a double click and the wheel never start copy mode in the sidebar pane', () => {
  for (const key of ['MouseDrag1Pane', 'DoubleClick1Pane', 'TripleClick1Pane', 'WheelUpPane']) {
    assert.match(commandOf(MOUSE_ALL, 'root', key) ?? '', /@sheavly_role},sidebar/, key);
  }
});

test('a double or triple click never takes the keyboard back for the sidebar, which has moved it to a chat by then', () => {
  for (const key of ['DoubleClick1Pane', 'TripleClick1Pane']) {
    const command = commandOf(MOUSE_ALL, 'root', key) ?? '';

    assert.doesNotMatch(command, /^select-pane/, key);
    assert.match(
      command,
      /^if-shell -F -t = #\{!=:#\{@sheavly_role},sidebar} select-pane -t =/,
      key,
    );
  }
});

const tmux = createTmux({ socket: `shv-mouse-${process.pid}` });
const listing = async (table: string) => tmux.run(['list-keys', '-T', table]);
const option = async () => (await tmux.run(['show-options', '-gqv', 'mouse'])).trim();

before(async () => {
  await tmux.run(['new-session', '-d', '-s', 'mouse', 'sleep 600']).catch(() => undefined);
});

after(async () => {
  await tmux.run(['kill-server']).catch(() => undefined);
});

test(
  'tmux takes the bindings as they are written, and a changed setting leaves nothing of the last',
  options,
  async () => {
    await applyMouse({ tmux, mouse: MOUSE_ALL });

    const all = await listing('root');

    assert.equal(await option(), 'on');
    assert.match(all, /MouseDown1Pane\s+select-pane -t = \\; send-keys -M/);
    assert.match(all, /DoubleClick1Pane\s+if-shell -F -t = "#\{!=:#\{@sheavly_role},sidebar}"/);
    assert.match(
      await listing('copy-mode'),
      /MouseDragEnd1Pane\s+send-keys -X copy-pipe-and-cancel/,
    );
    assert.match(
      await listing('copy-mode-vi'),
      /DoubleClick1Pane\s+select-pane -t = \\; send-keys -X select-word \\; run-shell -d 0.3 \\; send-keys -X copy-pipe-and-cancel/,
    );

    await applyMouse({ tmux, mouse: only('scroll', 'copy') });

    const scrollAndCopy = await listing('root');

    assert.match(scrollAndCopy, /MouseDown1Pane\s+send-keys -M\s*$/m);
    assert.doesNotMatch(scrollAndCopy, /DoubleClick1Pane\s+select-pane/);
    assert.doesNotMatch(await listing('copy-mode'), /MouseDown1Pane/);
    assert.match(await listing('copy-mode'), /MouseDrag1Pane\s+send-keys -X begin-selection/);

    await applyMouse({ tmux, mouse: only() });

    assert.equal(await option(), 'off');
    assert.doesNotMatch(await listing('root'), /WheelUpPane|MouseDrag1Pane/);

    await applyMouse({ tmux, mouse: MOUSE_ALL });

    assert.match(await listing('root'), /WheelUpPane/);
    assert.equal(await option(), 'on');
  },
);

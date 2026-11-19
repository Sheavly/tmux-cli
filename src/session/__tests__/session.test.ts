import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { parseKeyOverrides, resolveBindings } from '../../keys/bindings.ts';
import { createSheavlyV1 } from '../../harness/adapters/sheavly-v1/index.ts';
import { hasTmux, tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { MAIN_SESSION, PARKING_SESSION, listPanes } from '../panes.ts';
import { createSession } from '../session.ts';

// A real tmux on a socket of its own, running `sleep` where sheavly would run.
const socket = `shv-test-${process.pid}`;
const config = { sidebarWidth: 30 };
const adapterFor = (command: string) =>
  createSheavlyV1({ sheavlyHome: '/nonexistent', harnessDir: '/tmp', command });
const adapter = adapterFor('sleep 600 #');
const CHAT = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
const PROFILE = 'a8e3c1d7-5f2b-4b96-8d40-6c7e9a1b2f50';
const tmux = createTmux({ socket });
const idle = ['sh', '-c', 'exec sleep 600'];
const session = createSession({ tmux, config, adapter, sidebarCommand: idle });

before(async () => {
  if (hasTmux) await session.ensure({ cols: 100, rows: 30 });
});
after(async () => {
  if (hasTmux) await session.stop();
});

const shown = async () =>
  (await listPanes(tmux)).filter(
    (pane) => pane.session === MAIN_SESSION && pane.role !== 'sidebar',
  );

test('starts with a sidebar and a placeholder, and ensure is repeatable', options, async () => {
  const before = (await listPanes(tmux)).find((pane) => pane.role === 'sidebar');

  await session.ensure({ cols: 100, rows: 30 });

  const panes = await listPanes(tmux);
  const sidebar = panes.find((pane) => pane.role === 'sidebar');

  // A start runs the sidebar's current code, so the old process is replaced.
  assert.notEqual(sidebar?.pid, before?.pid);
  assert.equal(sidebar?.dead, false);

  assert.deepEqual(panes.map((pane) => pane.role).toSorted(), ['anchor', 'placeholder', 'sidebar']);
  assert.equal((await shown()).length, 1);
});

test('opening chats swaps panes and keeps the ones off screen running', options, async () => {
  const first = await session.openChat({ workspace: '/tmp', chatId: CHAT });
  const second = await session.openChat({ workspace: '/var' });
  const panes = await listPanes(tmux);

  assert.equal((await shown()).map((pane) => pane.id).join(), second);
  assert.equal(panes.find((pane) => pane.id === first)?.session, PARKING_SESSION);
  assert.equal(panes.find((pane) => pane.id === first)?.dead, false);
  assert.equal(await session.openChat({ workspace: '/tmp', chatId: CHAT }), first);
  assert.equal((await shown()).map((pane) => pane.id).join(), first);
  assert.equal(panes.filter((pane) => pane.role === 'chat').length, 2);
});

test('stopping the chat on screen puts the placeholder back', options, async () => {
  const [onScreen] = await shown();

  await session.stopChat(onScreen?.id as string);

  // stopChat returns only once the chat's whole process group is gone.
  assert.throws(() => process.kill(-(onScreen?.pid as number), 0), { code: 'ESRCH' });

  const after = await listPanes(tmux);

  assert.equal((await shown()).map((pane) => pane.role).join(), 'placeholder');
  assert.equal(after.filter((pane) => pane.role === 'chat').length, 1);
});

test('a chat pane is tagged with the profile it was started on', options, async () => {
  const id = await session.openChat({ workspace: '/tmp', profile: PROFILE });
  const pane = (await listPanes(tmux)).find((candidate) => candidate.id === id);

  assert.equal(pane?.profile, PROFILE);

  await session.stopChat(id);
});

test(
  'a chat that ended cleanly is reaped; one that failed is kept to be read',
  options,
  async () => {
    const done = await session.openChat({ workspace: '/tmp' });

    await tmux.run(['respawn-pane', '-k', '-t', done, 'sh', '-c', 'exit 0']);
    await session.openChat({ workspace: '/var' });

    const failed = await session.openChat({ workspace: '/etc' });

    await tmux.run(['respawn-pane', '-k', '-t', failed, 'sh', '-c', 'exit 3']);
    await session.openChat({ workspace: '/usr' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.reapFinished(await listPanes(tmux));

    const ids = (await listPanes(tmux)).map((pane) => pane.id);

    assert.equal(ids.includes(done), false);
    assert.equal(ids.includes(failed), true);
  },
);

test(
  'a chat id that is not a conversation id is refused before reaching a shell',
  options,
  async () => {
    await assert.rejects(
      session.openChat({ workspace: '/tmp', chatId: 'x; touch /tmp/pwned' }),
      /Not a conversation id/,
    );
  },
);

test(
  'parked chats are the size of the content pane, so a swap resizes nothing',
  options,
  async () => {
    await session.openChat({ workspace: '/tmp' });
    await session.openChat({ workspace: '/var' });

    const [slot] = await shown();
    const size = (target: string) =>
      tmux.run(['display-message', '-p', '-t', target, '#{pane_width}x#{pane_height}']);
    const windows = (
      await tmux.run([
        'list-windows',
        '-t',
        `=${PARKING_SESSION}`,
        '-F',
        '#{window_width}x#{window_height}',
      ])
    )
      .split('\n')
      .filter((line) => line !== '');

    assert.ok(windows.length >= 2);
    assert.deepEqual(new Set(windows), new Set([(await size(slot?.id as string)).trim()]));
  },
);

test('redraw signals the chat on screen and leaves its screen alone', options, async () => {
  const marker = path.join(await mkdtemp(path.join(os.tmpdir(), 'shv-')), 'winch');
  const watcher = createSession({
    tmux,
    config,
    adapter: adapterFor(
      `trap 'echo winch >> ${marker}' WINCH; echo VISIBLE; while :; do sleep 0.1; done #`,
    ),
    sidebarCommand: idle,
  });

  await watcher.openChat({ workspace: '/tmp' });
  await new Promise((resolve) => setTimeout(resolve, 300));

  const [slot] = await shown();
  const screen = () => tmux.run(['capture-pane', '-p', '-t', slot?.id as string]);

  assert.match(await screen(), /VISIBLE/);

  await watcher.redraw();
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.match(await screen(), /VISIBLE/);
  assert.match(await readFile(marker, 'utf8'), /winch/);
});

test(
  'a start binds the copy-mode keys, and Alt+g only when a lines command is given',
  options,
  async () => {
    const keys = (table: string) => tmux.run(['list-keys', '-T', table]);

    await session.ensure({ cols: 100, rows: 30 });

    for (const table of ['copy-mode', 'copy-mode-vi']) {
      assert.match(await keys(table), /S-Right .*begin-selection/);
      assert.match(await keys(table), /C-c .*copy-selection-and-cancel/);
    }

    assert.doesNotMatch(await keys('root'), /M-g /);
    assert.match(await keys('root'), /M-c .*@sheavly_role.*copy-mode/);

    const withLines = createSession({
      tmux,
      config,
      adapter,
      sidebarCommand: idle,
      linesCommand: 'echo lines',
      copyCommand: 'echo copy',
    });

    await withLines.ensure({ cols: 100, rows: 30 });

    assert.match(await keys('root'), /M-c .*@sheavly_role.*run-shell/);
    assert.match(await keys('root'), /M-g .*@sheavly_role.*display-popup/);
    assert.equal((await tmux.run(['show-options', '-gv', 'mode-keys'])).trim(), 'emacs');
  },
);

test('Esc is bound in chats only when an escape command is given', options, async () => {
  const keys = () => tmux.run(['list-keys', '-T', 'root']);

  await session.ensure({ cols: 100, rows: 30 });

  assert.doesNotMatch(await keys(), /Escape /);

  const withEscape = createSession({
    tmux,
    config,
    adapter,
    sidebarCommand: idle,
    escapeCommand: 'echo escape',
  });

  await withEscape.ensure({ cols: 100, rows: 30 });

  assert.match(await keys(), /Escape .*@sheavly_role.*run-shell.*echo escape/);
  assert.match(await keys(), /Escape .*send-keys Escape/);

  await session.ensure({ cols: 100, rows: 30 });

  assert.doesNotMatch(await keys(), /Escape /);
});

test(
  'moved keys are unbound on a running server, and copyMode false drops our copy-mode keys',
  options,
  async () => {
    const keys = (table: string) => tmux.run(['list-keys', '-T', table]);
    const custom = (value: unknown) =>
      createSession({
        tmux,
        config,
        adapter,
        sidebarCommand: idle,
        linesCommand: 'echo lines',
        bindings: resolveBindings({ overrides: parseKeyOverrides({ file: 'test', value }) })
          .bindings,
      });

    await session.ensure({ cols: 100, rows: 30 });

    assert.match(await keys('root'), /M-h .*select-pane -L/);

    await custom({ global: { focusSidebar: 'M-j', copyLines: 'M-l' } }).ensure({
      cols: 100,
      rows: 30,
    });

    const root = await keys('root');

    assert.doesNotMatch(root, /M-h /);
    assert.match(root, /M-j .*select-pane -L/);
    assert.match(root, /M-l .*display-popup/);
    assert.doesNotMatch(root, /M-g /);
    // What was not moved is still bound.
    assert.match(root, /M-s .*select-pane/);

    await custom({ copyMode: false }).ensure({ cols: 100, rows: 30 });

    for (const table of ['copy-mode', 'copy-mode-vi']) {
      assert.doesNotMatch(await keys(table), /S-Right .*begin-selection/);
      assert.doesNotMatch(await keys(table), /C-Right .*next-word-end/);
    }

    // Back to the defaults, as a later start of the same server does.
    await session.ensure({ cols: 100, rows: 30 });

    assert.match(await keys('root'), /M-h .*select-pane -L/);
    assert.doesNotMatch(await keys('root'), /M-j /);
    assert.match(await keys('copy-mode'), /S-Right .*begin-selection/);
  },
);

test(
  'one copy-mode key can be moved: the new key is bound and the old one is not',
  options,
  async () => {
    const keys = (table: string) => tmux.run(['list-keys', '-T', table]);
    const moved = createSession({
      tmux,
      config,
      adapter,
      sidebarCommand: idle,
      bindings: resolveBindings({
        overrides: parseKeyOverrides({
          file: 'test',
          value: { copyMode: { copy: ['M-y'], selectWordNext: 'M-f' } },
        }),
      }).bindings,
    });

    await moved.ensure({ cols: 100, rows: 30 });

    for (const table of ['copy-mode', 'copy-mode-vi']) {
      const bound = await keys(table);

      assert.match(bound, /M-y .*copy-selection-and-cancel/);
      assert.match(bound, /M-f .*select.*next-word-end|M-f .*begin-selection/);
      // Our `C-c` and `C-S-Right` are gone; what was not moved stays.
      assert.doesNotMatch(bound, /C-c .*copy-selection-and-cancel/);
      assert.doesNotMatch(bound, /C-S-Right /);
      assert.match(bound, /S-Right .*begin-selection/);
    }

    await session.ensure({ cols: 100, rows: 30 });

    assert.match(await keys('copy-mode'), /C-c .*copy-selection-and-cancel/);
    assert.match(await keys('copy-mode'), /C-S-Right .*begin-selection/);
  },
);

test(
  'what the terminal can do decides colour, the clipboard command and the escape wait',
  options,
  async () => {
    const size = { cols: 100, rows: 30 };
    const option = async (name: string) =>
      (await tmux.run(['show-options', '-sv', name]).catch(() => '')).trim();
    const waiting = createSession({
      tmux,
      config: { ...config, escapeTime: 50 },
      adapter,
      sidebarCommand: idle,
    });

    // A terminal that says nothing is not told it has 24-bit colour, and has no clipboard tool.
    await session.ensure(size, {});

    assert.equal(await option('escape-time'), '10');
    assert.doesNotMatch(await option('terminal-features'), /:RGB/);
    assert.equal(await option('copy-command'), '');
    assert.match(
      await tmux.run(['list-keys', '-T', 'copy-mode']),
      /C-c .*copy-selection-and-cancel/,
    );

    // One that says it has both is told so, and copying goes through the tool as well.
    await waiting.ensure(size, { truecolor: true, clipboardCommand: 'cat > /dev/null' });

    assert.equal(await option('escape-time'), '50');
    assert.match(await option('terminal-features'), /:RGB/);
    assert.equal(await option('copy-command'), 'cat > /dev/null');
    assert.match(await tmux.run(['list-keys', '-T', 'copy-mode']), /C-c .*copy-pipe-and-cancel/);
    assert.match(
      await tmux.run(['list-keys', '-T', 'copy-mode-vi']),
      /Enter .*copy-pipe-and-cancel/,
    );

    // A later start from a terminal with no tool clears it, so a stale one is not left behind.
    await session.ensure(size, {});

    assert.equal(await option('escape-time'), '10');
    assert.equal(await option('copy-command'), '');
    assert.match(
      await tmux.run(['list-keys', '-T', 'copy-mode']),
      /C-c .*copy-selection-and-cancel/,
    );
  },
);

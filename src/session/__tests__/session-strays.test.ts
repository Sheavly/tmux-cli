import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createSheavlyV1 } from '../../harness/adapters/sheavly-v1/index.ts';
import { hasTmux, tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { MAIN_SESSION, listPanes } from '../panes.ts';
import { createSession } from '../session.ts';

// The server keeps tmux's own keys, so a pane can appear in our session that we never made: split
// by hand, or by the person's own tmux.conf. It must not stop a start, and is none of ours to touch.
const socket = `shv-strays-${process.pid}`;
const tmux = createTmux({ socket });
const size = { cols: 100, rows: 30 };
const session = createSession({
  tmux,
  config: { sidebarWidth: 30 },
  adapter: createSheavlyV1({
    sheavlyHome: '/nonexistent',
    harnessDir: '/tmp',
    command: 'sleep 600 #',
  }),
  sidebarCommand: ['sh', '-c', 'exec sleep 600'],
});

before(async () => {
  if (hasTmux) await session.ensure(size);
});
after(async () => {
  if (hasTmux) await session.stop();
});

const inMain = async () => (await listPanes(tmux)).filter((pane) => pane.session === MAIN_SESSION);
const content = async () =>
  (await inMain()).filter((pane) => pane.role === 'chat' || pane.role === 'placeholder');

test(
  'a pane that is not ours in the session does not stop a start, and is left where it is',
  options,
  async () => {
    const stray = (
      await tmux.run([
        'split-window',
        '-d',
        '-t',
        `=${MAIN_SESSION}:`,
        '-P',
        '-F',
        '#{pane_id}',
        'sleep 600',
      ])
    ).trim();

    // Starts again, as `sheavly-tmux` does each time: once this refused with "found 2".
    await session.ensure(size);

    const [onScreen] = await content();
    const opened = await session.openChat({ workspace: '/tmp' });
    const panes = await inMain();

    assert.ok(onScreen);
    assert.equal((await content()).length, 1);
    assert.equal(panes.find((pane) => pane.id === opened)?.role, 'chat');
    // Still there, still without a role: not counted, moved or killed.
    assert.equal(panes.find((pane) => pane.id === stray)?.role, '');
    assert.equal(panes.find((pane) => pane.id === stray)?.dead, false);
  },
);

test('a content pane that was closed is put back by the next start', options, async () => {
  const [onScreen] = await content();

  await tmux.run(['kill-pane', '-t', onScreen?.id as string]);
  assert.equal((await content()).length, 0);

  await session.ensure(size);

  const [restored] = await content();

  assert.equal(restored?.role, 'placeholder');
  assert.equal((await content()).length, 1);
});

test(
  'two panes of ours beside the sidebar is an error that names them and says how to reset',
  options,
  async () => {
    const [onScreen] = await content();
    const second = (
      await tmux.run([
        'split-window',
        '-d',
        '-t',
        `=${MAIN_SESSION}:`,
        '-P',
        '-F',
        '#{pane_id}',
        'sleep 600',
      ])
    ).trim();

    await tmux.run(['set-option', '-p', '-t', second, '@sheavly_role', 'placeholder']);

    await assert.rejects(
      session.ensure(size),
      (caughtError: Error) =>
        caughtError.message.includes('found 2') &&
        caughtError.message.includes(`${onScreen?.id} (placeholder)`) &&
        caughtError.message.includes(`${second} (placeholder)`) &&
        caughtError.message.includes('`sheavly-tmux stop`'),
    );
  },
);

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { createSession } from '../session.ts';

// tmux's own keys can open a window or split a pane in the session, which its layout does not
// expect (a second window was what broke a start). The session switches them off.
const tmux = createTmux({ socket: `shv-lock-${process.pid}` });
const size = { cols: 100, rows: 30 };
const sessionWith = (lockTmux?: boolean) =>
  createSession({
    tmux,
    config: { sidebarWidth: 30, ...(lockTmux === undefined ? {} : { lockTmux }) },
    adapter: { launch: () => ({ cwd: '/tmp', env: {}, command: 'sleep 600' }) },
    sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  });
const value = async (name: string) =>
  (await tmux.run(['show-options', '-gqv', name]).catch(() => '')).trim();
const rootKeys = () => tmux.run(['list-keys', '-T', 'root']);

after(async () => {
  await tmux.run(['kill-server']).catch(() => undefined);
});

test(
  'tmux’s prefix and the mouse menus that change the layout are off by default, and our keys and the wheel are not',
  options,
  async () => {
    await sessionWith().ensure(size);

    // Nothing of the prefix table can be reached, so no `C-b c`, `C-b %` or `C-b x`.
    assert.equal(await value('prefix'), 'None');
    assert.equal(await value('prefix2'), 'None');

    const root = await rootKeys();

    // The right-click menus (split, new window, kill) and the pane controls are gone...
    for (const key of ['MouseDown3Pane', 'MouseDown3Status', 'MouseDown3StatusLeft']) {
      assert.doesNotMatch(root, new RegExp(`-T root ${key} `), key);
    }

    // ...what the session uses is not: our keys, the wheel, and dragging a border.
    assert.match(root, /M-s .*select-pane/);
    assert.match(root, /WheelUpPane /);
    assert.match(root, /MouseDrag1Border /);
  },
);

test(
  'the person’s own prefix is kept while it is off and given back when the lock is, with no second start taking None for it',
  options,
  async () => {
    // A prefix of their own, set before we ever start (a tmux.conf would do it).
    await tmux.run(['set-option', '-g', 'prefix', 'C-a']);
    await tmux.run(['set-option', '-g', 'prefix2', 'C-z']);
    await tmux.run(['set-option', '-gu', '@sheavly_saved_prefix']);
    await tmux.run(['set-option', '-gu', '@sheavly_saved_prefix2']);

    await sessionWith().ensure(size);
    assert.equal(await value('prefix'), 'None');
    assert.equal(await value('@sheavly_saved_prefix'), 'C-a');

    // Another locked start must not write "None" over what was saved.
    await sessionWith(true).ensure(size);
    assert.equal(await value('@sheavly_saved_prefix'), 'C-a');
    assert.equal(await value('@sheavly_saved_prefix2'), 'C-z');

    await sessionWith(false).ensure(size);
    assert.equal(await value('prefix'), 'C-a');
    assert.equal(await value('prefix2'), 'C-z');
    assert.equal(await value('@sheavly_saved_prefix'), '');

    // Unlocked and started again: nothing to restore, the prefix is left as it is.
    await sessionWith(false).ensure(size);
    assert.equal(await value('prefix'), 'C-a');

    await sessionWith(true).ensure(size);
    assert.equal(await value('prefix'), 'None');
    assert.equal(await value('@sheavly_saved_prefix'), 'C-a');
  },
);

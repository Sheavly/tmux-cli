import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { SIDEBAR_TARGET } from '../layout.ts';
import { createSession } from '../session.ts';

const tmux = createTmux({ socket: `shv-width-${process.pid}` });

after(async () => {
  await tmux.run(['kill-server']).catch(() => undefined);
});

test('the width keys are bound, and the target they resize is the sidebar', options, async () => {
  await createSession({
    tmux,
    config: { sidebarWidth: 30 },
    adapter: { launch: () => ({ cwd: '/tmp', env: {}, command: 'sleep 600' }) },
    sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  }).ensure({ cols: 100, rows: 30 });

  const root = await tmux.run(['list-keys', '-T', 'root']);

  // tmux lists a key's modifiers as C-M-.
  assert.match(root, /C-M-1 .*-x 30/);
  assert.match(root, /C-M-2 .*-x 38/);
  assert.match(root, /C-M-4 .*-x 54/);

  const sidebarWidth = async () =>
    (await tmux.run(['display-message', '-p', '-t', SIDEBAR_TARGET, '#{pane_width}'])).trim();

  // What the key runs, as tmux lists it, must be a command tmux can run again: a `{left}` left
  // bare in a hook was a syntax error.
  const bound = /C-M-2 +(.*)/.exec(root)?.[1] ?? '';

  await tmux.run(['run-shell', '-C', bound.replaceAll('\\;', ';')]);
  assert.equal(await sidebarWidth(), '38');

  // And the hook it left behind puts the sidebar back to that width after a resize.
  await tmux.run(['resize-pane', '-t', SIDEBAR_TARGET, '-x', '50']);

  const hook = /window-resized(?:\[\d+\])? (.*)/.exec(
    await tmux.run(['show-hooks', '-g', 'window-resized']),
  )?.[1];

  await tmux.run(['run-shell', '-C', hook ?? '']);
  assert.equal(await sidebarWidth(), '38');
});

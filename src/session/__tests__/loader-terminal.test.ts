import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, test } from 'node:test';
import { promisify } from 'node:util';
import { tmuxOptions as options, wait } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { createSession } from '../session.ts';

const run = promisify(execFile);

// The loader is a Node process in the background of the chat's pane. Node puts the terminal
// settings it found at start back when it exits, so a loader that shares the pane's terminal
// undid the raw mode a chat had just switched on, and the chat then took Enter for a line feed
// and showed what was typed twice. A chat that was ready quickly (one on a running server) was
// the one that lost the race.
const tmux = createTmux({ socket: `shv-loader-${process.pid}` });
const size = { cols: 100, rows: 30 };
// What a chat does: switch the terminal to raw a moment after it starts.
const CHAT = 'sleep 0.2; stty -echo -icanon -icrnl; sleep 30';
// A loader that ends a little after the chat has set it up.
const LOADER = "node -e 'setTimeout(() => {}, 700)'";

after(async () => {
  await tmux.run(['kill-server']).catch(() => undefined);
});

test(
  'a loader that ends does not put back the terminal settings the chat had changed',
  options,
  async () => {
    const session = createSession({
      tmux,
      config: { sidebarWidth: 30 },
      adapter: { launch: () => ({ cwd: '/tmp', env: {}, command: CHAT }) },
      sidebarCommand: ['sh', '-c', 'exec sleep 600'],
      loaderCommand: LOADER,
    });

    await session.ensure(size);

    const pane = await session.openChat({ workspace: '/tmp' });

    // Past the chat's change (0.2 s) and the loader's end (about 0.8 s).
    await wait(2000);

    const tty = (await tmux.run(['display-message', '-p', '-t', pane, '#{pane_tty}'])).trim();
    const { stdout } = await run('stty', ['-F', tty, '-a']);

    for (const flag of ['-icanon', '-echo', '-icrnl']) {
      assert.ok(` ${stdout.replaceAll(/[;\n]/g, ' ')} `.includes(` ${flag} `), flag);
    }
  },
);

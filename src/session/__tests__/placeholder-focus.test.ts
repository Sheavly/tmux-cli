import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSheavlyV1 } from '../../harness/adapters/sheavly-v1/index.ts';
import { tmuxOptions as options, wait } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { MAIN_SESSION, listPanes } from '../panes.ts';
import { createSession } from '../session.ts';

const SIZE = { cols: 100, rows: 30 };
const adapter = createSheavlyV1({
  sheavlyHome: '/nonexistent',
  harnessDir: '/tmp',
  command: 'sleep 600 #',
});

/** A server of its own, so a test cannot be disturbed by another's panes. */
function startServer(name: string) {
  const tmux = createTmux({ socket: `shv-${name}-${process.pid}` });
  const session = createSession({
    tmux,
    config: { sidebarWidth: 30 },
    adapter,
    sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  });

  return { tmux, session };
}

const keyboardRole = async (tmux: ReturnType<typeof createTmux>): Promise<string | undefined> =>
  (await listPanes(tmux)).find((pane) => pane.session === MAIN_SESSION && pane.active)?.role;

/** The hook runs after the command returns, so what it does is waited for, not assumed. */
async function until(check: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await check()) return true;

    await wait(50);
  }

  return false;
}

test(
  'selecting the placeholder hands the keyboard straight back to the sidebar',
  options,
  async () => {
    const { tmux, session } = startServer('placeholder-focus');

    try {
      await session.ensure(SIZE);

      const placeholder = (await listPanes(tmux)).find((pane) => pane.role === 'placeholder');

      await tmux.run(['select-pane', '-t', placeholder?.id ?? '']);

      assert.ok(await until(async () => (await keyboardRole(tmux)) === 'sidebar'));
    } finally {
      await session.stop();
    }
  },
);

test('a chat can still take the keyboard: only the placeholder is bounced', options, async () => {
  const { tmux, session } = startServer('chat-focus');

  try {
    await session.ensure(SIZE);
    await session.openChat({ workspace: '/tmp' });

    assert.equal(await keyboardRole(tmux), 'chat');

    const sidebar = (await listPanes(tmux)).find((pane) => pane.role === 'sidebar');

    await tmux.run(['select-pane', '-t', sidebar?.id ?? '']);
    await tmux.run(['select-pane', '-R']);
    await wait(300);

    assert.equal(await keyboardRole(tmux), 'chat');
  } finally {
    await session.stop();
  }
});

test(
  'stopping the chat that has the keyboard leaves it with the sidebar, not the placeholder',
  options,
  async () => {
    const { tmux, session } = startServer('stop-focus');

    try {
      await session.ensure(SIZE);

      const chat = await session.openChat({ workspace: '/tmp' });

      assert.equal(await keyboardRole(tmux), 'chat');

      await session.stopChat(chat);

      assert.ok(await until(async () => (await keyboardRole(tmux)) === 'sidebar'));
      assert.equal(
        (await listPanes(tmux)).find((pane) => pane.session === MAIN_SESSION && pane.active)?.role,
        'sidebar',
      );
    } finally {
      await session.stop();
    }
  },
);

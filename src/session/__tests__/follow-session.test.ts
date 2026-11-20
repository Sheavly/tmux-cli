import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createSheavlyV1 } from '../../harness/adapters/sheavly-v1/index.ts';
import { hasTmux, tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import {
  MAIN_SESSION,
  PARKING_SESSION,
  isContentPane,
  listPanes,
  type PaneInfo,
} from '../panes.ts';
import { createSession } from '../session.ts';

const socket = `shv-follow-${process.pid}`;
const CHAT = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
const tmux = createTmux({ socket });
const adapter = createSheavlyV1({
  sheavlyHome: '/nonexistent',
  harnessDir: '/tmp',
  command: 'sleep 600 #',
});
// The two ids are added after this, so they are what `sh -c` calls $0 and $1.
const followCommand = `sh -c 'echo following "$0" "$1"; exec sleep 600'`;
let clock = 1_000_000;
const session = createSession({
  tmux,
  adapter,
  config: { sidebarWidth: 30 },
  sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  followCommand,
  now: () => clock,
});

before(() => (hasTmux ? session.ensure({ cols: 100, rows: 30 }) : undefined));
after(() => (hasTmux ? session.stop() : undefined));

/** The panes on screen that are not the sidebar: there must be exactly one. */
async function beside(): Promise<PaneInfo[]> {
  const panes = await listPanes(tmux);

  return panes.filter((pane) => pane.session === MAIN_SESSION && isContentPane(pane));
}

test(
  'a child is shown beside the sidebar by a pane that says what it follows',
  options,
  async () => {
    const id = await session.openFollow({ chatId: CHAT, childId: 't1', workspace: '/tmp' });
    const [onScreen, ...others] = await beside();

    assert.equal(others.length, 0, 'exactly one pane is beside the sidebar');
    assert.equal(onScreen?.id, id);
    assert.equal(onScreen?.role, 'follow');
    assert.equal(onScreen?.follow, `${CHAT}:t1`);
    assert.equal(onScreen?.workspace, '/tmp');

    // The ids reach the command as its own arguments, whatever they hold.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.match(
      await tmux.run(['capture-pane', '-p', '-t', id]),
      new RegExp(`following ${CHAT} t1`),
    );
  },
);

test('opening the child that is already on screen starts nothing', options, async () => {
  const [onScreen] = await beside();
  const again = await session.openFollow({ chatId: CHAT, childId: 't1', workspace: '/tmp' });
  const follows = (await listPanes(tmux)).filter((pane) => pane.role === 'follow');

  assert.equal(again, onScreen?.id);
  assert.equal(follows.length, 1);
});

test(
  'a follow pane that was left is removed once it has had time to be shown',
  options,
  async () => {
    const chat = await session.openChat({ workspace: '/tmp', chatId: CHAT });
    const parked = (await listPanes(tmux)).find((pane) => pane.role === 'follow');

    assert.equal(parked?.session, PARKING_SESSION);
    assert.equal((await beside()).map((pane) => pane.id).join(), chat);

    // Only just started: it may still be on its way to the screen.
    await session.reapStaleFollows(await listPanes(tmux));
    assert.equal(
      (await listPanes(tmux)).some((pane) => pane.role === 'follow'),
      true,
    );

    clock += 60_000;
    await session.reapStaleFollows(await listPanes(tmux));
    assert.equal(
      (await listPanes(tmux)).some((pane) => pane.role === 'follow'),
      false,
    );
  },
);

test('showing a child puts the chat that was on screen away, still running', options, async () => {
  const chat = await session.openChat({ workspace: '/tmp', chatId: CHAT });
  const follow = await session.openFollow({ chatId: CHAT, childId: 't2', workspace: '/tmp' });
  const panes = await listPanes(tmux);

  assert.equal(panes.find((pane) => pane.id === chat)?.session, PARKING_SESSION);
  assert.equal(panes.find((pane) => pane.id === chat)?.dead, false);
  assert.equal((await beside()).map((pane) => pane.id).join(), follow);
});

test('a child on screen goes when its chat stops, however it stopped', options, async () => {
  const chat = await session.openChat({ workspace: '/tmp', chatId: CHAT });
  const follow = await session.openFollow({ chatId: CHAT, childId: 't3', workspace: '/tmp' });

  // The chat is still running: its child stays on screen.
  await session.reapStaleFollows(await listPanes(tmux));
  assert.equal((await beside()).map((pane) => pane.id).join(), follow);

  // The chat's process is gone (stopped, exited, killed).
  await tmux.run(['kill-pane', '-t', chat]);
  await session.reapStaleFollows(await listPanes(tmux));

  assert.deepEqual(
    (await beside()).map((pane) => pane.role),
    ['placeholder'],
  );
  assert.equal(
    (await listPanes(tmux)).some((pane) => pane.role === 'follow'),
    false,
  );
});

test('a session with no follow command refuses to open a child', options, async () => {
  const bare = createSession({
    tmux,
    adapter,
    config: { sidebarWidth: 30 },
    sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  });

  await assert.rejects(
    bare.openFollow({ chatId: CHAT, childId: 't1', workspace: '/tmp' }),
    /no command to follow/,
  );
});

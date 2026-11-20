import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sidebarCommand } from '../../cli/shell-commands.ts';
import { createSheavlyV1 } from '../../harness/adapters/sheavly-v1/index.ts';
import {
  A,
  LOG,
  MAIN,
  agent,
  started,
} from '../../harness/adapters/sheavly-v1/testing/stream-lines.fake.ts';
import { MAIN_SESSION, listPanes } from '../../session/panes.ts';
import { createSession } from '../../session/session.ts';
import { hasTmux, tmuxOptions as options, until } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';

/**
 * The real sidebar and the real `follow` program, in the panes of a real tmux, over a sheavly home
 * of our own: a running chat that has a sub-agent and a background command, and keys pressed
 * as a person would press them. The environment is set before the server starts, since the panes
 * it creates (and so the sidebar and the follow program) inherit it.
 */
const socket = `shv-follow-e2e-${process.pid}`;
const CHAT = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
const PROFILE = 'a8e3c1d7-5f2b-4b96-8d40-6c7e9a1b2f50';
const tmux = createTmux({ socket });
const saved = { ...process.env };
let session: ReturnType<typeof createSession>;

const write = (file: string, text: string) =>
  mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, text));

before(async () => {
  if (!hasTmux) return;

  const root = await mkdtemp(path.join(os.tmpdir(), 'shv-follow-e2e-'));
  const workspace = path.join(root, 'work');
  const sheavlyHome = path.join(root, 'sheavly');
  const conversation = path.join(sheavlyHome, 'profiles', PROFILE, 'workspaces', 'k1');
  const dir = path.join(conversation, 'conversations', CHAT);
  const now = Date.now();
  const index = { id: CHAT, workspace, status: 'open', startedAt: now, updatedAt: now };
  const first = { seq: 0, entry: { role: 'user', origin: 'user', content: 'Build the thing' } };
  const task = { seq: 0, entry: { role: 'user', content: 'Find the thing' } };

  await mkdir(workspace);
  await write(
    path.join(root, 'config', 'sheavly-tmux', 'config.json'),
    JSON.stringify({ socket, command: 'sleep 600 #', harnessDir: '/tmp' }),
  );
  await write(path.join(dir, 'index.json'), JSON.stringify(index));
  await write(path.join(dir, 'history.jsonl'), `${JSON.stringify(first)}\n`);
  await write(path.join(dir, 'agents', `${A}.history.jsonl`), `${JSON.stringify(task)}\n`);
  await write(path.join(dir, 'outputs', `${LOG}.log`), 'hello from the build\n');
  Object.assign(process.env, {
    XDG_CONFIG_HOME: path.join(root, 'config'),
    SHEAVLY_HOME: sheavlyHome,
    SHEAVLY_HARNESS_DIR: '/tmp',
  });

  const adapter = createSheavlyV1({ sheavlyHome, harnessDir: '/tmp', command: 'sleep 600 #' });

  session = createSession({
    tmux,
    adapter,
    config: { sidebarWidth: 44 },
    sidebarCommand: sidebarCommand(),
  });
  await session.ensure({ cols: 110, rows: 30 });
  await session.openChat({ workspace, chatId: CHAT });

  // What the running chat has started: after the chat's own start, which is what counts.
  const later = Date.now();
  const lines = [
    agent('session_started', A, MAIN, 'Research').replace('"startedAt":10', `"startedAt":${later}`),
    started('t1', 'npm test', { ref: LOG }).replace('"startedAt":5', `"startedAt":${later + 1}`),
  ];

  await write(path.join(dir, 'stream.jsonl'), `${lines.join('\n')}\n`);
});
after(async () => {
  Object.assign(process.env, saved);

  if (hasTmux) await session.stop();
});

const role = async (wanted: string) => (await listPanes(tmux)).find((pane) => pane.role === wanted);
const capture = (pane: string) => tmux.run(['capture-pane', '-p', '-t', pane]);
const shows = (pane: string, text: string) =>
  until(async () => (await capture(pane)).includes(text), text);

test(
  'a running chat lists its sub-agent and command, and Enter shows what each writes',
  options,
  async () => {
    const sidebar = (await role('sidebar'))?.id as string;

    await shows(sidebar, 'Build the thing');
    await shows(sidebar, '◆ Research');
    await shows(sidebar, '▸ npm test');

    // The workspace row, the chat, then the sub-agent.
    await tmux.run(['send-keys', '-t', sidebar, 'Down', 'Down', 'Enter']);
    await until(async () => (await role('follow')) !== undefined, 'a follow pane');

    const agentPane = (await role('follow')) as NonNullable<Awaited<ReturnType<typeof role>>>;

    assert.equal(agentPane.session, MAIN_SESSION);
    await shows(agentPane.id, 'Find the thing');

    // Typing into it reaches nothing, and the chat's input is not where it goes.
    await tmux.run(['send-keys', '-t', agentPane.id, '-l', 'hello?']);

    await tmux.run(['send-keys', '-t', sidebar, 'Down', 'Enter']);
    await until(
      async () => (await role('follow'))?.follow.endsWith(':t1') === true,
      'the command to be on screen',
    );
    await shows((await role('follow'))?.id as string, 'hello from the build');
    assert.doesNotMatch(await capture((await role('follow'))?.id as string), /hello\?/);
  },
);

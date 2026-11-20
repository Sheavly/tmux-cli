import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ChatActivity, ProfileInfo, StoredChat } from '../../harness/adapter.types.ts';
import type { PaneInfo } from '../../session/panes.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import {
  readActiveProfile,
  readCollapsed,
  readRunningOnly,
  writeActiveProfile,
  writeCollapsed,
  writeRunningOnly,
} from '../active.ts';
import {
  chatsOnProfile,
  chooseProfile,
  countByProfile,
  elsewhereStatuses,
  panesOnProfile,
  profileItem,
  type ProfileStatuses,
} from '../profiles.ts';

const profiles: ProfileInfo[] = [
  { id: 'aws', name: 'Amazon' },
  { id: 'azure', name: 'Work' },
];
const chat = (id: string, profile: string, startedAt = 1): StoredChat => ({
  id,
  profile,
  workspace: '/w',
  startedAt,
  updatedAt: startedAt,
});
const pane = (over: Partial<PaneInfo>): PaneInfo => fakePane(over);

test('the profile shown is the saved one, else where the user last worked, else the first', () => {
  const chats = [chat('a', 'aws', 5), chat('b', 'azure', 9)];

  assert.equal(chooseProfile({ profiles, saved: 'aws', chats }), 'aws');
  // A saved profile that is gone is not used.
  assert.equal(chooseProfile({ profiles, saved: 'deleted', chats }), 'azure');
  assert.equal(chooseProfile({ profiles, saved: undefined, chats: [] }), 'aws');
  assert.equal(chooseProfile({ profiles: [], saved: 'aws', chats }), undefined);
  // The newest chat of a profile that no longer exists does not count.
  assert.equal(
    chooseProfile({ profiles, saved: undefined, chats: [chat('x', 'gone', 99)] }),
    'aws',
  );
});

test('only the chats of the profile shown are listed, and all of them when there is none', () => {
  const chats = [chat('a', 'aws'), chat('b', 'azure'), chat('c', 'aws')];

  assert.deepEqual(
    chatsOnProfile(chats, 'aws').map((each) => each.id),
    ['a', 'c'],
  );
  assert.equal(chatsOnProfile(chats, '').length, 3);
});

test('a starting chat is listed on its own profile only, and one with no profile on every one', () => {
  const panes = [
    pane({ id: '%1', profile: 'aws' }),
    pane({ id: '%2', profile: 'azure' }),
    pane({ id: '%3' }),
    pane({ id: '%4', chat: 'known', profile: 'azure' }),
  ];

  assert.deepEqual(
    panesOnProfile(panes, 'aws').map((each) => each.id),
    ['%1', '%3', '%4'],
  );
  assert.equal(panesOnProfile(panes, '').length, 4);
});

test('the summary counts each status of the chats running on other profiles, leaving out zeros', () => {
  const chats = [chat('a', 'aws'), chat('b', 'azure'), chat('c', 'azure'), chat('d', 'azure')];
  const panes = [
    pane({ id: '%1', chat: 'a' }),
    pane({ id: '%2', chat: 'b' }),
    pane({ id: '%3', chat: 'c' }),
    pane({ id: '%4', chat: 'd', dead: true }),
    pane({ id: '%5', profile: 'azure' }),
    pane({ id: '%6' }),
    pane({ id: '%7', role: 'placeholder', profile: 'azure' }),
  ];
  const activity = new Map<string, ChatActivity>([
    ['a', 'running'],
    ['b', 'awaiting_input'],
    ['c', 'running'],
  ]);
  const summary = (active: string): ProfileStatuses[] =>
    elsewhereStatuses({ profiles, panes, chats, activity, active });

  // %5 is starting, so it has no activity yet and counts as idle; the dead pane and the rest don't.
  assert.deepEqual(summary('aws'), [
    {
      name: 'Work',
      counts: [
        { activity: 'awaiting_input', count: 1 },
        { activity: 'running', count: 1 },
        { activity: 'idle', count: 1 },
      ],
    },
  ]);
  assert.deepEqual(summary('azure'), [
    { name: 'Amazon', counts: [{ activity: 'running', count: 1 }] },
  ]);
  assert.deepEqual(summary(''), []);
});

test('the summary is empty when nothing runs on the other profiles', () => {
  const chats = [chat('a', 'aws')];

  assert.deepEqual(
    elsewhereStatuses({
      profiles,
      panes: [pane({ chat: 'a' })],
      chats,
      activity: new Map(),
      active: 'aws',
    }),
    [],
  );
});

test('the selector lists each profile with its chats and what is running', () => {
  const chats = [chat('a', 'aws'), chat('b', 'azure'), chat('c', 'azure')];
  const counts = countByProfile({ profiles, chats, panes: [pane({ chat: 'c' })] });

  assert.deepEqual(
    counts.map((count) => profileItem(count, 'azure')),
    ['  Amazon  (1 chat)', '▶ Work  (2 chats, 1 running)'],
  );
});

test('folded folders are saved in the same file and do not disturb the active profile', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-state-'));
  const file = path.join(dir, 'state.json');

  assert.deepEqual(await readCollapsed(file), []);

  await writeActiveProfile({ file, adapter: 'sheavly-v1', id: 'aws' });
  await writeCollapsed({ file, folders: new Set(['/a', '/b']) });
  await writeActiveProfile({ file, adapter: 'sheavly-v1', id: 'azure' });

  assert.deepEqual(await readCollapsed(file), ['/a', '/b']);
  assert.equal(await readActiveProfile({ file, adapter: 'sheavly-v1' }), 'azure');

  await writeCollapsed({ file, folders: [] });

  assert.deepEqual(await readCollapsed(file), []);
});

test('the running-only filter is saved in the same file and is off by default', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-state-'));
  const file = path.join(dir, 'state.json');

  assert.equal(await readRunningOnly(file), false);

  await writeRunningOnly({ file, on: true });
  await writeCollapsed({ file, folders: ['/a'] });

  assert.equal(await readRunningOnly(file), true);
  assert.deepEqual(await readCollapsed(file), ['/a']);

  await writeRunningOnly({ file, on: false });

  assert.equal(await readRunningOnly(file), false);
});

test('the active profile is remembered per adapter in a file of our own', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-state-'));
  const file = path.join(dir, 'sub', 'state.json');

  assert.equal(await readActiveProfile({ file, adapter: 'sheavly-v1' }), undefined);

  await writeActiveProfile({ file, adapter: 'sheavly-v1', id: 'aws' });
  await writeActiveProfile({ file, adapter: 'other', id: 'x' });
  await writeActiveProfile({ file, adapter: 'sheavly-v1', id: 'azure' });

  assert.equal(await readActiveProfile({ file, adapter: 'sheavly-v1' }), 'azure');
  assert.equal(await readActiveProfile({ file, adapter: 'other' }), 'x');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
    activeProfile: { 'sheavly-v1': 'azure', other: 'x' },
  });

  await writeFile(file, '{nope');
  await assert.rejects(readActiveProfile({ file, adapter: 'sheavly-v1' }), /not valid JSON/);
});

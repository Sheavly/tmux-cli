import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { latestFirst, newEditState } from '../../../adapter.utils.ts';
import { createAdapter } from '../../../index.ts';
import { parseEditLine } from '../edits.ts';
import { createSheavlyV1, resolveSheavlyV1Options } from '../index.ts';

const ID = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';

test('an edit is timed by the entry, or by the record around it in older histories', () => {
  const call = '"toolCalls":[{"name":"write_file","input":{"path":"a.ts"}}]';
  const at = (line: string) => parseEditLine(line).map((change) => change.at);

  // Newer sheavly: the time is in the entry.
  assert.deepEqual(
    at(`{"seq":1,"entry":{"role":"assistant",${call},"at":1795043974150}}`),
    [1795043974150],
  );
  // Older sheavly: the time is on the record.
  assert.deepEqual(at(`{"at":5,"entry":{"role":"assistant",${call}}}`), [5]);
  // Both: the entry's own time wins.
  assert.deepEqual(at(`{"at":5,"entry":{"role":"assistant",${call},"at":9}}`), [9]);
  // Neither: no time is known, which is 0 and not a guess.
  assert.deepEqual(at(`{"entry":{"role":"assistant",${call}}}`), [0]);
  // A time that is not a number is not used.
  assert.deepEqual(at(`{"at":"soon","entry":{"role":"assistant",${call},"at":"later"}}`), [0]);
});

test('options: defaults, then the config file, then the environment', () => {
  const defaults = resolveSheavlyV1Options({ settings: {}, env: {}, home: '/h' });

  assert.equal(defaults.sheavlyHome, '/h/.sheavly');
  assert.equal(defaults.harnessDir, '/h/harness');
  assert.match(defaults.command, /apps\/terminal\/dist\/chat\.js/);

  const fromFile = resolveSheavlyV1Options({
    settings: { harnessDir: '/file', command: 'go' },
    env: {},
    home: '/h',
  });

  assert.equal(fromFile.harnessDir, '/file');
  assert.equal(fromFile.command, 'go');

  const fromEnv = resolveSheavlyV1Options({
    settings: { harnessDir: '/file' },
    env: { SHEAVLY_HARNESS_DIR: '/env', SHEAVLY_HOME: '/data' },
    home: '/h',
  });

  assert.equal(fromEnv.harnessDir, '/env');
  assert.equal(fromEnv.sheavlyHome, '/data');
});

test('launch runs in the harness folder with the chat folder in its environment', () => {
  const adapter = createSheavlyV1({ sheavlyHome: '/s', harnessDir: '/harness', command: 'go' });

  assert.deepEqual(adapter.launch({ workspace: '/w' }), {
    cwd: '/harness',
    env: { WORKSPACE_ROOT: '/w' },
    command: 'go',
  });
  assert.equal(adapter.launch({ workspace: '/w', chatId: ID }).command, `go --resume ${ID}`);
  assert.throws(
    () => adapter.launch({ workspace: '/w', chatId: 'x; rm -rf ~' }),
    /Not a conversation id/,
  );
});

test('a new chat is started on the profile it is given, a stored one on its own', () => {
  const adapter = createSheavlyV1({ sheavlyHome: '/s', harnessDir: '/harness', command: 'go' });
  const profile = 'a8e3c1d7-5f2b-4b96-8d40-6c7e9a1b2f50';

  assert.equal(adapter.launch({ workspace: '/w', profile }).command, `go --profile ${profile}`);
  // Resuming reopens the conversation on the profile it started on: the flag is not sent.
  assert.equal(
    adapter.launch({ workspace: '/w', chatId: ID, profile }).command,
    `go --resume ${ID}`,
  );
  assert.throws(
    () => adapter.launch({ workspace: '/w', profile: 'x; rm -rf ~' }),
    /Not a profile id/,
  );
});

test('profiles are listed by name from their profile.json, one that cannot be read by its id', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const work = 'a8e3c1d7-5f2b-4b96-8d40-6c7e9a1b2f50';
  const home2 = 'e2b6d4f8-1a3c-4d57-9b82-3f5a7c9e1d61';
  const broken = '11111111-2222-4333-8444-555555555555';

  for (const [id, text] of [
    [work, JSON.stringify({ id: work, name: 'Work' })],
    [home2, JSON.stringify({ id: home2, name: 'Amazon' })],
    [broken, '{nope'],
  ] as const) {
    await mkdir(path.join(home, 'profiles', id), { recursive: true });
    await writeFile(path.join(home, 'profiles', id, 'profile.json'), text);
  }

  await mkdir(path.join(home, 'profiles', '.Trash'), { recursive: true });

  const adapter = createSheavlyV1({ sheavlyHome: home, harnessDir: '/h', command: 'go' });

  assert.deepEqual(await adapter.listProfiles?.(), [
    { id: broken, name: '11111111' },
    { id: home2, name: 'Amazon' },
    { id: work, name: 'Work' },
  ]);
});

test('an unknown adapter name is an error that lists the known ones', () => {
  assert.throws(
    () => createAdapter({ name: 'nope', settings: {} }),
    /Unknown adapter "nope".*sheavly-v1/,
  );
});

test('chats, labels, edits and deletion work through the adapter without exposing folders', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const dir = path.join(home, 'profiles', 'p', 'workspaces', 'k', 'conversations', ID);

  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'index.json'),
    // The home folder stands in for the workspace: it must exist to be listed.
    JSON.stringify({ id: ID, workspace: home, status: 'open', startedAt: 1, updatedAt: 2 }),
  );
  await writeFile(
    path.join(dir, 'history.jsonl'),
    [
      '{"entry":{"role":"user","origin":"user","content":"hello"}}',
      '{"at":5,"entry":{"role":"assistant","toolCalls":[{"name":"edit_file","input":{"path":"a.ts"}}]}}',
    ].join('\n') + '\n',
  );

  const adapter = createSheavlyV1({ sheavlyHome: home, harnessDir: '/h', command: 'go' });
  const { chats } = await adapter.listChats();

  assert.deepEqual(chats, [{ id: ID, workspace: home, startedAt: 1, updatedAt: 2, profile: 'p' }]);

  const [chat] = chats;

  assert.equal(await adapter.chatLabel(chat!), 'hello');

  const state = newEditState();

  assert.equal(await adapter.edits?.update(chat!, state), true);
  assert.deepEqual(
    latestFirst(state).map((file) => [file.path, file.kind, file.at]),
    [[path.join(home, 'a.ts'), 'edited', 5]],
  );
  // Nothing was added, so a second look finds nothing new.
  assert.equal(await adapter.edits?.update(chat!, state), false);

  await adapter.deleteChat?.(chat!);
  assert.deepEqual((await adapter.listChats()).chats, []);
  await assert.rejects(adapter.chatLabel(chat!), /Unknown chat/);
});

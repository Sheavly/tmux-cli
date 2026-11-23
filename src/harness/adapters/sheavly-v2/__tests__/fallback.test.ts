import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { EditState } from '../../../adapter.types.ts';
import { stripEscapes } from '../../../../terminal/ansi.ts';
import { MAIN, sessionStarted, taskStarted } from '../testing/entries.fake.ts';
import { sseOf, type FakeServer } from '../testing/sheavly-server.fake.ts';
import {
  CHAT,
  ID,
  OTHER,
  WORKSPACE,
  withAdapter,
  writeHarnessChat,
} from '../testing/with-adapter.fake.ts';

const MESSAGES = `GET /conversations/${ID}/messages`;

/** Makes the fake server say the chat is running, with `messages` as its history. */
function isRunning(server: FakeServer, messages: object[]): void {
  server.answers.set(MESSAGES, { status: 200, body: { messages } });
}

const record = (entry: object) => ({ entry });
const prompt = (content: string, at: number) =>
  record({ role: 'user', origin: 'user', content, at });
const HISTORY = [
  prompt('fix the build', 100),
  record({ role: 'assistant', content: 'on it', toolCalls: [], at: 150 }),
  prompt('and the tests', 200),
  record({
    role: 'assistant',
    content: 'done',
    toolCalls: [{ id: 'c', name: 'edit_file', input: { path: 'a.ts' } }],
    at: 250,
  }),
];

test('a chat that is not running gets its label, last prompt and recap from the harness files', async () => {
  await withAdapter(async ({ adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });

    assert.equal(await adapter.chatLabel(CHAT), 'fix the build');
    assert.equal(await adapter.lastPromptAt?.(CHAT), 200);

    const recap = (await adapter.recap?.(CHAT, { columns: 80 })) ?? '';

    assert.ok(recap.includes('and the tests'));
  });
});

test('a running chat is read from the API, whatever the files hold', async () => {
  await withAdapter(async ({ server, adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });
    isRunning(server, [{ role: 'user', origin: 'user', content: 'from the api', at: 900 }]);

    assert.equal(await adapter.chatLabel(CHAT), 'from the api');
    assert.equal(await adapter.lastPromptAt?.(CHAT), 900);
  });
});

test('the files list of a chat that is not running comes from the harness files', async () => {
  await withAdapter(async ({ adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });

    const state: EditState = { files: new Map(), cursor: undefined };

    assert.equal(await adapter.edits?.update(CHAT, state), true);
    assert.deepEqual(
      [...state.files.values()],
      [{ path: path.join(WORKSPACE, 'a.ts'), kind: 'edited', at: 250, count: 1 }],
    );
    assert.equal(await adapter.edits?.update(CHAT, state), false);
  });
});

test('a command of a running chat is followed from the log the harness keeps of it', async () => {
  await withAdapter(async ({ server, adapter, home }) => {
    const task = (type: string, status: string) => ({
      kind: 'task',
      sessionId: MAIN,
      at: 2,
      update: {
        type,
        task: {
          id: 'task-1',
          kind: 'task',
          description: 'tests',
          command: 'npm test',
          startedAt: 2,
          status,
          outputLog: { ref: OTHER },
        },
      },
    });

    await writeHarnessChat(home, {
      stream: [task('task_started', 'running'), task('task_ended', 'completed')],
      outputs: { [OTHER]: 'hello from the command\n' },
    });
    server.answers.set(`QUERY /conversations/${ID}/stream`, {
      status: 200,
      sse: sseOf([
        sessionStarted({ id: MAIN, depth: 1, at: 1 }),
        taskStarted({ owner: MAIN, id: 'task-1', at: 2 }),
      ]),
    });

    let written = '';

    await adapter.children?.follow({
      chat: CHAT,
      childId: 'task-1',
      columns: 80,
      write: (text) => (written += text),
      signal: new AbortController().signal,
    });

    assert.match(stripEscapes(written), /hello from the command[^]*completed/);
  });
});

test('nothing is invented for a chat the harness files do not have', async () => {
  await withAdapter(async ({ adapter }) => {
    assert.equal(await adapter.chatLabel(CHAT), '');
    assert.equal(await adapter.recap?.(CHAT, { columns: 80 }), '');
    assert.equal(await adapter.edits?.update(CHAT, { files: new Map(), cursor: undefined }), false);
  });
});

/** Where `writeHarnessChat` puts the chat's folder. */
const folderOf = (home: string) =>
  path.join(home, 'profiles', 'prof', 'workspaces', 'w', 'conversations', ID);

test('a chat the server does not have running is deleted from the harness files', async () => {
  await withAdapter(async ({ adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });
    await adapter.deleteChat?.(CHAT);

    await assert.rejects(stat(folderOf(home)), { code: 'ENOENT' });
  });
});

test("a conversation the server still holds live is closed there first, since its files are the server's to write", async () => {
  await withAdapter(async ({ server, adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });
    server.answers.set(`DELETE /conversations/${ID}`, { status: 204, body: null });

    await adapter.deleteChat?.(CHAT);

    assert.ok(server.requests.some((request) => request.method === 'DELETE'));
    await assert.rejects(stat(folderOf(home)), { code: 'ENOENT' });
  });
});

test('a server that cannot close the conversation leaves its files alone', async () => {
  await withAdapter(async ({ server, adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });
    server.answers.set(`DELETE /conversations/${ID}`, {
      status: 500,
      body: { error: { code: 'internal', message: 'the server failed' } },
    });

    await assert.rejects(adapter.deleteChat?.(CHAT) ?? Promise.resolve(), /the server failed/);
    assert.ok((await stat(folderOf(home))).isDirectory());
  });
});

test('a chat the harness files do not have cannot be deleted, and nothing else is touched', async () => {
  await withAdapter(async ({ adapter, home }) => {
    await writeHarnessChat(home, { history: HISTORY });

    await assert.rejects(
      adapter.deleteChat?.({ ...CHAT, id: OTHER }) ?? Promise.resolve(),
      /do not have it/,
    );
    assert.ok((await stat(folderOf(home))).isDirectory());
  });
});

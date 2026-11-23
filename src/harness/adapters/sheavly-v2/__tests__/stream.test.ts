import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { EditState, HarnessAdapter } from '../../../adapter.types.ts';
import { createApiClient } from '../client.ts';
import {
  AGENT,
  MAIN,
  approvalRequested,
  sessionIdle,
  sessionStarted,
  taskStarted,
  toolBatch,
} from '../testing/entries.fake.ts';
import { sseOf, startFakeServer, type FakeServer } from '../testing/sheavly-server.fake.ts';
import { CHAT, ID, WORKSPACE, listStored, withAdapter } from '../testing/with-adapter.fake.ts';
import { createWatchers, type Watchers } from '../watch.ts';

const STREAM = `QUERY /conversations/${ID}/stream`;

/** An adapter on a fake server whose chat `CHAT` is listed and whose stream says `entries`. */
async function withStream(
  entries: readonly object[] | undefined,
  run: (params: { adapter: HarnessAdapter; server: FakeServer }) => Promise<void>,
): Promise<void> {
  await withAdapter(async ({ server, adapter }) => {
    listStored(server);

    if (entries) server.answers.set(STREAM, { status: 200, sse: sseOf(entries) });

    await adapter.listChats();
    await run({ adapter, server });
  });
}

const main = sessionStarted({ id: MAIN, depth: 1, at: 1000 });

test('a chat working on its turn is running, one that asked the user something is awaiting input', async () => {
  await withStream([main], async ({ adapter }) => {
    assert.equal(await adapter.activity?.(CHAT, 0), 'running');
  });
  await withStream(
    [main, approvalRequested({ sessionId: MAIN, at: 2000 })],
    async ({ adapter }) => {
      assert.equal(await adapter.activity?.(CHAT, 0), 'awaiting_input');
    },
  );
});

test('a chat whose turn is over is idle, and what happened before its process started does not count', async () => {
  await withStream([main, sessionIdle(MAIN, 3000)], async ({ adapter }) => {
    assert.equal(await adapter.activity?.(CHAT, 0), 'idle');
  });
  await withStream([main], async ({ adapter }) => {
    assert.equal(await adapter.activity?.(CHAT, 5000), 'idle');
  });
});

test('a chat that is not running on the server has no activity and no children, and that is no error', async () => {
  await withStream(undefined, async ({ adapter }) => {
    assert.equal(await adapter.activity?.(CHAT, 0), 'idle');
    assert.deepEqual(await adapter.children?.list(CHAT, 0), []);
  });
});

test('children are the sub-agents and commands that are running, a command under the sub-agent that started it', async () => {
  const entries = [
    main,
    sessionStarted({ id: AGENT, depth: 2, at: 2000, parentId: MAIN }),
    taskStarted({ owner: AGENT, id: 'task-1', at: 3000 }),
  ];

  await withStream(entries, async ({ adapter }) => {
    assert.deepEqual(await adapter.children?.list(CHAT, 0), [
      { id: AGENT, kind: 'agent', name: 'explore', startedAt: 2000 },
      { id: 'task-1', kind: 'process', name: 'tests', startedAt: 3000, parentId: AGENT },
    ]);
  });
});

test('the files a chat changed are those its main session asked for, not a sub-agent', async () => {
  const entries = [
    main,
    sessionStarted({ id: AGENT, depth: 2, at: 1500, parentId: MAIN }),
    toolBatch({
      sessionId: MAIN,
      at: 2000,
      calls: [
        ['edit_file', { path: 'a.ts' }],
        ['read_file', { path: 'b.ts' }],
      ],
    }),
    toolBatch({
      sessionId: MAIN,
      at: 3000,
      calls: [
        ['edit_file', { path: 'a.ts' }],
        ['delete_file', { path: '/abs/c.ts' }],
      ],
    }),
    toolBatch({ sessionId: AGENT, at: 4000, calls: [['write_file', { path: 'sub.ts' }]] }),
  ];

  await withStream(entries, async ({ adapter }) => {
    const state: EditState = { files: new Map(), cursor: undefined };

    assert.equal(await adapter.edits?.update(CHAT, state), true);
    assert.deepEqual(
      [...state.files.values()].toSorted((a, b) => a.at - b.at),
      [
        { path: path.join(WORKSPACE, 'a.ts'), kind: 'edited', at: 3000, count: 2 },
        { path: '/abs/c.ts', kind: 'deleted', at: 3000, count: 1 },
      ],
    );
    assert.equal(await adapter.edits?.update(CHAT, state), false);
  });
});

/** Watchers that retry at once, on a fake server whose stream for `CHAT` says `entries`. */
async function withWatchers(
  entries: readonly object[],
  run: (params: { server: FakeServer; watchers: Watchers }) => Promise<void>,
): Promise<void> {
  const server = await startFakeServer();

  try {
    server.answers.set(STREAM, { status: 200, sse: sseOf(entries) });

    const client = createApiClient({
      find: async () => ({ url: server.url, token: server.token }),
    });

    await run({ server, watchers: createWatchers({ client, retryMs: 0 }) });
  } finally {
    await server.close();
  }
}

test('a stream that ended is opened again after the retry time, and resumes after the last entry it got', async () => {
  await withWatchers([main, sessionIdle(MAIN, 3000)], async ({ server, watchers }) => {
    const reopened = () => server.requests.filter((request) => request.path.endsWith('/stream'));

    for (let tries = 0; tries < 200 && reopened().length < 2; tries++) {
      await watchers.look(ID);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(reopened()[0]?.lastEventId, undefined);
    assert.equal(reopened()[1]?.lastEventId, '1');
    assert.equal(reopened()[0]?.body, '{"replay":true}');
  });
});

test('a stream is closed when its chat leaves the listing, and opened again when it is looked at', async () => {
  await withWatchers([main], async ({ watchers }) => {
    const first = await watchers.look(ID);

    watchers.retain([]);

    assert.notEqual(await watchers.look(ID), first);
  });
});

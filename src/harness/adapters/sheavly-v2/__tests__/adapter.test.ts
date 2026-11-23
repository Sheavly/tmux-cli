import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ID, OTHER, WORKSPACE, stored, withAdapter } from '../testing/with-adapter.fake.ts';

test('listChats maps the stored conversations the server lists', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: { conversations: [stored()] },
    });

    assert.deepEqual(await adapter.listChats(), {
      chats: [{ id: ID, workspace: WORKSPACE, startedAt: 1, updatedAt: 2, profile: 'prof' }],
      problems: [],
    });
  });
});

test('listChats reports an entry that is not what the protocol promises and lists the rest', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: {
        conversations: [
          stored({ id: 'not-an-id' }),
          stored({ id: OTHER, workspace: 'rel' }),
          stored(),
        ],
      },
    });

    const listing = await adapter.listChats();

    assert.deepEqual(
      listing.chats.map((chat) => chat.id),
      [ID],
    );
    assert.equal(listing.problems.length, 2);
  });
});

test('listChats leaves out a chat whose folder is gone, as sheavly-v1 does', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: { conversations: [stored({ workspace: '/no/such/folder/anywhere' })] },
    });

    assert.deepEqual(await adapter.listChats(), { chats: [], problems: [] });
  });
});

test('a server that cannot be listed is an error, so the sidebar keeps the chats it has', async () => {
  await withAdapter(async ({ adapter }) => {
    await assert.rejects(adapter.listChats(), /no such conversation/);
  });
});

test('chatLabel is the first prompt the user typed, since the title is always "Conversation"', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: { conversations: [stored()] },
    });
    server.answers.set(`GET /conversations/${ID}/messages`, {
      status: 200,
      body: {
        messages: [
          { role: 'user', content: 'context a hook added', at: 1 },
          { role: 'user', origin: 'user', content: 'fix\nthe   build', at: 2 },
        ],
      },
    });

    const { chats } = await adapter.listChats();

    assert.equal(await adapter.chatLabel(chats[0]!), 'fix the build');
  });
});

test('chatLabel uses the title once the server gives a real one, without reading the history', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: { conversations: [stored({ title: 'Fix the build' })] },
    });

    const { chats } = await adapter.listChats();

    assert.equal(await adapter.chatLabel(chats[0]!), 'Fix the build');
    assert.equal(server.requests.length, 1);
  });
});

test('chatLabel is empty for a stored chat that is not running, which has no history to read', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('QUERY /stored-conversations', {
      status: 200,
      body: { conversations: [stored()] },
    });

    const { chats } = await adapter.listChats();

    assert.equal(await adapter.chatLabel(chats[0]!), '');
  });
});

test('listProfiles gives the profiles of the setup by name', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set('GET /setup', {
      status: 200,
      body: { profiles: [{ id: OTHER, name: 'Work' }, { id: ID, name: 'home' }, { id: 'x' }] },
    });

    assert.deepEqual(await adapter.listProfiles?.(), [
      { id: ID, name: 'home' },
      { id: OTHER, name: 'Work' },
    ]);
  });
});

test('launch resumes a stored chat by id, starts a new one on a profile, and refuses a bad id', async () => {
  await withAdapter(async ({ adapter }) => {
    assert.deepEqual(adapter.launch({ workspace: '/w', chatId: ID }), {
      cwd: '/h',
      env: { WORKSPACE_ROOT: '/w' },
      command: `chat --resume ${ID}`,
    });
    assert.equal(
      adapter.launch({ workspace: '/w', profile: OTHER }).command,
      `chat --profile ${OTHER}`,
    );
    assert.throws(
      () => adapter.launch({ workspace: '/w', chatId: '$(rm -rf /)' }),
      /Not a conversation id/,
    );
  });
});

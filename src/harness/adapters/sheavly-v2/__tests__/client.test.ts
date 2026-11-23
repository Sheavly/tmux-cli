import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../api-error.errors.ts';
import { createApiClient } from '../client.ts';
import { startFakeServer } from '../testing/sheavly-server.fake.ts';

test('a request carries the bearer token, the method and the JSON body it was given', async () => {
  const server = await startFakeServer();

  try {
    server.answers.set('QUERY /stored-conversations', { status: 200, body: { conversations: [] } });

    const client = createApiClient({
      find: async () => ({ url: server.url, token: server.token }),
    });

    assert.deepEqual(
      await client.json({ method: 'QUERY', path: '/stored-conversations', body: { search: 'a' } }),
      { conversations: [] },
    );
    assert.deepEqual(server.requests, [
      {
        method: 'QUERY',
        path: '/stored-conversations',
        token: server.token,
        body: '{"search":"a"}',
      },
    ]);
  } finally {
    await server.close();
  }
});

test('the server is found once and the connection kept for the next requests', async () => {
  const server = await startFakeServer();

  try {
    server.answers.set('GET /setup', { status: 200, body: {} });

    let finds = 0;
    const client = createApiClient({
      find: async () => {
        finds += 1;

        return { url: server.url, token: server.token };
      },
    });

    await client.json({ method: 'GET', path: '/setup' });
    await client.json({ method: 'GET', path: '/setup' });
    assert.equal(finds, 1);
  } finally {
    await server.close();
  }
});

test('a refused token finds the server again once: it was restarted with a new token', async () => {
  const server = await startFakeServer('b'.repeat(40));

  try {
    server.answers.set('GET /setup', { status: 200, body: { ok: true } });

    const tokens = ['stale-token', server.token];
    const client = createApiClient({
      find: async () => ({ url: server.url, token: tokens.shift() ?? '' }),
    });

    assert.deepEqual(await client.json({ method: 'GET', path: '/setup' }), { ok: true });
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});

test('a server that stays unreachable fails with a message that holds no token', async () => {
  const server = await startFakeServer();
  const { url, token } = server;

  await server.close();

  const client = createApiClient({ find: async () => ({ url, token }) });

  await assert.rejects(
    client.json({ method: 'GET', path: '/setup' }),
    (caughtError: Error) =>
      caughtError.message.includes('Cannot reach the sheavly server') &&
      !caughtError.message.includes(token),
  );
});

test('an error the server answers keeps its status and its own words', async () => {
  const server = await startFakeServer();

  try {
    const client = createApiClient({
      find: async () => ({ url: server.url, token: server.token }),
    });

    await assert.rejects(
      client.json({ method: 'GET', path: '/conversations/x/messages' }),
      (caughtError) =>
        caughtError instanceof ApiError &&
        caughtError.status === 404 &&
        caughtError.message.includes('no such conversation'),
    );
  } finally {
    await server.close();
  }
});

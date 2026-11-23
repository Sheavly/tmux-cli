import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT, ID, withAdapter } from '../testing/with-adapter.fake.ts';

const MESSAGES = `GET /conversations/${ID}/messages`;
const HISTORY = [
  { role: 'user', content: 'injected context', at: 10 },
  { role: 'user', origin: 'user', content: 'fix the build', at: 20 },
  {
    role: 'assistant',
    content: 'on it',
    toolCalls: [{ id: 'c', name: 'edit_file', input: {} }],
    at: 30,
  },
  { role: 'user', origin: 'user', content: 'and the tests', at: 40 },
  { role: 'assistant', content: 'done', toolCalls: [], at: 50 },
];

test('the last prompt is the time of the last message the user typed', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set(MESSAGES, { status: 200, body: { messages: HISTORY } });

    assert.equal(await adapter.lastPromptAt?.(CHAT), 40);
  });
});

test('a chat that is not running has no history, so the time it last changed stands for its last prompt', async () => {
  await withAdapter(async ({ adapter }) => {
    assert.equal(await adapter.lastPromptAt?.({ ...CHAT, updatedAt: 77 }), 77);
  });
});

test('a running chat that has had no prompt has none, so the manager falls back to its start', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set(MESSAGES, { status: 200, body: { messages: [] } });

    assert.equal(await adapter.lastPromptAt?.(CHAT), undefined);
  });
});

test('the recap is the last messages as plain text, with what the user asked and what came of it', async () => {
  await withAdapter(async ({ server, adapter }) => {
    server.answers.set(MESSAGES, { status: 200, body: { messages: HISTORY } });

    const recap = (await adapter.recap?.(CHAT, { columns: 80 })) ?? '';

    for (const text of ['where this chat left off', 'fix the build', 'and the tests', 'done']) {
      assert.ok(recap.includes(text), text);
    }

    assert.ok(!recap.includes('injected context'));
  });
});

test('a chat that is not running has no recap: the server has no history of it', async () => {
  await withAdapter(async ({ adapter }) => {
    assert.equal(await adapter.recap?.(CHAT, { columns: 80 }), '');
  });
});

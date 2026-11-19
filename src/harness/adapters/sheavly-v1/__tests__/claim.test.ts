import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PendingChat, StoredChat } from '../../../adapter.types.ts';
import { claimNewChats } from '../claim.ts';

const pane = (paneId: string, over: Partial<PendingChat> = {}): PendingChat => ({
  paneId,
  workspace: '/w',
  startedAt: 100_000,
  ...over,
});
const chat = (id: string, over: Partial<StoredChat> = {}): StoredChat => ({
  id,
  workspace: '/w',
  startedAt: 100_500,
  updatedAt: 100_500,
  ...over,
});
const none = new Set<string>();

test('a new chat claims the earliest unclaimed conversation of its workspace after it started', () => {
  const claims = claimNewChats({
    pending: [pane('%1')],
    taken: none,
    chats: [chat('old', { startedAt: 1_000 }), chat('b', { startedAt: 101_000 }), chat('a')],
  });

  assert.deepEqual(claims, [{ paneId: '%1', chatId: 'a' }]);
});

test('two new chats in one workspace take one conversation each, oldest first', () => {
  const claims = claimNewChats({
    pending: [pane('%2', { startedAt: 200_000 }), pane('%1')],
    taken: none,
    chats: [chat('second', { startedAt: 200_100 }), chat('first')],
  });

  assert.deepEqual(claims, [
    { paneId: '%1', chatId: 'first' },
    { paneId: '%2', chatId: 'second' },
  ]);
});

test('chats started together on two profiles take their own profile’s conversation', () => {
  const claims = claimNewChats({
    pending: [pane('%1', { profile: 'azure' }), pane('%2', { profile: 'aws', startedAt: 100_100 })],
    taken: none,
    chats: [
      chat('on-aws', { profile: 'aws', startedAt: 100_400 }),
      chat('on-azure', { profile: 'azure', startedAt: 100_500 }),
    ],
  });

  assert.deepEqual(claims, [
    { paneId: '%1', chatId: 'on-azure' },
    { paneId: '%2', chatId: 'on-aws' },
  ]);
});

test('a conversation already running, another workspace, and an untimed pane claim nothing', () => {
  const claims = claimNewChats({
    pending: [pane('%2', { startedAt: 0 }), pane('%3', { workspace: '/x' })],
    taken: new Set(['a']),
    chats: [chat('a'), chat('b', { workspace: '/w', startedAt: 1 })],
  });

  assert.deepEqual(claims, []);
});

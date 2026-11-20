import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { HarnessAdapter, StoredChat } from '../../harness/adapter.types.ts';
import { loadPromptTimes } from '../prompt-times.ts';
import type { SidebarContext } from '../sidebar.types.ts';
import { buildRows, type BuildInput } from '../view.ts';

const chats: StoredChat[] = [
  { id: 'old-but-used', workspace: '/a', startedAt: 1, updatedAt: 90 },
  { id: 'new-but-idle', workspace: '/a', startedAt: 50, updatedAt: 60 },
];

const idsOf = (extra: Partial<BuildInput>): string[] =>
  buildRows({
    chats,
    labels: new Map(),
    panes: [],
    collapsed: new Set(),
    showAll: true,
    ...extra,
  }).flatMap((row) => (row.kind === 'chat' ? [row.chatId] : []));

test('chats are ordered by start unless the order is "prompted", then by last prompt', () => {
  const promptTimes = new Map([
    ['old-but-used', { at: 80, updatedAt: 90 }],
    ['new-but-idle', { at: 55, updatedAt: 60 }],
  ]);

  assert.deepEqual(idsOf({ promptTimes }), ['new-but-idle', 'old-but-used']);
  assert.deepEqual(idsOf({ order: 'started', promptTimes }), ['new-but-idle', 'old-but-used']);
  assert.deepEqual(idsOf({ order: 'prompted', promptTimes }), ['old-but-used', 'new-but-idle']);
});

test('a chat with no known prompt time is ordered by when it began', () => {
  const promptTimes = new Map([['old-but-used', { at: 10, updatedAt: 90 }]]);

  assert.deepEqual(idsOf({ order: 'prompted', promptTimes }), ['new-but-idle', 'old-but-used']);
});

async function loaderContext(params: {
  chatOrder: SidebarContext['chatOrder'];
  lastPromptAt?: HarnessAdapter['lastPromptAt'];
}): Promise<SidebarContext> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'prompt-times-'));

  return {
    chatOrder: params.chatOrder,
    adapter: { ...(params.lastPromptAt ? { lastPromptAt: params.lastPromptAt } : {}) },
    promptTimesFile: path.join(dir, 'prompt-times.json'),
    state: { chats, promptTimes: new Map(), message: '' },
  } as unknown as SidebarContext;
}

test('the histories are not read unless chats are ordered by their last prompt', async () => {
  let reads = 0;
  const lastPromptAt = () => {
    reads += 1;

    return Promise.resolve(70);
  };
  const off = await loaderContext({ chatOrder: 'started', lastPromptAt });

  await loadPromptTimes(off);

  assert.equal(reads, 0);
  assert.equal(off.state.promptTimes.size, 0);
  await assert.rejects(readFile(off.promptTimesFile));
});

test('a chat is read again only when it changed, and what was read is saved', async () => {
  let reads = 0;
  const lastPromptAt = () => {
    reads += 1;

    return Promise.resolve(70);
  };
  const ctx = await loaderContext({ chatOrder: 'prompted', lastPromptAt });

  await loadPromptTimes(ctx);
  await loadPromptTimes(ctx);

  assert.equal(reads, 2);
  assert.deepEqual(ctx.state.promptTimes.get('old-but-used'), { at: 70, updatedAt: 90 });
  assert.deepEqual(JSON.parse(await readFile(ctx.promptTimesFile, 'utf8')), {
    'old-but-used': { at: 70, updatedAt: 90 },
    'new-but-idle': { at: 70, updatedAt: 60 },
  });
});

test('a history that cannot be read keeps the time last known, and a chat without one its start', async () => {
  const lastPromptAt = (chat: StoredChat) =>
    chat.id === 'old-but-used' ? Promise.reject(new Error('gone')) : Promise.resolve(undefined);
  const ctx = await loaderContext({ chatOrder: 'prompted', lastPromptAt });

  ctx.state.promptTimes.set('old-but-used', { at: 40, updatedAt: 30 });
  await loadPromptTimes(ctx);

  assert.deepEqual(ctx.state.promptTimes.get('old-but-used'), { at: 40, updatedAt: 30 });
  assert.deepEqual(ctx.state.promptTimes.get('new-but-idle'), { at: 50, updatedAt: 60 });
});

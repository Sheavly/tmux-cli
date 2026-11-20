import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatChild, StoredChat } from '../../harness/adapter.types.ts';
import type { PaneInfo } from '../../session/panes.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { refreshChildren } from '../children-refresh.ts';

const chats: StoredChat[] = ['c1', 'c2', 'c3'].map((id) => ({
  id,
  workspace: '/a',
  startedAt: 1,
  updatedAt: 1,
}));
const child: ChatChild = { id: 't1', kind: 'process', name: 'npm test', startedAt: 50 };

/** An adapter that says every chat has the one child, and records what it was asked. */
function adapterWith(asked: [string, number][], failFor?: string) {
  return {
    children: {
      list: (chat: StoredChat, since: number) => {
        asked.push([chat.id, since]);

        return chat.id === failFor
          ? Promise.reject(new Error('unreadable'))
          : Promise.resolve([child]);
      },
      follow: () => Promise.resolve(),
    },
  };
}

const state = (panes: PaneInfo[]) => ({ chats, panes, children: new Map<string, ChatChild[]>() });
const chatPane = (chat: string, over: Partial<PaneInfo> = {}) =>
  fakePane({ id: `%${chat}`, chat, startedAt: 100, ...over });

test('only a chat that is running is asked, and for what started since its pane did', async () => {
  const asked: [string, number][] = [];
  const live = state([
    chatPane('c1'),
    chatPane('c2', { dead: true }),
    fakePane({ id: '%f', role: 'follow', chat: '' }),
  ]);

  await refreshChildren({ adapter: adapterWith(asked), state: live });

  // c2's process ended and c3 has no pane: nothing it started is running.
  assert.deepEqual(asked, [['c1', 100]]);
  assert.deepEqual([...live.children.keys()], ['c1']);
});

test('a chat that is stopped, by any means, loses its children at the next look', async () => {
  const both = state([chatPane('c1'), chatPane('c2')]);

  await refreshChildren({ adapter: adapterWith([]), state: both });
  assert.deepEqual([...both.children.keys()], ['c1', 'c2']);

  // The pane of c2 is gone (stopped with x, exited, killed).
  both.panes = [chatPane('c1')];
  await refreshChildren({ adapter: adapterWith([]), state: both });
  assert.deepEqual([...both.children.keys()], ['c1']);

  both.panes = [chatPane('c1', { dead: true })];
  await refreshChildren({ adapter: adapterWith([]), state: both });
  assert.deepEqual([...both.children.keys()], []);
});

test('a chat whose record cannot be read has none, and does not take the others with it', async () => {
  const both = state([chatPane('c1'), chatPane('c2')]);

  await refreshChildren({ adapter: adapterWith([], 'c1'), state: both });

  assert.deepEqual([...both.children.keys()], ['c2']);
});

test('an adapter that cannot tell what a chat started leaves the chats without children', async () => {
  const none = state([chatPane('c1')]);

  await refreshChildren({ adapter: {}, state: none });

  assert.equal(none.children.size, 0);
});

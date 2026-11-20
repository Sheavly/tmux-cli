import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatActivity, StoredChat } from '../../harness/adapter.types.ts';
import type { PaneInfo } from '../../session/panes.ts';
import { fakePane } from '../../testing/pane.fake.ts';
import { refreshActivity } from '../activity-refresh.ts';

const chats: StoredChat[] = ['c1', 'c2', 'c3'].map((id) => ({
  id,
  workspace: '/a',
  startedAt: 1,
  updatedAt: 1,
}));

/** An adapter that says what each chat is doing, and records what it was asked. */
function adapterWith(asked: [string, number][], said: Record<string, ChatActivity>) {
  return {
    activity: (chat: StoredChat, since: number) => {
      asked.push([chat.id, since]);

      return said[chat.id] === undefined
        ? Promise.reject(new Error('unreadable'))
        : Promise.resolve(said[chat.id] as ChatActivity);
    },
  };
}

const state = (panes: PaneInfo[]) => ({ chats, panes, activity: new Map<string, ChatActivity>() });
const chatPane = (chat: string, over: Partial<PaneInfo> = {}) =>
  fakePane({ id: `%${chat}`, chat, startedAt: 100, ...over });

test('only a chat that is running is asked, and for what happened since its pane started', async () => {
  const asked: [string, number][] = [];
  const live = state([chatPane('c1'), chatPane('c2', { dead: true })]);

  await refreshActivity({
    adapter: adapterWith(asked, { c1: 'running', c2: 'running' }),
    state: live,
  });

  // c2's process ended, which the list shows on its own, and c3 has no pane.
  assert.deepEqual(asked, [['c1', 100]]);
  assert.deepEqual([...live.activity], [['c1', 'running']]);
});

test('a chat that is stopped loses what it was doing at the next look', async () => {
  const both = state([chatPane('c1'), chatPane('c2')]);
  const said: Record<string, ChatActivity> = { c1: 'idle', c2: 'awaiting_input' };

  await refreshActivity({ adapter: adapterWith([], said), state: both });
  assert.deepEqual([...both.activity.keys()], ['c1', 'c2']);

  both.panes = [chatPane('c1')];
  await refreshActivity({ adapter: adapterWith([], said), state: both });
  assert.deepEqual([...both.activity.keys()], ['c1']);
});

test('a chat whose record cannot be read shows nothing, and does not take the others with it', async () => {
  const both = state([chatPane('c1'), chatPane('c2')]);

  await refreshActivity({ adapter: adapterWith([], { c2: 'running' }), state: both });

  assert.deepEqual([...both.activity.keys()], ['c2']);
});

test('an adapter that cannot tell what a chat is doing leaves the chats without an activity', async () => {
  const none = state([chatPane('c1')]);

  await refreshActivity({ adapter: {}, state: none });

  assert.equal(none.activity.size, 0);
});

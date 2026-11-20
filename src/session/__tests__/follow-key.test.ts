import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatOfFollow, followKey } from '../follow-panes.ts';

test('a follow tag names its chat again whatever characters the chat id has', () => {
  for (const chatId of ['c1', 'a:b:c', '100%', 'with space/slash']) {
    assert.equal(chatOfFollow(followKey({ chatId, childId: 'x:y' })), chatId);
  }
});

test('a follow tag of plain ids stays chat id, colon, child id', () => {
  assert.equal(followKey({ chatId: 'c1', childId: 't2' }), 'c1:t2');
});

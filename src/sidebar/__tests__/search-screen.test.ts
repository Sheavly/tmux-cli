import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKeyOverrides, resolveBindings } from '../../keys/bindings.ts';
import { parseKeys } from '../keys.ts';
import { handleSearch, startSearch, type SearchContext } from '../search-screen.ts';
import type { Row } from '../view.ts';

const chatRow = (id: string, label: string, workspace = '/work/app'): Row => ({
  kind: 'chat',
  key: `c:${id}`,
  workspace,
  chatId: id,
  paneId: '',
  state: 'stored',
  label,
  startedAt: 1,
  updatedAt: 1,
});
const list: Row[] = [
  { kind: 'workspace', key: 'w:/work/app', workspace: '/work/app', count: 3, collapsed: false },
  chatRow('1', 'Fix the parser'),
  chatRow('2', 'Add Search to sidebar'),
  chatRow('3', 'Write docs', '/work/site'),
];

function sidebar() {
  const { bindings } = resolveBindings({
    overrides: parseKeyOverrides({ file: 'test', value: {} }),
  });
  const ctx: SearchContext = { bindings, state: { mode: { kind: 'list' }, cursorKey: 'c:1' } };

  startSearch(ctx);

  return {
    ctx,
    press: (text: string) => {
      for (const key of parseKeys(text)) handleSearch(ctx, key, list);
    },
  };
}

test('the letters only have to appear in order, as in the file search', () => {
  const { ctx, press } = sidebar();

  press('fxpr');
  assert.equal(ctx.state.cursorKey, 'c:1');
});

test('typing moves the cursor to the best matching chat by label or folder, ignoring case', () => {
  const { ctx, press } = sidebar();

  press('search');
  assert.equal(ctx.state.cursorKey, 'c:2');

  press('\u007f'.repeat(6));
  press('site');
  assert.equal(ctx.state.cursorKey, 'c:3');
});

test('a text nothing matches leaves the cursor where the search began', () => {
  const { ctx, press } = sidebar();

  press('search');
  press('zzz');
  assert.equal(ctx.state.cursorKey, 'c:1');
});

test('Enter keeps the selected chat and leaves the search without opening it', () => {
  const { ctx, press } = sidebar();

  press('docs');
  press('\r');
  assert.equal(ctx.state.cursorKey, 'c:3');
  assert.equal(ctx.state.mode.kind, 'list');
});

test('Escape puts the cursor back where the search began', () => {
  const { ctx, press } = sidebar();

  press('docs');
  press('\u001b');
  assert.equal(ctx.state.cursorKey, 'c:1');
  assert.equal(ctx.state.mode.kind, 'list');
});

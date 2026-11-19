import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKeyOverrides, resolveBindings } from '../../keys/bindings.ts';
import { rootBindings, type KeyCommands } from '../key-bindings.ts';

const commands: KeyCommands = {
  linesCommand: 'echo lines',
  copyCommand: 'echo copy',
  escapeCommand: 'echo escape',
};
const rootFor = (value: unknown, given: KeyCommands = commands) =>
  rootBindings({
    bindings: resolveBindings({ overrides: parseKeyOverrides({ file: 'test', value }) }).bindings,
    commands: given,
  });
const keysOf = (bindings: { key: string }[]): string[] => bindings.map((binding) => binding.key);

test('with the default keys the root table has the keys it always had', () => {
  assert.deepEqual(keysOf(rootFor({})), ['M-h', 'PageUp', 'M-s', 'M-c', 'Escape', 'M-g']);
});

test('a rebound key is bound to the same command, and the old key is not bound', () => {
  const bindings = rootFor({ global: { focusSidebar: ['M-j', 'C-j'], togglePane: null } });
  const focus = bindings.filter((binding) => binding.command.join(' ') === 'select-pane -L');

  assert.deepEqual(keysOf(focus), ['M-j', 'C-j']);
  assert.ok(!keysOf(bindings).includes('M-h'));
  assert.ok(!bindings.some((binding) => binding.command.join(' ') === 'select-pane -t :.+'));
});

test('a key that passes through sends itself when it is not for us', () => {
  const [scroll] = rootFor({ global: { scrollBack: 'M-p' } }).filter(
    (binding) => binding.key === 'M-p',
  );

  assert.deepEqual(scroll?.command, [
    'if-shell',
    '-F',
    '#{alternate_on}',
    'send-keys M-p',
    'copy-mode -eu',
  ]);

  const [escape] = rootFor({ global: { chatEscape: 'C-e' } }).filter(
    (binding) => binding.key === 'C-e',
  );

  assert.equal(escape?.command.at(-1), 'send-keys C-e');
});

test('the keys that run a command of ours are bound only in a chat, and only with the command', () => {
  const bindings = rootFor({});
  const inChat = (key: string) =>
    bindings
      .find((binding) => binding.key === key)
      ?.command.slice(0, 3)
      .join(' ');

  for (const key of ['M-c', 'Escape', 'M-g']) {
    assert.equal(inChat(key), 'if-shell -F #{==:#{@sheavly_role},chat}', key);
  }

  assert.deepEqual(keysOf(rootFor({}, {})), ['M-h', 'PageUp', 'M-s', 'M-c']);
});

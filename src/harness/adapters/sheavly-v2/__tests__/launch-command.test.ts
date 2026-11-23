import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheavlyV2 } from '../index.ts';
import { chatCommand } from '../launch-command.utils.ts';

const ID = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';

test('the default command is sheavly chat, which finds the server, and not the chat program that starts a backend of its own', () => {
  const command = chatCommand(undefined);

  assert.match(command, /node apps\/sheavly\/dist\/cli\.js chat --trust$/);
  assert.ok(!command.includes('terminal/dist/chat.js'));
  assert.match(command, /^unset npm_config_local_prefix INIT_CWD; /);
});

test('the adapter resumes a chat on the server with the default command, and a command in the settings replaces it', () => {
  const adapter = sheavlyV2.create({ settings: {}, env: {}, home: '/h' });

  assert.match(
    adapter.launch({ workspace: '/w', chatId: ID }).command,
    new RegExp(`cli\\.js chat --trust --resume ${ID}$`),
  );
  assert.equal(adapter.launch({ workspace: '/w', chatId: ID }).cwd, '/h/harness');

  const custom = sheavlyV2.create({ settings: { command: 'my-chat' }, env: {}, home: '/h' });

  assert.equal(custom.launch({ workspace: '/w' }).command, 'my-chat');
});

test('a source mode is refused, since the sheavly command has no source runner', () => {
  assert.throws(() => chatCommand('dev'), /not supported by the sheavly-v2 adapter/);
  assert.throws(() => chatCommand('fast'), /"mode" must be "built" or "dev"/);
});

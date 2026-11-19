import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearPromptKeys, promptText } from '../../harness/adapters/sheavly-v1/screen.ts';
import type { Tmux } from '../../tmux/tmux.ts';
import { runEscape } from '../escape.ts';

const RULE = '─'.repeat(40);

/** A tmux that shows a fixed screen, keeps pane options and records every command. */
function fakeTmux(screen: string[]) {
  const calls: string[][] = [];
  const options = new Map<string, string>();
  const tmux: Tmux = {
    run: (args) => {
      calls.push(args);

      if (args[0] === 'capture-pane') return Promise.resolve(`${screen.join('\n')}\n`);

      if (args[0] === 'show-options') {
        return Promise.resolve(options.get(args.at(-1) as string) ?? '');
      }

      if (args[0] === 'set-option') {
        if (args[1] === '-pu') options.delete(args.at(-1) as string);
        else options.set(args.at(-2) as string, args.at(-1) as string);
      }

      return Promise.resolve('');
    },
  };

  return { tmux, calls, sent: () => calls.filter((call) => call[0] === 'send-keys') };
}

const adapter = { promptText, clearPromptKeys };

test('an empty prompt gets the Esc at once', async () => {
  const { tmux, sent } = fakeTmux(['hello', RULE, '', RULE]);

  await runEscape({
    tmux,
    pane: '%1',
    ...adapter,
    sleep: () => Promise.reject(new Error('waited')),
  });

  assert.deepEqual(sent(), [['send-keys', '-t', '%1', 'Escape']]);
});

test('a screen without an input box gets the Esc at once', async () => {
  const { tmux, sent } = fakeTmux(['just text']);

  await runEscape({ tmux, pane: '%1', ...adapter });

  assert.deepEqual(sent(), [['send-keys', '-t', '%1', 'Escape']]);
});

test('a single Esc over a typed prompt is sent after the wait', async () => {
  const { tmux, sent } = fakeTmux(['hello', RULE, 'typed', RULE]);
  let waited = 0;

  await runEscape({
    tmux,
    pane: '%1',
    ...adapter,
    now: () => 1000,
    sleep: (ms) => {
      waited = ms;

      return Promise.resolve();
    },
  });

  assert.equal(waited, 400);
  assert.deepEqual(sent(), [['send-keys', '-t', '%1', 'Escape']]);
});

test('a second Esc in time clears the prompt, and the first sends nothing', async () => {
  const { tmux, sent } = fakeTmux(['hello', RULE, 'typed', RULE]);
  let second: Promise<void> = Promise.resolve();

  await runEscape({
    tmux,
    pane: '%1',
    ...adapter,
    now: () => 1000,
    sleep: async () => {
      second = runEscape({ tmux, pane: '%1', ...adapter, now: () => 1200 });
      await second;
    },
  });

  assert.deepEqual(sent(), [['send-keys', '-t', '%1', ...clearPromptKeys('typed')]]);
});

test('a second Esc that comes too late is a first one', async () => {
  const { tmux, sent } = fakeTmux(['hello', RULE, 'typed', RULE]);

  await runEscape({
    tmux,
    pane: '%1',
    ...adapter,
    now: () => 1000,
    sleep: () => Promise.resolve(),
  });
  await runEscape({
    tmux,
    pane: '%1',
    ...adapter,
    now: () => 1500,
    sleep: () => Promise.resolve(),
  });

  assert.deepEqual(sent(), [
    ['send-keys', '-t', '%1', 'Escape'],
    ['send-keys', '-t', '%1', 'Escape'],
  ]);
});

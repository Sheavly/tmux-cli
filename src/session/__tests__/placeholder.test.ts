import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultBindings, parseKeyOverrides, resolveBindings } from '../../keys/bindings.ts';
import { placeholderCommand } from '../placeholder.ts';

const textOf = (command: string[]): string => command[2] ?? '';

test('the placeholder tells how to open and start a chat with the default keys', () => {
  const text = textOf(placeholderCommand(defaultBindings()));

  assert.match(text, /No chat open\./);
  assert.match(text, /' {2}n {9}new chat in the folder'/);
  assert.match(text, /' {2}N {9}new chat: browse for a folder'/);
  assert.match(text, /' {2}⏎ {9}open chat \/ folder'/);
});

test('the placeholder shows the keys the config set, and leaves out what it unbound', () => {
  const { bindings } = resolveBindings({
    overrides: parseKeyOverrides({
      file: 'config.json',
      value: { list: { newChat: 'c', browseFolder: null } },
    }),
  });
  const text = textOf(placeholderCommand(bindings));

  assert.match(text, /' {2}c {9}new chat in the folder'/);
  assert.doesNotMatch(text, /browse for a folder/);
  assert.doesNotMatch(text, /' {2}n /);
});

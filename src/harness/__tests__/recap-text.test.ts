import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripEscapes } from '../../terminal/ansi.ts';
import { formatRecap, formatUserMessage, frameRecap } from '../recap-text.ts';

test('nothing to recap is nothing printed', () => {
  assert.equal(formatRecap([]), '');
});

test('each message is named, tool calls are counted, and what follows is marked', () => {
  const text = stripEscapes(
    formatRecap([
      { role: 'user', text: 'fix it', toolCalls: 0 },
      { role: 'assistant', text: 'fixed', toolCalls: 1 },
      { role: 'assistant', text: '', toolCalls: 3 },
    ]),
  );

  assert.match(text, /where this chat left off/);
  assert.match(text, /you\nfix it/);
  assert.match(text, /assistant\nfixed\n· 1 tool call\n/);
  assert.match(text, /assistant\n· 3 tool calls/);
  assert.match(text, /── resuming ──\n\n$/);
});

test('a long message keeps its start if the user wrote it and its end if the assistant did', () => {
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n');
  const text = stripEscapes(
    formatRecap([
      { role: 'user', text: lines, toolCalls: 0 },
      { role: 'assistant', text: lines, toolCalls: 0 },
    ]),
  );

  assert.match(text, /you\nline 1\n[\s\S]*line 14\n… 16 more lines/);
  assert.match(text, /assistant\n… 16 more lines\nline 17\n[\s\S]*line 30/);
});

test('a prompt is marked on its first line and indented below it', () => {
  assert.equal(stripEscapes(formatUserMessage('one\ntwo')), '› one\n  two');
  assert.match(
    stripEscapes(frameRecap('body')),
    /^── where this chat left off ──\n\nbody\n\n── resuming ──\n\n$/,
  );
});

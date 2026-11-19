import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromeRows, clearPromptKeys, promptText } from '../screen.ts';

const RULE = '─'.repeat(60);
const STATUS = '● ready · some-model · mode: ask · 12% context';

test('the status line, both rules and the input between them are controls', () => {
  assert.equal(chromeRows(['hello', 'world', STATUS, RULE, '', RULE]), 4);
  assert.equal(chromeRows(['hello', STATUS, RULE, 'my prompt', RULE]), 4);
});

test('a prompt of several rows is all controls', () => {
  const rows = ['hello', 'world', STATUS, RULE, 'one', 'two', 'three', 'four', RULE];

  assert.equal(chromeRows(rows), 7);
});

test('a completion list under the box is controls too', () => {
  const rows = ['hello', STATUS, RULE, '/he', RULE, '  /help   show help', '  /history'];

  assert.equal(chromeRows(rows), 6);
});

test('a rule that carries a scroll note still counts as a rule', () => {
  const noted = `─── ↑ 3 more ${'─'.repeat(40)}`;

  assert.equal(chromeRows(['hello', STATUS, noted, 'row', RULE]), 4);
});

test('without a status line the box alone is counted, and the row above it stays conversation', () => {
  assert.equal(chromeRows(['hello', RULE, 'input', RULE]), 3);
  assert.equal(chromeRows([RULE, 'input', RULE]), 3);
  assert.equal(chromeRows(['⏺ edit_file src/a.ts', RULE, '', RULE]), 3);
});

test('a status line while working starts with a spinner, and one that wrapped is all counted', () => {
  assert.equal(chromeRows(['hello', '⠼ thinking · some-model · mode: ask', RULE, '', RULE]), 4);

  const wrapped = [
    'hello',
    '● ready · some-model · mode: allow all · 2 tasks',
    'running in background',
    RULE,
    '',
    RULE,
  ];

  assert.equal(chromeRows(wrapped), 5);
  // A blank row between conversation and box ends the look for a status.
  assert.equal(chromeRows(['● ready', '', RULE, '', RULE]), 3);
});

test('rules in the conversation above the box stay in the conversation', () => {
  const rows = ['intro', RULE, 'quoted text', RULE, 'more', STATUS, RULE, 'prompt', RULE];

  assert.equal(chromeRows(rows), 4);
});

test('a screen without a pair of rules has no controls to hide', () => {
  assert.equal(chromeRows([]), 0);
  assert.equal(chromeRows(['hello', 'world']), 0);
  assert.equal(chromeRows(['hello', RULE, 'world']), 0);
  assert.equal(chromeRows(['a line of dashes ---------------', 'b']), 0);
});

test('two rules far apart are not an input box', () => {
  const far = [RULE, ...Array.from({ length: 60 }, (_, index) => `row ${String(index)}`), RULE];

  assert.equal(chromeRows(far), 0);
});

test('promptText is what sits between the last two rules', () => {
  assert.equal(promptText(['hello', STATUS, RULE, '', RULE]), '');
  assert.equal(promptText(['hello', STATUS, RULE, '  my prompt  ', RULE]), 'my prompt');
  assert.equal(promptText([RULE, 'one', 'two', RULE, '  /help']), 'one\ntwo');
  assert.equal(promptText(['hello', 'world']), undefined);
});

test('clearPromptKeys goes to the end of the box and deletes a row more than it has', () => {
  assert.deepEqual(clearPromptKeys('one'), ['Down', 'C-e', 'C-u', 'C-u']);
  assert.deepEqual(clearPromptKeys('a\nb'), ['Down', 'Down', 'C-e', 'C-u', 'C-u', 'C-u']);
});

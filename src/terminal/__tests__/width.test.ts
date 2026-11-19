import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  displayWidth,
  fitColumns,
  sliceColumns,
  takeColumns,
  takeLastColumns,
  truncateColumns,
  withoutLastGrapheme,
} from '../width.utils.ts';

test('text is as wide as its columns, not its characters', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth(''), 0);
  // Chinese, Japanese and Korean characters take two columns each.
  assert.equal(displayWidth('日本語'), 6);
  assert.equal(displayWidth('ｱｲｳ'), 3);
  assert.equal(displayWidth('ＡＢ'), 4);
  assert.equal(displayWidth('한글'), 4);
  // Emoji take two, a letter with its accent on a separate mark takes one, and a joined sequence is one.
  assert.equal(displayWidth('🚀'), 2);
  assert.equal(displayWidth('e\u0301'), 1);
  assert.equal(displayWidth('👨‍👩‍👧'), 2);
  assert.equal(displayWidth('❤\ufe0f'), 2);
  // Characters whose width is the terminal's to say are one.
  assert.equal(displayWidth('│↑⏎…'), 4);
});

test('a slice of columns keeps whole characters and blanks what an edge cuts', () => {
  assert.equal(sliceColumns('abcdef', 2, 3), 'cde');
  assert.equal(sliceColumns('日本語', 0, 4), '日本');
  assert.equal(sliceColumns('日本語', 0, 3), '日 ');
  assert.equal(sliceColumns('日本語', 1, 4), ' 本 ');
  assert.equal(sliceColumns('a日b', 1, 2), '日');
  assert.equal(sliceColumns('e\u0301x', 0, 1), 'e\u0301');
  assert.equal(takeColumns('日本語', 4), '日本');
  assert.equal(takeLastColumns('abcdef', 3), 'def');
  assert.equal(takeLastColumns('日本語', 4), '本語');
  assert.equal(takeLastColumns('ab', 5), 'ab');
});

test('a text that is too long is cut with an ellipsis to exactly the columns, and a short one is padded', () => {
  assert.equal(truncateColumns('abcdef', 4), 'abc…');
  assert.equal(truncateColumns('abc', 4), 'abc');
  assert.equal(truncateColumns('日本語日本語', 7), '日本語…');
  // A wide character that does not fit leaves a blank, so the width is still the columns asked for.
  assert.equal(displayWidth(truncateColumns('日本語日本語', 6)), 6);
  assert.equal(fitColumns('ab', 5), 'ab   ');
  assert.equal(fitColumns('日本', 6), '日本  ');
  assert.equal(displayWidth(fitColumns('日本語日本語', 8)), 8);
  assert.equal(fitColumns('abc', 0), '');
  assert.equal(truncateColumns('abc', 0), '');
});

test('Backspace takes off one character as it is seen, not one code point', () => {
  assert.equal(withoutLastGrapheme('abc'), 'ab');
  assert.equal(withoutLastGrapheme('ae\u0301'), 'a');
  assert.equal(withoutLastGrapheme('a👨‍👩‍👧'), 'a');
  assert.equal(withoutLastGrapheme('日'), '');
  assert.equal(withoutLastGrapheme(''), '');
});

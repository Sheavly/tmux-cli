import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBackgroundReply } from '../background.ts';

test('reads the colour a terminal reports, whatever precision it uses', () => {
  assert.equal(parseBackgroundReply('\u001b]11;rgb:2828/2c2c/3434\u001b\\'), '#282c34');
  assert.equal(parseBackgroundReply('\u001b]11;rgb:28/2c/34\u0007'), '#282c34');
  assert.equal(parseBackgroundReply('\u001b]11;rgb:f/0/8\u0007'), '#ff0088');
  assert.equal(parseBackgroundReply('junk\u001b]11;rgba:ffff/ffff/ffff/ffff\u0007'), '#ffffff');
});

test('anything else is not a colour', () => {
  assert.equal(parseBackgroundReply(''), undefined);
  assert.equal(parseBackgroundReply('\u001b]10;rgb:0000/0000/0000\u0007'), undefined);
  assert.equal(parseBackgroundReply('\u001b[?62c'), undefined);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitStyled, keepStyles, reverseAll, stripEscapes, visibleLength } from '../ansi.ts';

const GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

test('stripEscapes leaves what is written on the screen', () => {
  assert.equal(
    stripEscapes(`${GREEN}green${RESET} and \u001b[1;38;2;1;2;3mmore${RESET}`),
    'green and more',
  );
  assert.equal(stripEscapes('a\u001b]8;;http://x\u0007link\u001b]8;;\u0007b'), 'alinkb');
  assert.equal(stripEscapes('no sequences'), 'no sequences');
});

test('keepStyles keeps colours and drops what could move the cursor', () => {
  assert.equal(keepStyles(`${GREEN}ok${RESET}`), `${GREEN}ok${RESET}`);
  // Cursor movement, erasing and a screen clear are not colours.
  assert.equal(keepStyles('a\u001b[2Jb\u001b[5Cc\u001b[Hd'), 'abcd');
  assert.equal(keepStyles('x\u001b]0;title\u0007y'), 'xy');
  assert.equal(keepStyles('a\tb\u0007c\r'), 'a    bc');
  assert.equal(keepStyles(`${GREEN}a\u001b[3Jb${RESET}`), `${GREEN}ab${RESET}`);
});

test('visibleLength does not count sequences', () => {
  assert.equal(visibleLength(`${GREEN}abc${RESET}de`), 5);
  assert.equal(visibleLength(''), 0);
});

test('fitStyled pads a short line and cuts a long one, always to the width', () => {
  const short = fitStyled(`${GREEN}ab${RESET}`, 6);

  assert.equal(visibleLength(short), 6);
  assert.equal(stripEscapes(short), 'ab    ');
  assert.ok(short.startsWith(GREEN));

  const long = fitStyled(`${GREEN}abcdefghij${RESET}`, 6);

  assert.equal(stripEscapes(long), 'abcde…');
  assert.equal(visibleLength(long), 6);
  // The colour is switched off before the ellipsis, so nothing after it is green.
  assert.ok(long.includes(`${RESET}…`));

  // Colours later in a line that is cut are not left half-open.
  const cut = fitStyled(`ab${GREEN}cdef${RESET}gh`, 4);

  assert.equal(stripEscapes(cut), 'abc…');
  assert.equal(fitStyled('anything', 0), '');
  assert.equal(stripEscapes(fitStyled('exact', 5)), 'exact');
});

test('reverseAll puts reverse video back on after each reset', () => {
  const out = reverseAll(`${GREEN}ab${RESET}cd`);

  assert.equal(out, `\u001b[7m${GREEN}ab${RESET}\u001b[7mcd`);
  assert.equal(stripEscapes(out), 'abcd');
});

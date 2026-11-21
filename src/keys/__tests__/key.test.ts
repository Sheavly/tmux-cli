import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromTerminal, isPrintable, keyLabel, parseKey } from '../key.ts';

const key = (text: string, grammar: 'tmux' | 'terminal' = 'tmux'): string => {
  const parsed = parseKey(text, grammar);

  if (!parsed.ok) throw new Error(parsed.reason);

  return parsed.key;
};
const refused = (text: string, grammar: 'tmux' | 'terminal' = 'tmux'): string => {
  const parsed = parseKey(text, grammar);

  return parsed.ok ? '' : parsed.reason;
};

test('keys are written the way tmux names them, and two spellings are one key', () => {
  assert.equal(key('M-h'), 'M-h');
  assert.equal(key('PageUp'), 'PageUp');
  assert.equal(key('pgup'), 'PageUp');
  assert.equal(key('PPage'), 'PageUp');
  assert.equal(key('Esc'), 'Escape');
  assert.equal(key(' '), 'Space');
  assert.equal(key('G'), 'G');
  assert.equal(key('~'), '~');
  assert.equal(key('-'), '-');
  assert.equal(key('C-a'), 'C-a');
  assert.equal(key('C-A'), 'C-a');
  assert.equal(key('dc'), 'Delete');
});

test('modifiers come out in the order M, C, S whatever the order they were written in', () => {
  assert.equal(key('S-C-Left'), 'C-S-Left');
  assert.equal(key('C-M-Up'), 'M-C-Up');
  assert.equal(key('S-M-C-Right'), 'M-C-S-Right');
});

test('a key that does not exist, or says one thing twice, is refused with the reason', () => {
  assert.match(refused(''), /empty/);
  assert.match(refused('Hyper'), /not a key name/);
  assert.match(refused('C-C-a'), /repeats a modifier/);
  assert.match(refused('S-g'), /write the character itself/);
  assert.match(refused('C-!'), /only use C- with a letter/);
  assert.match(refused('C-1', 'terminal'), /only use C- with a letter/);
  assert.match(refused(';'), /cannot be bound/);
});

test('for a terminal program only the keys it can tell apart are allowed', () => {
  assert.equal(key('C-Right', 'terminal'), 'C-Right');
  assert.equal(key('C-x', 'terminal'), 'C-x');
  assert.match(refused('C-i', 'terminal'), /Backspace, Tab or Enter/);
  assert.match(refused('C-m', 'terminal'), /Backspace, Tab or Enter/);
  assert.match(refused('F5', 'terminal'), /cannot read/);
  assert.match(refused('Home', 'terminal'), /cannot read/);
  assert.match(refused('C-Enter', 'terminal'), /does not report/);
  // tmux itself can bind them.
  assert.equal(key('F5'), 'F5');
  assert.equal(key('C-i'), 'C-i');
});

test('what a terminal program read is the same key as the config writes', () => {
  const read = (text: string) => fromTerminal(text);

  assert.equal(read('up'), 'Up');
  assert.equal(read('enter'), 'Enter');
  assert.equal(read('escape'), 'Escape');
  assert.equal(read('backspace'), 'BSpace');
  assert.equal(read('delete'), 'Delete');
  assert.equal(read('pagedown'), 'PageDown');
  assert.equal(read(' '), 'Space');
  assert.equal(read('G'), 'G');
  assert.equal(read('😀'), '😀');
  assert.equal(read('alt+f'), 'M-f');
  assert.equal(read('alt++'), 'M-+');
  assert.equal(read('ctrl+c'), 'C-c');
  assert.equal(read('ctrl+shift+left'), 'C-S-Left');
  assert.equal(read('focus'), undefined);
});

test('printable keys are the ones that type text', () => {
  assert.equal(isPrintable('a'), true);
  assert.equal(isPrintable('Space'), true);
  assert.equal(isPrintable('Enter'), false);
  assert.equal(isPrintable('M-a'), false);
});

test('labels read the way people write keys', () => {
  assert.equal(keyLabel('M-h'), 'Alt+h');
  assert.equal(keyLabel('C-S-Left'), 'Ctrl+Shift+←');
  assert.equal(keyLabel('Enter'), '⏎');
  assert.equal(keyLabel('BSpace'), '⌫');
  assert.equal(keyLabel('Escape'), 'esc');
  assert.equal(keyLabel('PageUp'), 'PageUp');
  assert.equal(keyLabel('k'), 'k');
});

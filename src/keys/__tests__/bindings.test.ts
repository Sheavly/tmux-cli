import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultBindings, parseKeyOverrides, resolveBindings } from '../bindings.ts';
import type { ActionId, Mode } from '../registry.ts';

const defaults = defaultBindings();
/** What the key does on a screen, for a key as a terminal program reads it. */
const does = (mode: Mode, key: string): ActionId | undefined => defaults.action(mode, key);

/**
 * What every key did before the keys could be changed, written out from the `switch` statements
 * that were there: these are the defaults, so they must keep doing it.
 */
test('the sidebar list keeps the keys it had', () => {
  const expected: Record<string, ActionId> = {
    Up: 'navigation.up',
    k: 'navigation.up',
    Down: 'navigation.down',
    j: 'navigation.down',
    PageUp: 'navigation.pageUp',
    PageDown: 'navigation.pageDown',
    g: 'navigation.top',
    G: 'navigation.bottom',
    Enter: 'navigation.open',
    Left: 'list.selectActive',
    Right: 'list.selectActive',
    n: 'list.newChat',
    N: 'list.browseFolder',
    p: 'list.profiles',
    P: 'list.nextProfile',
    '?': 'navigation.help',
    s: 'list.search',
    f: 'list.files',
    R: 'list.rename',
    a: 'list.showAll',
    x: 'list.stop',
    Delete: 'list.delete',
    r: 'list.redraw',
    q: 'list.detach',
    Q: 'list.quitAll',
  };

  for (const [key, action] of Object.entries(expected)) {
    assert.equal(does('list', key), action, key);
  }

  assert.equal(does('list', 'Escape'), undefined);
  assert.equal(does('list', 'z'), undefined);
});

test('the folder browser keeps the keys it had', () => {
  const expected: Record<string, ActionId> = {
    Escape: 'browser.cancel',
    q: 'browser.cancel',
    Up: 'navigation.up',
    k: 'navigation.up',
    Down: 'navigation.down',
    j: 'navigation.down',
    PageUp: 'navigation.pageUp',
    PageDown: 'navigation.pageDown',
    g: 'navigation.top',
    G: 'navigation.bottom',
    Left: 'browser.parent',
    h: 'browser.parent',
    BSpace: 'browser.parent',
    Enter: 'navigation.open',
    Right: 'browser.into',
    l: 'browser.into',
    '?': 'navigation.help',
    '~': 'browser.home',
    '.': 'browser.hidden',
    o: 'browser.newHere',
    Space: 'browser.newHere',
  };

  for (const [key, action] of Object.entries(expected)) {
    assert.equal(does('browser', key), action, key);
  }
});

test('the profile list keeps the keys it had', () => {
  const expected: Record<string, ActionId> = {
    Escape: 'profiles.close',
    q: 'profiles.close',
    p: 'profiles.close',
    Up: 'navigation.up',
    k: 'navigation.up',
    Down: 'navigation.down',
    j: 'navigation.down',
    PageUp: 'navigation.pageUp',
    PageDown: 'navigation.pageDown',
    g: 'navigation.top',
    G: 'navigation.bottom',
    Enter: 'navigation.open',
  };

  for (const [key, action] of Object.entries(expected)) {
    assert.equal(does('profiles', key), action, key);
  }

  assert.equal(does('profiles', '?'), undefined);
});

test('the file search and the rename line keep their keys, and letters are typed', () => {
  assert.equal(does('files', 'Escape'), 'text.cancel');
  assert.equal(does('files', 'Enter'), 'text.submit');
  assert.equal(does('files', 'BSpace'), 'text.erase');
  assert.equal(does('files', 'Up'), 'navigation.up');
  assert.equal(does('files', 'Down'), 'navigation.down');
  assert.equal(does('files', 'PageUp'), 'navigation.pageUp');
  assert.equal(does('files', 'PageDown'), 'navigation.pageDown');

  // j, k, g and q are text here, not commands.
  for (const letter of ['j', 'k', 'g', 'G', 'q', 'Space']) {
    assert.equal(does('files', letter), undefined);
  }

  assert.equal(does('rename', 'Escape'), 'text.cancel');
  assert.equal(does('rename', 'Enter'), 'text.submit');
  assert.equal(does('rename', 'BSpace'), 'text.erase');
  assert.equal(does('rename', 'Up'), undefined);
  assert.equal(does('rename', 'x'), undefined);
});

test('the help screen, the questions, the popup and the viewer keep their keys', () => {
  assert.equal(does('help', 'Left'), 'help.scrollLeft');
  assert.equal(does('help', 'Right'), 'help.scrollRight');
  assert.equal(does('help', 'Up'), 'help.scrollUp');
  assert.equal(does('help', 'Down'), 'help.scrollDown');
  assert.equal(does('help', 'PageUp'), 'help.pageUp');
  assert.equal(does('help', 'PageDown'), 'help.pageDown');
  // Only the arrows scroll it: k closes it, as it did.
  assert.equal(does('help', 'k'), undefined);

  assert.equal(does('confirmDelete', 'Enter'), 'confirm.delete');
  assert.equal(does('confirmDelete', 'y'), undefined);
  // Both questions are answered the same way: Enter does it, any other key says no.
  assert.equal(does('confirmQuit', 'Enter'), 'confirm.quit');
  assert.equal(does('confirmQuit', 'y'), undefined);

  assert.equal(does('popup', 'M-g'), 'global.copyLines');
  assert.equal(does('popup', 'M-s'), 'global.togglePane');
  assert.equal(does('popup', 'M-h'), undefined);
  assert.equal(does('popup', 'Enter'), 'popup.jump');
  assert.equal(does('popup', 'Escape'), 'popup.cancel');
  assert.equal(does('popup', 'BSpace'), 'popup.erase');
  assert.equal(does('popup', 'Up'), 'popup.scrollUp');
  assert.equal(does('popup', 'k'), undefined);

  const viewer: Record<string, ActionId> = {
    Escape: 'viewer.close',
    q: 'viewer.close',
    Up: 'viewer.scrollUp',
    k: 'viewer.scrollUp',
    Down: 'viewer.scrollDown',
    j: 'viewer.scrollDown',
    PageUp: 'viewer.pageUp',
    PageDown: 'viewer.pageDown',
    Space: 'viewer.pageDown',
    g: 'viewer.top',
    G: 'viewer.bottom',
    Left: 'viewer.panLeft',
    h: 'viewer.panLeft',
    Right: 'viewer.panRight',
    l: 'viewer.panRight',
    n: 'viewer.nextChange',
    p: 'viewer.previousChange',
  };

  for (const [key, action] of Object.entries(viewer)) {
    assert.equal(does('viewer', key), action, key);
  }
});

test('the tmux keys keep what they were bound to', () => {
  assert.deepEqual(defaults.keys('global.togglePane'), ['M-s']);
  assert.deepEqual(defaults.keys('global.scrollBack'), ['PageUp']);
  assert.deepEqual(defaults.keys('global.copyNewest'), ['M-c']);
  assert.deepEqual(defaults.keys('global.copyLines'), ['M-g']);
  assert.deepEqual(defaults.keys('global.chatEscape'), ['Escape']);
  assert.deepEqual(defaults.keys('copyMode.copy'), ['Enter', 'C-c']);
  assert.deepEqual(defaults.keys('copyMode.selectWordNext'), ['C-S-Right']);
  assert.equal(defaults.copyMode, true);
});

test('the defaults conflict with nothing and warn about nothing', () => {
  const { warnings } = resolveBindings();

  assert.deepEqual(warnings, []);
});

const read = (keys: unknown) => parseKeyOverrides({ file: 'config.json', value: keys });

test('the file changes the keys of an action; a list gives several, null gives none', () => {
  const { bindings } = resolveBindings({
    overrides: read({
      list: { newChat: 'M-n', stop: ['x', 'C-x'], showAll: null },
      navigation: { up: 'Up' },
    }),
  });

  assert.deepEqual(bindings.keys('list.newChat'), ['M-n']);
  assert.deepEqual(bindings.keys('list.stop'), ['x', 'C-x']);
  assert.deepEqual(bindings.keys('list.showAll'), []);
  assert.equal(bindings.action('list', 'M-n'), 'list.newChat');
  assert.equal(bindings.action('list', 'C-x'), 'list.stop');
  // The old key no longer does it, and what was not changed is as it was.
  assert.equal(bindings.action('list', 'n'), undefined);
  assert.equal(bindings.action('list', 'k'), undefined);
  assert.equal(bindings.action('list', 'Up'), 'navigation.up');
  assert.equal(bindings.action('list', 'j'), 'navigation.down');
});

test('keys are read in any spelling the grammar has', () => {
  const { bindings } = resolveBindings({
    overrides: read({ list: { newChat: 'Space' }, global: { togglePane: 'M-Tab' } }),
  });

  assert.equal(bindings.action('list', 'Space'), 'list.newChat');
  assert.deepEqual(bindings.keys('global.togglePane'), ['M-Tab']);
});

test('one key for two things on one screen is an error that says which', () => {
  assert.throws(
    () => resolveBindings({ overrides: read({ list: { newChat: 'x' } }), file: 'config.json' }),
    /config\.json: keys: "x" is bound to both list\.newChat and list\.stop \(.*in list\)/,
  );
  // Across a shared action: navigation.up and list.stop meet on the list.
  assert.throws(
    () => resolveBindings({ overrides: read({ navigation: { up: 'x' } }) }),
    /list\.stop/,
  );
});

test('the same key on screens that are never shown together is fine', () => {
  // `q` is detach in the list and close in the browser; here the list's `a` becomes `l`, the
  // browser's own.
  const { bindings } = resolveBindings({ overrides: read({ list: { showAll: 'l' } }) });

  assert.equal(bindings.action('list', 'l'), 'list.showAll');
  assert.equal(bindings.action('browser', 'l'), 'browser.into');
});

test('a plain key bound to a motion is still typed on a screen that takes text', () => {
  const { bindings } = resolveBindings({ overrides: read({ navigation: { up: ['Up', 'z'] } }) });

  assert.equal(bindings.action('list', 'z'), 'navigation.up');
  assert.equal(bindings.action('files', 'z'), undefined);
  assert.equal(bindings.action('files', 'Up'), 'navigation.up');
});

test('the text screens refuse a letter as a command, and the popup a digit', () => {
  assert.throws(() => read({ text: { submit: 'y' } }), /typed as text/);
  assert.throws(() => read({ popup: { jump: '5' } }), /typed as text/);
  assert.deepEqual(read({ text: { submit: 'C-s' } }).keys.get('text.submit'), ['C-s']);
});

test('keys that were taken off things a person needs are a warning, naming what is lost', () => {
  const { warnings } = resolveBindings({
    overrides: read({ list: { quitAll: null, detach: [] }, navigation: { open: null } }),
  });

  assert.equal(warnings.length, 3);
  assert.match(warnings.join('\n'), /list\.quitAll has no key/);
  assert.match(warnings.join('\n'), /list\.detach has no key/);
  assert.match(warnings.join('\n'), /navigation\.open has no key/);
});

test('copyMode false turns our copy-mode keys off and leaves tmux its own', () => {
  const { bindings, warnings } = resolveBindings({ overrides: read({ copyMode: false }) });

  assert.equal(bindings.copyMode, false);
  assert.deepEqual(bindings.keys('copyMode.copy'), []);
  assert.deepEqual(bindings.keys('copyMode.selectLeft'), []);
  // The keys that only enter copy mode are not part of it.
  assert.deepEqual(bindings.keys('global.copyNewest'), ['M-c']);
  assert.deepEqual(warnings, []);
});

test('copyMode can be changed action by action', () => {
  const { bindings } = resolveBindings({ overrides: read({ copyMode: { quit: ['q', 'C-q'] } }) });

  assert.deepEqual(bindings.keys('copyMode.quit'), ['q', 'C-q']);
  assert.equal(bindings.copyMode, true);
});

test('a mistake in the keys is an error that names the place', () => {
  assert.throws(() => read([]), /"keys" must be an object/);
  assert.throws(() => read({ lisst: {} }), /keys\.lisst: unknown group/);
  assert.throws(
    () => read({ list: { nwChat: 'n' } }),
    /keys\.list\.nwChat: unknown action \(one of .*newChat/,
  );
  assert.throws(() => read({ list: 'n' }), /keys\.list must be an object/);
  assert.throws(() => read({ list: false }), /keys\.list must be an object/);
  assert.throws(() => read({ list: { newChat: 5 } }), /keys\.list\.newChat must be a key/);
  assert.throws(() => read({ list: { newChat: ['n', 5] } }), /keys\.list\.newChat must be a key/);
  assert.throws(
    () => read({ list: { newChat: 'Hyper' } }),
    /keys\.list\.newChat: "Hyper" is not a key name/,
  );
  assert.throws(() => read({ list: { newChat: 'F5' } }), /keys\.list\.newChat: .*cannot read/);
  assert.throws(
    () => read({ global: { copyLines: ';' } }),
    /keys\.global\.copyLines: .*cannot be bound/,
  );
});

test('list gives every action with its keys, what it does and its default', () => {
  const { bindings } = resolveBindings({ overrides: read({ list: { newChat: 'M-n' } }) });
  const entry = bindings.list().find((action) => action.id === 'list.newChat');

  assert.deepEqual(entry?.keys, ['M-n']);
  assert.deepEqual(entry?.defaults, ['n']);
  assert.ok(entry?.description);
});

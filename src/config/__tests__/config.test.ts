import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../config.ts';

const missing = (): string => {
  throw Object.assign(new Error('no file'), { code: 'ENOENT' });
};

test('defaults when there is no config file', () => {
  const config = loadConfig({ env: {}, home: '/h', readFile: missing });

  assert.equal(config.adapter, 'sheavly-v1');
  assert.deepEqual(config.adapterSettings, {});
  assert.equal(config.socket, 'sheavly');
  assert.equal(config.sidebarWidth, 34);
});

test('the file sets the adapter, its settings and our own', () => {
  const readFile = (file: string): string => {
    assert.equal(file, '/x/sheavly-tmux/config.json');

    return JSON.stringify({
      adapter: 'other',
      harnessDir: '/from-file',
      command: 'run it',
      socket: 'other',
      sidebarWidth: 40,
    });
  };
  const config = loadConfig({ env: { XDG_CONFIG_HOME: '/x' }, home: '/h', readFile });

  assert.equal(config.adapter, 'other');
  assert.deepEqual(config.adapterSettings, { harnessDir: '/from-file', command: 'run it' });
  assert.equal(config.socket, 'other');
  assert.equal(config.sidebarWidth, 40);
});

test('a wrong config file is an error, not a silent default', () => {
  const load = (text: string) => () => loadConfig({ env: {}, home: '/h', readFile: () => text });

  assert.throws(load('{'), /not valid JSON/);
  assert.throws(load('[]'), /JSON object/);
  assert.throws(load('{"comand":"x"}'), /unknown key "comand"/);
  assert.throws(load('{"sidebarWidth":"wide"}'), /sidebarWidth/);
  assert.throws(load('{"sidebarWidth":500}'), /sidebarWidth/);
  assert.throws(load('{"acceptUnboundKeys":"yes"}'), /acceptUnboundKeys/);
  assert.throws(load('{"keys":{"list":{"newChat":"Hyper"}}}'), /config\.json: keys\.list\.newChat/);
  assert.throws(
    load('{"keys":{"list":{"newChat":"x"}}}'),
    /config\.json: keys: "x" is bound to both/,
  );
});

test('escapeTime is a whole number of milliseconds from 0 to 500, and is left to tmux unless set', () => {
  const load = (text: string) => loadConfig({ env: {}, home: '/h', readFile: () => text });

  assert.equal(loadConfig({ env: {}, home: '/h', readFile: missing }).escapeTime, undefined);
  assert.equal(load('{"escapeTime":50}').escapeTime, 50);
  assert.equal(load('{"escapeTime":0}').escapeTime, 0);
  assert.throws(
    () => load('{"escapeTime":501}'),
    /"escapeTime" must be a whole number from 0 to 500/,
  );
  assert.throws(() => load('{"escapeTime":-1}'), /escapeTime/);
  assert.throws(() => load('{"escapeTime":"slow"}'), /escapeTime/);
  // The width still has its own range.
  assert.throws(() => load('{"sidebarWidth":10}'), /from 16 to 120/);
});

test('tmux’s own keys are locked in the session unless the file says lockTmux is false', () => {
  const load = (text: string) => loadConfig({ env: {}, home: '/h', readFile: () => text });

  assert.equal(loadConfig({ env: {}, home: '/h', readFile: missing }).lockTmux, true);
  assert.equal(load('{"lockTmux":true}').lockTmux, true);
  assert.equal(load('{"lockTmux":false}').lockTmux, false);
  assert.throws(() => load('{"lockTmux":"no"}'), /"lockTmux" must be true or false/);
});

test('without a keys section the keys are the defaults and nothing needs accepting', () => {
  const config = loadConfig({ env: {}, home: '/h', readFile: missing });

  assert.deepEqual(config.keys.keys('list.newChat'), ['n']);
  assert.deepEqual(config.keyWarnings, []);
  assert.equal(config.acceptUnboundKeys, false);
});

test('the file sets keys, and says whether the warnings about them are accepted', () => {
  const text = JSON.stringify({
    keys: { list: { newChat: 'M-n', detach: null }, copyMode: false },
    acceptUnboundKeys: true,
  });
  const config = loadConfig({ env: {}, home: '/h', readFile: () => text });

  assert.deepEqual(config.keys.keys('list.newChat'), ['M-n']);
  assert.deepEqual(config.keys.keys('list.detach'), []);
  assert.equal(config.keys.copyMode, false);
  assert.equal(config.keyWarnings.length, 1);
  assert.match(config.keyWarnings[0] as string, /list\.detach/);
  assert.equal(config.acceptUnboundKeys, true);
});

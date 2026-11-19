import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hasTmux, tmuxOptions as options, wait } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';

/**
 * The real sidebar and the real viewer, each in a pane of a real tmux, with a config file that
 * rebinds keys and keys sent to them as a person would press them.
 */
const socket = `shv-e2e-${process.pid}`;
const tmux = createTmux({ socket });
const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url));
const SETTLE_MS = 400;

let home = '';
let config = '';

before(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shv-e2e-'));

  home = path.join(root, 'home');
  config = path.join(root, 'config');
  await mkdir(path.join(home, 'alpha'), { recursive: true });
  await mkdir(path.join(home, 'beta'));
  await mkdir(path.join(config, 'sheavly-tmux'), { recursive: true });
});
after(async () => {
  if (hasTmux) await tmux.run(['kill-server']).catch(() => undefined);
});

const writeConfig = (keys: object) =>
  writeFile(path.join(config, 'sheavly-tmux', 'config.json'), JSON.stringify({ socket, keys }));

/** Runs a command of ours in a small window, with the config and home folder of this test. */
async function start(
  name: string,
  command: string[],
  size: { cols: number; rows: number } = { cols: 40, rows: 40 },
): Promise<string> {
  const env = [
    `XDG_CONFIG_HOME=${config}`,
    `HOME=${home}`,
    'SHEAVLY_HOME=/nonexistent/sheavly',
    'SHEAVLY_HARNESS_DIR=/tmp',
  ];
  const id = await tmux.run([
    ...[
      'new-session',
      '-d',
      '-P',
      '-F',
      '#{pane_id}',
      '-s',
      name,
      '-x',
      String(size.cols),
      '-y',
      String(size.rows),
    ],
    ...[
      'sh',
      '-c',
      `${['env', ...env, process.execPath, cli, ...command].map(quote).join(' ')}; echo EXITED; sleep 60`,
    ],
  ]);

  return id.trim();
}

const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;
const screen = (pane: string) => tmux.run(['capture-pane', '-p', '-e', '-t', pane]);
const plain = async (pane: string) => (await screen(pane)).replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '');
const type = (pane: string, text: string) => tmux.run(['send-keys', '-t', pane, '-l', text]);
const press = (pane: string, key: string) => tmux.run(['send-keys', '-t', pane, key]);

async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;

    await wait(100);
  }

  throw new Error(`timed out waiting for ${what}`);
}

const shows = (pane: string, text: string) =>
  until(async () => (await plain(pane)).includes(text), text);
const gone = (pane: string, text: string) =>
  until(async () => !(await plain(pane)).includes(text), `${text} to go`);

/** Nothing comes of a key that is not bound: give the program time to act, then look. */
const quiet = () => wait(SETTLE_MS);

test('the sidebar answers to rebound keys and not to the old ones', options, async () => {
  await writeConfig({
    navigation: { help: 'H', down: 'J' },
    list: { browseFolder: 'B' },
    browser: { cancel: 'C' },
    global: { focusSidebar: 'M-j' },
  });

  const pane = await start('sidebar', ['sidebar']);

  // The footer names the key that is bound now.
  await shows(pane, 'H help');

  await type(pane, '?');
  await quiet();
  assert.doesNotMatch(await plain(pane), /Help/);

  await type(pane, 'H');
  await shows(pane, 'Help');

  const help = await plain(pane);

  assert.match(help, /Alt\+j +go to the sidebar/);
  assert.doesNotMatch(help, /Alt\+h/);
  assert.match(help, /^ *H +show this help/m);
  assert.match(help, /^ *B +new chat: browse/m);
  assert.doesNotMatch(help, /^ *N +new chat/m);

  // Any key but a scroll key closes it.
  await type(pane, 'z');
  await gone(pane, 'Help');

  // The old key for the folder browser does nothing, the new one opens it.
  await type(pane, 'N');
  await quiet();
  assert.doesNotMatch(await plain(pane), /alpha\//);

  await type(pane, 'B');
  await shows(pane, 'alpha/');

  // The cursor starts on `..`; the old keys to move down do nothing, the new one moves it.
  const onAlpha = async () => /\u001b\[7m[^\n]*alpha\//.test(await screen(pane));

  await type(pane, 'j');
  await press(pane, 'Down');
  await quiet();
  assert.equal(await onAlpha(), false);

  await type(pane, 'J');
  await until(onAlpha, 'the cursor on alpha/');

  // Down was moved off: it no longer moves either.
  await press(pane, 'Down');
  await quiet();
  assert.equal(await onAlpha(), true);

  // `q` closed the browser before; now only `C` does.
  await type(pane, 'q');
  await quiet();
  assert.match(await plain(pane), /alpha\//);

  await type(pane, 'C');
  await gone(pane, 'alpha/');
});

test('the sidebar with its keys as they always were', options, async () => {
  await writeConfig({});

  const pane = await start('sidebar-default', ['sidebar']);

  await shows(pane, '? help');
  await type(pane, '?');
  await shows(pane, 'Help');
  assert.match(await plain(pane), /Alt\+h +go to the sidebar/);
  await type(pane, 'z');
  await gone(pane, 'Help');

  await type(pane, 'N');
  await shows(pane, 'alpha/');
  await type(pane, 'j');

  const onAlpha = async () => /\u001b\[7m[^\n]*alpha\//.test(await screen(pane));

  await until(onAlpha, 'the cursor on alpha/');
  await type(pane, 'q');
  await gone(pane, 'alpha/');
});

test('the viewer answers to rebound keys and not to the old ones', options, async () => {
  await writeConfig({ viewer: { close: 'x', scrollDown: 's' } });

  const file = path.join(home, 'long.txt');

  await writeFile(
    file,
    Array.from({ length: 100 }, (_, index) => `row-${String(index + 1).padStart(3, '0')}`).join(
      '\n',
    ),
  );

  // Wide enough for the whole footer, and short enough that 100 rows scroll.
  const pane = await start('viewer', ['view', file], { cols: 80, rows: 12 });

  // Its footer names the keys as they are now.
  await shows(pane, 'x close');
  await shows(pane, 'row-001');

  // The old keys do nothing: `j` does not scroll and `q` does not close.
  await type(pane, 'jjj');
  await type(pane, 'q');
  await quiet();

  const before = await plain(pane);

  assert.match(before, /row-001/);
  assert.doesNotMatch(before, /EXITED/);

  await type(pane, 'sss');
  await gone(pane, 'row-001');
  await shows(pane, 'row-004');

  await type(pane, 'x');
  await shows(pane, 'EXITED');
});

test(
  'Q asks before stopping everything: Enter does it and any other key says no',
  options,
  async () => {
    await writeConfig({});

    const pane = await start('sidebar-quit', ['sidebar']);
    const serverIsGone = () =>
      tmux.run(['list-sessions']).then(
        () => false,
        () => true,
      );

    await shows(pane, '? help');
    await type(pane, 'Q');
    await shows(pane, 'Stop every chat and quit?');
    assert.match(await plain(pane), /⏎ stop all {2}any other key cancels/);

    // `y` used to say yes; now it is one more key that says no.
    await type(pane, 'y');
    await gone(pane, 'Stop every chat and quit?');
    await quiet();
    assert.equal(await serverIsGone(), false);

    await type(pane, 'Q');
    await shows(pane, 'Stop every chat and quit?');
    await press(pane, 'Enter');
    await until(async () => serverIsGone(), 'the server to stop');
  },
);

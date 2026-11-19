import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { chromeRows } from '../../harness/adapters/sheavly-v1/screen.ts';
import { copyModeBindings } from '../../session/copy-mode.ts';
import { LINES_PANE_OPTION } from '../../session/panes.ts';
import { copyBinding, linesPopup } from '../../session/key-bindings.ts';
import { hasTmux, tmuxOptions as options, wait } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import {
  copyAtNewest,
  focusSidebar,
  jumpDistance,
  jumpTo,
  lineCount,
  parseCapture,
} from '../lines.ts';

const socket = `shv-lines-${process.pid}`;
const tmux = createTmux({ socket });

after(async () => {
  if (hasTmux) await tmux.run(['kill-server']).catch(() => undefined);
});

/** A 50x8 window running a shell snippet, with the pane's id. */
async function startPane(name: string, script: string): Promise<string> {
  const id = await tmux.run([
    ...['new-session', '-d', '-P', '-F', '#{pane_id}', '-s', name, '-x', '50', '-y', '8'],
    ...['sh', '-c', script],
  ]);

  return id.trim();
}

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await check()) return;

    await wait(100);
  }

  throw new Error('timed out waiting for the pane');
}

const capture = (pane: string) =>
  tmux.run(['capture-pane', '-p', '-t', pane, '-S', '-', '-E', '-']);
const show = async (pane: string, format: string) =>
  (await tmux.run(['display-message', '-p', '-t', pane, format])).trim();

test('the newest non-blank row is line 0, and the empty screen below it is not a line', () => {
  const snapshot = parseCapture('one\ntwo\nthree\n\n\n\n');

  assert.deepEqual(snapshot.rows, ['one', 'two', 'three', '', '', '']);
  assert.equal(snapshot.blank, 3);
  assert.equal(lineCount(snapshot), 3);
  assert.deepEqual(parseCapture('\n\n').rows, ['', '']);
  assert.equal(lineCount(parseCapture('\n\n')), 0);
  assert.equal(parseCapture('a\tb\u001b[31m\n').rows[0], 'a    b');
});

test('a row keeps its colours for showing, while the plain text is what is counted', () => {
  const green = '\u001b[32m';
  const reset = '\u001b[0m';
  const snapshot = parseCapture(`one\n${green}two${reset} and more\n${green}${reset}   \n\n`);

  assert.deepEqual(snapshot.rows, ['one', 'two and more', '   ', '']);
  assert.deepEqual(snapshot.styled, [
    'one',
    `${green}two${reset} and more`,
    `${green}${reset}   `,
    '',
  ]);
  // A row of nothing but coloured spaces is as empty as any other.
  assert.equal(snapshot.blank, 2);
  // Colours are all that is kept: cursor movement and screen clearing are not.
  assert.equal(parseCapture('a\u001b[2Jb\u001b[3;4Hc\n').styled[0], 'abc');
});

test('the rows the adapter calls controls are not lines, and numbering starts above them', () => {
  const screen = 'one\ntwo\nstatus\n────\ninput\n────\n\n\n';
  const snapshot = parseCapture(screen, (rows) => 4 + (rows.length - 6));

  assert.equal(snapshot.blank, 2);
  assert.equal(snapshot.chrome, 4);
  assert.equal(lineCount(snapshot), 2);
  // Without an adapter nothing is hidden.
  assert.equal(parseCapture(screen).chrome, 0);
  // An adapter that claims more than there is cannot hide the whole screen away.
  assert.equal(parseCapture('a\nb\n', () => 99).chrome, 2);
});

test('a chat that printed more since the snapshot is jumped to further up', () => {
  const same = { total: 100, below: 3, line: 0, currentTotal: 100 };

  assert.equal(jumpDistance(same), 3);
  assert.equal(jumpDistance({ ...same, line: 5 }), 8);
  assert.equal(jumpDistance({ ...same, currentTotal: 104 }), 7);
  assert.equal(jumpDistance({ ...same, currentTotal: 90, line: 0 }), 0);
});

test(
  'jumping to a line leaves the pane in copy mode with the cursor at its start',
  options,
  async () => {
    const pane = await startPane('jump', "seq 1 100; printf 'last line\\n\\n\\n'; sleep 60");

    await until(async () => (await capture(pane)).includes('last line'));

    const snapshot = parseCapture(await capture(pane));

    assert.equal(snapshot.rows[snapshot.rows.length - 1 - snapshot.blank], 'last line');

    for (const [line, text] of [
      [0, 'last line'],
      [1, '100'],
      [3, '98'],
      [40, '61'],
    ] as const) {
      await jumpTo({ tmux, pane, snapshot, line });

      assert.equal(await show(pane, '#{pane_in_mode}'), '1');
      assert.equal(await show(pane, '#{copy_cursor_line}'), text);
      assert.equal(await show(pane, '#{copy_cursor_x}'), '0');
    }
  },
);

test(
  'line 0 is the newest conversation line above the status and the input box',
  options,
  async () => {
    // A conversation, then sheavly's controls: a status line, a rule, a two-row prompt, a rule.
    const controls =
      "printf '● ready · some-model · mode: ask\\n──────────\\nfirst prompt row\\nsecond prompt row\\n──────────\\n'";
    const pane = await startPane('chrome', `seq 1 60; ${controls}; sleep 60`);

    await until(async () => (await capture(pane)).includes('second prompt row'));

    const snapshot = parseCapture(await capture(pane), chromeRows);

    assert.equal(snapshot.chrome, 5);
    assert.equal(snapshot.rows[snapshot.rows.length - 1 - snapshot.blank - snapshot.chrome], '60');

    for (const [line, text] of [
      [0, '60'],
      [1, '59'],
      [10, '50'],
    ] as const) {
      await jumpTo({ tmux, pane, snapshot, line });

      assert.equal(await show(pane, '#{copy_cursor_line}'), text);
      assert.equal(await show(pane, '#{copy_cursor_x}'), '0');
    }
  },
);

test(
  'a line with history on both sides is scrolled to the middle of the pane',
  options,
  async () => {
    const pane = await startPane('middle', "seq 1 100; printf 'last line\\n\\n\\n'; sleep 60");

    await until(async () => (await capture(pane)).includes('last line'));

    const snapshot = parseCapture(await capture(pane));
    const height = Number(await show(pane, '#{pane_height}'));

    for (const line of [20, 50, 75]) {
      await jumpTo({ tmux, pane, snapshot, line });

      // Row 0 is the top of the pane; the middle is within one row of height / 2.
      const row = Number(await show(pane, '#{copy_cursor_y}'));

      assert.ok(Math.abs(row - height / 2) <= 1, `line ${line} is on row ${row} of ${height}`);
      assert.equal(await show(pane, '#{copy_cursor_line}'), String(101 - line));
    }
  },
);

test('a line is still found when the chat printed more after the snapshot', options, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-lines-'));
  const go = path.join(dir, 'go');
  const pane = await startPane(
    'drift',
    `seq 1 100; printf 'last line\\n\\n\\n'; while [ ! -e ${go} ]; do sleep 0.1; done; seq 201 205; sleep 60`,
  );

  await until(async () => (await capture(pane)).includes('last line'));

  const snapshot = parseCapture(await capture(pane));

  await writeFile(go, '');
  await until(async () => (await capture(pane)).includes('205'));
  await jumpTo({ tmux, pane, snapshot, line: 0 });

  assert.equal(await show(pane, '#{copy_cursor_line}'), 'last line');
});

/** Runs a copy-mode binding's command on a pane, as pressing its key would. */
async function press(
  pane: string,
  key: string,
  options: { copyToClipboard?: boolean } = {},
): Promise<void> {
  const binding = copyModeBindings(undefined, options).find((candidate) => candidate.key === key);

  if (!binding) throw new Error(`No binding for ${key}`);

  const [command, ...rest] = binding.command as [string, ...string[]];
  // A key press runs on the pane that has the keyboard. Here there is no client, and tmux runs the
  // commands inside an `if-shell` on the pane of the session made last, not on the `-t` one (so
  // with several sessions on the server a selection starts in another test's pane). Name it.
  const named = rest.map((part) => part.replaceAll('send-keys -X', `send-keys -t ${pane} -X`));

  await tmux.run([command, '-t', pane, ...named]);
}

/** Puts the pane in copy mode with the cursor at the start of its first line. */
async function copyModeAtTop(pane: string): Promise<void> {
  // The session pins this too; the cursor lands just after a word in emacs mode.
  await tmux.run(['set-option', '-g', 'mode-keys', 'emacs']);
  await tmux.run(['copy-mode', '-t', pane]);
  await tmux.run(['send-keys', '-t', pane, '-X', 'history-top']);
  await tmux.run(['send-keys', '-t', pane, '-X', 'start-of-line']);
}

test(
  'Shift+arrows select, Ctrl+arrows jump words, Enter copies, Escape clears then leaves',
  options,
  async () => {
    const pane = await startPane('keys', "printf 'alpha beta gamma\\n'; sleep 60");

    await until(async () => (await capture(pane)).includes('gamma'));
    await copyModeAtTop(pane);

    // A word jump moves to the end of the word, without selecting.
    await press(pane, 'C-Right');

    assert.equal(await show(pane, '#{copy_cursor_x}'), '5');
    assert.equal(await show(pane, '#{selection_present}'), '0');

    await tmux.run(['send-keys', '-t', pane, '-X', 'start-of-line']);

    for (let step = 0; step < 4; step++) await press(pane, 'S-Right');

    assert.equal(await show(pane, '#{selection_present}'), '1');

    // The cursor is on the last letter of "alpha": the first jump reaches the end of that word, the
    // second the end of the next.
    await press(pane, 'C-S-Right');
    await press(pane, 'C-S-Right');
    await press(pane, 'Enter');

    assert.equal(await show(pane, '#{pane_in_mode}'), '0');
    assert.equal((await tmux.run(['show-buffer'])).trim(), 'alpha beta');

    // Escape drops a selection first, and only then leaves.
    await tmux.run(['copy-mode', '-t', pane]);
    await press(pane, 'S-Right');
    await press(pane, 'Escape');

    assert.equal(await show(pane, '#{pane_in_mode}'), '1');
    assert.equal(await show(pane, '#{selection_present}'), '0');

    await press(pane, 'Escape');

    assert.equal(await show(pane, '#{pane_in_mode}'), '0');
  },
);

test(
  'with a clipboard command, copying also pipes the selection to it, for terminals without OSC 52',
  options,
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-clip-'));
    const piped = path.join(dir, 'piped');
    const pane = await startPane('clip', "printf 'alpha beta\\n'; sleep 60");

    await until(async () => (await capture(pane)).includes('beta'));
    await tmux.run(['set-option', '-s', 'copy-command', `cat > ${piped}`]);
    await copyModeAtTop(pane);

    for (let step = 0; step < 5; step++) await press(pane, 'S-Right', { copyToClipboard: true });

    await press(pane, 'Enter', { copyToClipboard: true });
    await until(async () => (await readFile(piped, 'utf8').catch(() => '')) !== '');

    // The text went to the tool and to tmux's own buffer, which is what paste uses.
    assert.equal((await readFile(piped, 'utf8')).trim(), 'alpha');
    assert.equal((await tmux.run(['show-buffer'])).trim(), 'alpha');
    assert.equal(await show(pane, '#{pane_in_mode}'), '0');
  },
);

test(
  'Alt+c enters copy mode at the newest conversation line, not at the controls',
  options,
  async () => {
    const controls =
      "printf '● ready · some-model · mode: ask\\n──────────\\nfirst prompt row\\nsecond prompt row\\n──────────\\n'";
    const pane = await startPane('copynew', `seq 1 60; ${controls}; sleep 60`);

    await until(async () => (await capture(pane)).includes('second prompt row'));
    await copyAtNewest({ tmux, pane, chromeRows });

    assert.equal(await show(pane, '#{pane_in_mode}'), '1');
    assert.equal(await show(pane, '#{copy_cursor_line}'), '60');
    assert.equal(await show(pane, '#{copy_cursor_x}'), '0');

    // A chat with nothing in it yet just gets copy mode.
    const empty = await startPane('copyempty', 'sleep 60');

    await copyAtNewest({ tmux, pane: empty, chromeRows });

    assert.equal(await show(empty, '#{pane_in_mode}'), '1');
  },
);

/**
 * Runs the real tmux on a server of its own. Only the server that starts the session gets `dir`
 * first on its PATH, so the shells it runs find the stubs there.
 */
function stubbedTmux(params: { dir: string; socket: string }) {
  const { dir, socket: own } = params;
  const real = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim();

  return (...args: string[]) =>
    execFileSync(real, ['-L', own, ...args], {
      encoding: 'utf8',
      env: args.includes('new-session')
        ? { ...process.env, PATH: `${dir}:${process.env.PATH}` }
        : process.env,
    });
}

test(
  'the Alt+c binding gives the command the pane id and falls back to plain copy mode',
  options,
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-copy-'));
    const asked = path.join(dir, 'asked');
    const fallback = path.join(dir, 'fallback');
    const script = (name: string, body: string) =>
      writeFile(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });

    // The command we are given records its arguments; `tmux` is what the fallback would call.
    await script('good', `for a in "$@"; do printf '%s\\n' "$a"; done > ${asked}`);
    await script('bad', `printf '%s\\n' "$@" > ${asked}; exit 1`);
    await script('tmux', `printf '%s\\n' "$@" > ${fallback}`);

    const run = stubbedTmux({ dir, socket: `shv-copy-${process.pid}` });
    const lines = async (file: string) =>
      (await readFile(file, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');

    try {
      run('-f', '/dev/null', 'new-session', '-d', '-x', '60', '-y', '10', '-s', 's', 'sleep 60');

      run('if-shell', '-F', '1', copyBinding(`'${dir}/good' 'a b' "#x" $HOME`));
      await until(async () => (await lines(asked)).length > 0);

      assert.deepEqual(await lines(asked), [
        'a b',
        '#x',
        '$HOME'.replace('$HOME', process.env.HOME ?? ''),
        '%0',
      ]);
      assert.deepEqual(await lines(fallback), []);

      run('if-shell', '-F', '1', copyBinding(`'${dir}/bad'`));
      await until(async () => (await lines(fallback)).length > 0);

      assert.deepEqual(await lines(fallback), ['copy-mode', '-t', '%0']);
    } finally {
      run('kill-server');
    }
  },
);

test('focusSidebar gives the keyboard to the pane tagged as the sidebar', options, async () => {
  const sidebar = await startPane('focus', 'sleep 60');
  const chat = (
    await tmux.run([
      'split-window',
      '-h',
      '-d',
      '-t',
      sidebar,
      '-P',
      '-F',
      '#{pane_id}',
      'sleep 60',
    ])
  ).trim();

  await tmux.run(['set-option', '-p', '-t', sidebar, '@sheavly_role', 'sidebar']);
  await tmux.run(['set-option', '-p', '-t', chat, '@sheavly_role', 'chat']);
  await tmux.run(['select-pane', '-t', chat]);

  assert.equal(await show(chat, '#{pane_active}'), '1');

  await focusSidebar({ tmux, pane: chat });

  assert.equal(await show(sidebar, '#{pane_active}'), '1');
  assert.equal(await show(chat, '#{pane_active}'), '0');

  // With no tag to go by, the pane to the left of the chat is the sidebar.
  await tmux.run(['set-option', '-p', '-t', sidebar, '-u', '@sheavly_role']);
  await tmux.run(['select-pane', '-t', chat]);
  await focusSidebar({ tmux, pane: chat });

  assert.equal(await show(sidebar, '#{pane_active}'), '1');
});

test(
  'the Alt+g popup covers the chat pane and passes on the command it was given, intact',
  options,
  async () => {
    // A `tmux` that only writes down what it is called with, found first by the server's shell.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-stub-'));
    const record = path.join(dir, 'args');

    await writeFile(
      path.join(dir, 'tmux'),
      `#!/bin/sh\nfor arg in "$@"; do printf '%s\\n' "$arg"; done > ${record}\n`,
      { mode: 0o755 },
    );

    const run = stubbedTmux({ dir, socket: `shv-popup-${process.pid}` });
    // Every layer of quoting has something to get wrong in this one.
    const command = `'/bin/node' 'x y' lines || { printf "\\n#{x}$HOME it's"; }`;

    try {
      run('-f', '/dev/null', 'new-session', '-d', '-x', '60', '-y', '10', '-s', 's', 'sleep 60');
      run('split-window', '-h', '-d', '-t', 's', '-l', '40', 'sleep 60');
      // The key is pressed with the chat focused, which is what the binding's formats describe.
      run('select-pane', '-t', 's:.1');
      run('if-shell', '-F', '1', linesPopup(command));

      for (let attempt = 0; attempt < 30; attempt++) {
        if (await readFile(record, 'utf8').then(Boolean, () => false)) break;

        await wait(100);
      }

      const args = (await readFile(record, 'utf8')).split('\n').slice(0, -1);
      const [left, top, width, height] = ['-x', '-y', '-w', '-h'].map(
        (flag) => args[args.indexOf(flag) + 1],
      );

      assert.equal(args[0], 'display-popup');
      // The popup is the chat pane: the right 40 columns of the window, its whole height.
      assert.deepEqual([left, top, width, height], ['20', '0', '40', '10']);
      assert.equal(args.at(-1), command);
      assert.equal(run('show-options', '-gqv', LINES_PANE_OPTION).trim(), '%1');
    } finally {
      run('kill-server');
    }
  },
);

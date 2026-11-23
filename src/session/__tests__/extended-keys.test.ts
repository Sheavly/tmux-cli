import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmuxOptions as options } from '../../testing/tmux.fake.ts';
import { createTmux } from '../../tmux/tmux.ts';
import { createSession } from '../session.ts';

// Some terminals break other keys once tmux asks for the extended form (Terminator: Enter in a
// chat), so it can be switched off; on is the default, for the keys that need it.
const tmux = createTmux({ socket: `shv-extkeys-${process.pid}` });
const size = { cols: 100, rows: 30 };
const sessionWith = (extendedKeys?: boolean) =>
  createSession({
    tmux,
    config: { sidebarWidth: 30, ...(extendedKeys === undefined ? {} : { extendedKeys }) },
    adapter: { launch: () => ({ cwd: '/tmp', env: {}, command: 'sleep 600' }) },
    sidebarCommand: ['sh', '-c', 'exec sleep 600'],
  });
const option = async (name: string) =>
  (await tmux.run(['show-options', '-sv', name]).catch(() => '')).trim();

after(async () => {
  await tmux.run(['kill-server']).catch(() => undefined);
});

test(
  'extended keys are on, and asked of the terminal, unless the config turns them off; a later start can turn them off',
  options,
  async () => {
    await sessionWith().ensure(size, {});

    assert.equal(await option('extended-keys'), 'on');
    assert.match(await option('terminal-features'), /:extkeys/);

    // Off on a later start takes back what an earlier one asked for, so a server that was
    // started with them on stops asking at once, and 24-bit colour is still told when it is had.
    await sessionWith(false).ensure(size, { truecolor: true });

    assert.equal(await option('extended-keys'), 'off');
    assert.doesNotMatch(await option('terminal-features'), /:extkeys/);
    assert.match(await option('terminal-features'), /:RGB/);

    await sessionWith(true).ensure(size, {});

    assert.equal(await option('extended-keys'), 'on');
    assert.match(await option('terminal-features'), /:extkeys/);
  },
);

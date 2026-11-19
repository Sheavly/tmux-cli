import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRemoteSession, pickClipboardCommand, supportsTruecolor } from '../capabilities.utils.ts';

test('24-bit colour is used only when the terminal says it has it', () => {
  assert.equal(supportsTruecolor({ COLORTERM: 'truecolor' }), true);
  assert.equal(supportsTruecolor({ COLORTERM: '24bit' }), true);
  assert.equal(supportsTruecolor({ COLORTERM: 'TrueColor' }), true);
  assert.equal(supportsTruecolor({ COLORTERM: 'yes' }), false);
  assert.equal(supportsTruecolor({}), false);
});

test('a session over ssh is remote, whichever variable ssh set', () => {
  assert.equal(isRemoteSession({ SSH_CONNECTION: '1.2.3.4 22 5.6.7.8 22' }), true);
  assert.equal(isRemoteSession({ SSH_TTY: '/dev/pts/3' }), true);
  assert.equal(isRemoteSession({ SSH_CLIENT: '1.2.3.4 5 22' }), true);
  assert.equal(isRemoteSession({ DISPLAY: ':0' }), false);
});

test('the clipboard command is the one for the platform and display, if it is installed', () => {
  const has =
    (...programs: string[]) =>
    (program: string) =>
      programs.includes(program);
  const pick = (
    env: Record<string, string>,
    installed: string[],
    platform = 'linux',
  ): string | undefined => pickClipboardCommand({ env, platform, exists: has(...installed) });

  assert.equal(pick({}, ['pbcopy'], 'darwin'), 'pbcopy');
  assert.equal(pick({}, [], 'darwin'), undefined);
  assert.equal(pick({ WSL_DISTRO_NAME: 'Ubuntu' }, ['clip.exe']), 'clip.exe');
  assert.equal(pick({ WAYLAND_DISPLAY: 'wayland-0' }, ['wl-copy', 'xclip']), 'wl-copy');
  assert.equal(pick({ DISPLAY: ':0' }, ['xclip', 'xsel']), 'xclip -selection clipboard');
  assert.equal(pick({ DISPLAY: ':0' }, ['xsel']), 'xsel --clipboard --input');
  // Wayland without wl-copy falls to X when there is an X display, and to nothing when there is not.
  assert.equal(
    pick({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, ['xclip']),
    'xclip -selection clipboard',
  );
  assert.equal(pick({ WAYLAND_DISPLAY: 'wayland-0' }, ['xclip']), undefined);
  // A console or a bare ssh session has no clipboard to put text on.
  assert.equal(pick({}, ['wl-copy', 'xclip']), undefined);
});

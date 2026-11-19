import { pickClipboardCommand } from '../../src/terminal/capabilities.utils.ts';
import { tmuxVersionProblem } from '../../src/tmux/tmux-version.utils.ts';

/** The package managers we know the tmux install command of, the first one found is suggested. */
const TMUX_INSTALL = [
  ['brew', 'brew install tmux'],
  ['dnf', 'sudo dnf install tmux'],
  ['apt-get', 'sudo apt install tmux'],
  ['pacman', 'sudo pacman -S tmux'],
  ['zypper', 'sudo zypper install tmux'],
  ['apk', 'sudo apk add tmux'],
];

/** How to install tmux here, for the message when it is missing or too old; never run for them. */
export function tmuxInstallHint({ has }) {
  const found = TMUX_INSTALL.find(([program]) => has(program));

  return found
    ? `Install it with: ${found[1]}`
    : 'Install tmux 3.3 or newer with your package manager.';
}

/**
 * What stops the setup before it changes anything (`problems`), and what only deserves a word
 * (`notes`). tmux is what sheavly-tmux runs in, and npm installs everything else.
 */
export function checkTools({ run, platform, has, env }) {
  const problems = [];
  const notes = [];

  if (platform === 'win32') {
    problems.push('Windows is not supported, because tmux is not: use WSL and run this inside it.');

    return { problems, notes };
  }

  if (run({ command: 'npm', args: ['--version'] }).status !== 0) {
    problems.push('npm is not installed (it comes with Node: https://nodejs.org).');
  }

  const tmux = run({ command: 'tmux', args: ['-V'] });

  if (tmux.status === 0) {
    const tooOld = tmuxVersionProblem(tmux.stdout);

    if (tooOld) problems.push(`${tooOld} ${tmuxInstallHint({ has })}`);
  } else {
    problems.push(`tmux is not installed. ${tmuxInstallHint({ has })}`);
  }

  if (!pickClipboardCommand({ env, platform, exists: has })) {
    notes.push(
      'No clipboard tool found (pbcopy, wl-copy, xclip, xsel): copying reaches the system ' +
        'clipboard only in a terminal that understands OSC 52 (docs/terminals.md).',
    );
  }

  return { problems, notes };
}

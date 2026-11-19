import { execFileSync } from 'node:child_process';

/** Whether tmux is installed: the tests that need a real one are skipped without it. */
export const hasTmux = (() => {
  try {
    execFileSync('tmux', ['-V']);

    return true;
  } catch {
    return false;
  }
})();

/** For a test that needs a real tmux: `test(name, tmuxOptions, ...)`. */
export const tmuxOptions = { skip: !hasTmux && 'tmux is not installed' };

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

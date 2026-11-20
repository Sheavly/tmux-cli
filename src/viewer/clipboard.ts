import { spawn } from 'node:child_process';
import type { Tmux } from '../tmux/tmux.ts';

/** Feeds the text to a shell command and does not wait for it: a clipboard tool may stay on to serve it. */
function pipeInto(params: { command: string; text: string }): void {
  const child = spawn('sh', ['-c', params.command], {
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: true,
  });

  // A clipboard tool that is not there is no reason to stop: the terminal's own sequence has run.
  child.on('error', () => undefined);
  child.stdin.on('error', () => undefined);
  child.stdin.end(params.text);
  child.unref();
}

/**
 * Puts text where copy mode in a chat puts it: in tmux's paste buffer, and on the clipboard through
 * the terminal (`set-clipboard`, which `-w` follows). A terminal that cannot be asked gets it from
 * the `copy-command` tmux was given at start, the same one copy mode pipes to.
 */
export async function copyToClipboard(params: { tmux: Tmux; text: string }): Promise<void> {
  const { tmux, text } = params;

  await tmux.run(['load-buffer', '-w', '-'], text);

  const command = (await tmux.run(['show-options', '-sv', 'copy-command']).catch(() => '')).trim();

  if (command) pipeInto({ command, text });
}

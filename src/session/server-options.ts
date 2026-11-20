import type { TerminalLook } from '../terminal/terminal.types.ts';
import type { Tmux } from '../tmux/tmux.ts';
import { DIVIDER_OPTION, LOADING_OPTION } from './panes.ts';

type Option = [flag: string, name: string, value: string];

/**
 * Short, so a bare Esc is not held back; but an Alt key reaches tmux as Esc and the key, and over
 * a slow connection the two can arrive further apart than this (the `escapeTime` setting raises it).
 */
const DEFAULT_ESCAPE_TIME_MS = 10;

/**
 * Sets what the server needs, on every start so a running server picks up options added since it
 * began. Server-wide, but the server is ours alone (its own socket), so nothing else is affected.
 */
export async function applyServerOptions(params: {
  tmux: Tmux;
  look: TerminalLook;
  /** How long tmux waits after an Escape for the rest of a key (milliseconds). */
  escapeTime?: number | undefined;
}): Promise<void> {
  const { tmux, look, escapeTime = DEFAULT_ESCAPE_TIME_MS } = params;
  const options: Option[] = [
    ['-g', 'remain-on-exit', 'on'],
    ['-g', 'history-limit', '50000'],
    ['-g', 'focus-events', 'on'],
    ['-g', 'allow-passthrough', 'on'],
    ['-g', 'status-style', 'bg=colour236,fg=colour250'],
    ['-g', 'status-left', ' sheavly '],
    ['-g', LOADING_OPTION, ''],
    ['-g', 'status-right', `#{${LOADING_OPTION}}`],
    ...dividerOptions(look.background),
    ['-s', 'escape-time', String(escapeTime)],
    ['-s', 'extended-keys', 'on'],
    // Copying in copy mode reaches the system clipboard through the terminal (OSC 52).
    ['-s', 'set-clipboard', 'on'],
    // Otherwise tmux picks vi or emacs keys from $EDITOR, and word jumps land differently.
    ['-g', 'mode-keys', 'emacs'],
  ];

  for (const [flag, name, value] of options) {
    await tmux.run(['set-option', flag, name, value]);
  }

  // The viewer picks a light or dark colour theme from this.
  if (look.background) {
    await tmux.run(['set-option', '-g', '@sheavly_background', look.background]);
  }

  await applyColour({ tmux, truecolor: look.truecolor === true });
  await applyClipboardCommand({ tmux, command: look.clipboardCommand });
}

/**
 * The viewer's colours are 24-bit, which tmux passes on only to a terminal it is told has them; a
 * terminal that does not (macOS Terminal.app) shows them wrong, so it is told only when the
 * terminal said so, and otherwise tmux uses the nearest of 256.
 */
async function applyColour(params: { tmux: Tmux; truecolor: boolean }): Promise<void> {
  const { tmux, truecolor } = params;

  if (!truecolor) return;

  const features = await tmux.run(['show-options', '-sv', 'terminal-features']);

  if (!features.includes(':RGB')) {
    await tmux.run(['set-option', '-sa', 'terminal-features', '*:RGB']);
  }
}

/**
 * What copy mode copies with, besides the terminal's own clipboard sequence (OSC 52), which not
 * every terminal understands. Without a command the option is cleared, so one from an earlier
 * start in another terminal does not stay.
 */
async function applyClipboardCommand(params: {
  tmux: Tmux;
  command: string | undefined;
}): Promise<void> {
  const { tmux, command } = params;

  if (command) await tmux.run(['set-option', '-s', 'copy-command', command]);
  else await tmux.run(['set-option', '-su', 'copy-command']);
}

/**
 * With the terminal's background colour known, tmux's divider is drawn in it, so the column
 * disappears and becomes the chat's left gap; the sidebar then draws the visible line itself, one
 * column in from the edge, which makes the gap on its side. Without it, tmux's own line stays.
 */
function dividerOptions(background: string | undefined): Option[] {
  if (!background) {
    return [
      ['-g', 'pane-border-style', 'fg=colour240'],
      ['-g', 'pane-active-border-style', 'fg=colour72'],
      ['-g', DIVIDER_OPTION, 'tmux'],
    ];
  }

  return [
    ['-g', 'pane-border-style', `fg=${background}`],
    ['-g', 'pane-active-border-style', `fg=${background}`],
    ['-g', DIVIDER_OPTION, 'own'],
  ];
}

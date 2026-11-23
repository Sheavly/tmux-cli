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
  /** Whether tmux reads keys in the extended form (the default); see `applyExtendedKeys`. */
  extendedKeys?: boolean | undefined;
}): Promise<void> {
  const { tmux, look, escapeTime = DEFAULT_ESCAPE_TIME_MS, extendedKeys = true } = params;
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
    ['-s', 'extended-keys', extendedKeys ? 'on' : 'off'],
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

  await applyExtendedKeys({ tmux, on: extendedKeys });
  await applyColour({ tmux, truecolor: look.truecolor === true });
  await applyClipboardCommand({ tmux, command: look.clipboardCommand });
}

/**
 * `extended-keys on` only lets tmux read keys a terminal reports in the extended form; whether
 * tmux asks the terminal to report them is a terminal feature, which tmux knows for few terminals.
 * Without it a key such as Ctrl+Alt+2 arrives as nothing tmux can tell from other keys.
 *
 * Some terminals break other keys once tmux asks: in Terminator, Enter did nothing in a chat of
 * the current harness, whose input asks for the extended form too, and went back to working with
 * this off. `extendedKeys: false` in the config is for them. The feature is taken off again, so a
 * server that was started with it on does not keep asking; the colour feature, which shares the
 * option, is put back after.
 */
async function applyExtendedKeys(params: { tmux: Tmux; on: boolean }): Promise<void> {
  const { tmux, on } = params;

  if (!on) {
    await tmux.run(['set-option', '-su', 'terminal-features']);

    return;
  }

  const features = await tmux.run(['show-options', '-sv', 'terminal-features']);

  if (!features.includes(':extkeys')) {
    await tmux.run(['set-option', '-sa', 'terminal-features', '*:extkeys']);
  }
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

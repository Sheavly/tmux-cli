import type { Bindings } from '../keys/bindings.ts';
import type { ActionId } from '../keys/registry.ts';
import { shellQuote, type Tmux } from '../tmux/tmux.ts';
import { COPY_TABLES, copyModeBindings } from './copy-mode.ts';
import { LINES_PANE_OPTION, MAIN_SESSION } from './panes.ts';

/** The server option that lists the keys the last start bound, as `table:key` and a space. */
const BOUND_OPTION = '@sheavly_bound_keys';
const ROOT_TABLE = 'root';
/**
 * What starts before the list was kept bound, and `M-f` and `M-h`, which were bound once and then
 * given up: a running server may still have them.
 */
const LEGACY_BOUND = ['M-h', 'M-s', 'M-c', 'M-g', 'M-f', 'PageUp', 'Escape'].map(
  (key) => `${ROOT_TABLE}:${key}`,
);

/** The shell commands behind the keys that run one; a key without its command is not bound. */
export type KeyCommands = {
  /** Shows the numbered chat lines (the popup); without it, no key. */
  linesCommand?: string | undefined;
  /** Enters copy mode at the newest line; without it, plain copy mode. */
  copyCommand?: string | undefined;
  /** Handles Esc in a chat; without it Esc is not bound and goes to the chat as it is. */
  escapeCommand?: string | undefined;
};

/** A key of tmux's root table, outside any mode, and the tmux command it runs. */
export type RootBinding = { key: string; command: string[] };

/**
 * Binds our keys. The server outlives any one start and the keys may have changed since the last,
 * so what the last start bound is unbound first (it is written down in a server option); a key
 * that moved would otherwise go on doing its old job.
 *
 * In copy mode that also drops tmux's own binding of such a key (Enter, Escape and q have one),
 * which stays gone until the server restarts, with `stop` and a start.
 */
export async function applyBindings(params: {
  tmux: Tmux;
  bindings: Bindings;
  commands: KeyCommands;
  /** Copying also pipes the text to tmux's `copy-command` (see `copyModeBindings`). */
  copyToClipboard?: boolean;
}): Promise<void> {
  const { tmux, bindings, commands, copyToClipboard = false } = params;

  await unbindStale(tmux);

  const bound: string[] = [];

  for (const { key, command } of rootBindings({ bindings, commands })) {
    await tmux.run(['bind-key', '-n', key, ...command]);
    bound.push(`${ROOT_TABLE}:${key}`);
  }

  for (const table of COPY_TABLES) {
    for (const { key, command } of copyModeBindings(bindings, { copyToClipboard })) {
      await tmux.run(['bind-key', '-T', table, key, ...command]);
      bound.push(`${table}:${key}`);
    }
  }

  await tmux.run(['set-option', '-g', BOUND_OPTION, bound.join(' ')]);
  await tmux.run(['set-hook', '-g', 'pane-mode-changed', SIDEBAR_LEAVES_MODE]);
}

/**
 * The sidebar has no use for a tmux mode, so whatever way one was entered (a key, the mouse, a
 * command) it is left at once: a backstop for the bindings above that already keep it out.
 */
const SIDEBAR_LEAVES_MODE = [
  'if-shell -F "#{&&:#{pane_in_mode},#{==:#{@sheavly_role},sidebar}}"',
  '"send-keys -t #{hook_pane} -X cancel"',
].join(' ');

async function unbindStale(tmux: Tmux): Promise<void> {
  const recorded = (await tmux.run(['show-options', '-gqv', BOUND_OPTION])).trim();
  const stale = recorded === '' ? LEGACY_BOUND : recorded.split(/\s+/);

  for (const entry of stale) {
    const split = entry.indexOf(':');
    const table = entry.slice(0, split);
    const key = entry.slice(split + 1);

    // A key that is not bound is nothing to undo.
    await tmux
      .run(['unbind-key', ...(table === ROOT_TABLE ? ['-n'] : ['-T', table]), key])
      .catch(() => undefined);
  }
}

/** Only in a chat: the sidebar and the files list have no chat lines to number, and elsewhere the key goes to the pane as it would without a binding. */
const IN_CHAT = ['if-shell', '-F', '#{==:#{@sheavly_role},chat}'];

/** What each key of the root table runs, from the keys in use: nothing for an action with no command. */
export function rootBindings(params: { bindings: Bindings; commands: KeyCommands }): RootBinding[] {
  const { bindings, commands } = params;
  const entries: [ActionId, (key: string) => string[] | undefined][] = [
    // PageUp scrolls the chat's history, the way the mouse wheel does: it enters tmux's copy mode,
    // where PageDown scrolls back and leaving the bottom ends it. A program on the alternate
    // screen (the sidebar, an editor) has no history to scroll and gets the key itself.
    [
      'global.scrollBack',
      (key) => [
        ...['if-shell', '-F', '#{||:#{alternate_on},#{==:#{@sheavly_role},sidebar}}'],
        ...[`send-keys ${key}`, 'copy-mode -eu'],
      ],
    ],
    // A way out that does not depend on the sidebar process, which holds the `q` key and may be
    // dead.
    ['global.detach', () => ['detach-client', '-s', MAIN_SESSION]],
    // Two panes, so the next one is always the other.
    ['global.togglePane', () => ['select-pane', '-t', ':.+']],
    // Straight into copy mode at the newest line, for when there is no need to go to a numbered
    // one first.
    [
      'global.copyNewest',
      () => [...IN_CHAT, commands.copyCommand ? copyBinding(commands.copyCommand) : 'copy-mode'],
    ],
    [
      'global.chatEscape',
      (key) =>
        commands.escapeCommand
          ? [...IN_CHAT, escapeBinding(commands.escapeCommand), `send-keys ${key}`]
          : undefined,
    ],
    [
      'global.copyLines',
      () => (commands.linesCommand ? [...IN_CHAT, linesPopup(commands.linesCommand)] : undefined),
    ],
  ];

  return entries.flatMap(([action, build]) =>
    bindings.keys(action).flatMap((key) => {
      const command = build(key);

      return command ? [{ key, command }] : [];
    }),
  );
}

/**
 * What Alt+c runs: the command gets the pane that has the keyboard (tmux expands its id into the
 * shell command) and plain copy mode is the fallback if it fails, so the key never does nothing.
 */
export function copyBinding(command: string): string {
  const shell = `${command.replaceAll('#', '##')} #{pane_id} || tmux copy-mode -t #{pane_id}`;

  return `run-shell -b "${shell.replace(/[\\"$]/g, '\\$&')}"`;
}

/**
 * What Esc runs in a chat: the command gets the pane that has the keyboard. It runs in the
 * background because it may wait for a second Esc, and that second press has to be handled while
 * the first is still waiting. The command sends the Esc on itself when it is not a double one.
 */
function escapeBinding(command: string): string {
  const shell = `${command.replaceAll('#', '##')} #{pane_id}`;

  return `run-shell -b "${shell.replace(/[\\"$]/g, '\\$&')}"`;
}

/**
 * What Alt+g runs: it records which pane has the keyboard (the popup cannot ask, since while it is
 * open the popup is what has it), then opens the numbered lines over that pane and nothing else.
 *
 * A popup's size cannot be a format, only a number, so a shell command is what gets the numbers:
 * `run-shell` expands the pane's position and size into it before it runs `display-popup`.
 */
export function linesPopup(command: string): string {
  // The command goes through the tmux parser, a format expansion and then `sh`: each needs its own
  // quoting, innermost first.
  const forShell = shellQuote(command.replaceAll('#', '##'));
  const popup = [
    `tmux display-popup -c '#{client_name}' -E -B`,
    `-x #{pane_left} -y #{pane_top} -w #{pane_width} -h #{pane_height}`,
    forShell,
  ].join(' ');
  const forTmux = `"${popup.replace(/[\\"$]/g, '\\$&')}"`;

  return [`set-option -gF ${LINES_PANE_OPTION} '#{pane_id}'`, `run-shell -b ${forTmux}`].join(
    ' ; ',
  );
}

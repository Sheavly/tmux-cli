import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import type { ActionId } from '../keys/registry.ts';

/** A key in one of tmux's copy-mode key tables, the tmux command it runs and the action it is. */
export type CopyBinding = { key: string; command: string[]; action: ActionId };

/** Both tables, because which one is in use depends on the user's `$EDITOR`. */
export const COPY_TABLES = ['copy-mode', 'copy-mode-vi'];

/**
 * Starts a selection where the cursor is when there is none, then moves: the way Shift plus an
 * arrow key selects in an editor. With a selection already there it just moves, which extends it.
 */
function select(move: string): string[] {
  return [
    ...['if-shell', '-F', '#{selection_present}'],
    `send-keys -X ${move}`,
    `send-keys -X begin-selection ; send-keys -X ${move}`,
  ];
}

const send = (action: string): string[] => ['send-keys', '-X', action];

/**
 * The keys for moving around and copying in copy mode with the keyboard alone:
 * Shift+arrows select, Ctrl+Left/Right jump a word (with Shift they select one), Enter and Ctrl+C
 * copy and leave, Escape first drops a selection and then leaves, `q` leaves.
 *
 * With `copyToClipboard`, copying also pipes the text to tmux's `copy-command` (the system clipboard
 * tool found at start), for a terminal that does not understand the clipboard sequence.
 */
export function copyModeBindings(
  bindings: Bindings = defaultBindings(),
  options: { copyToClipboard?: boolean } = {},
): CopyBinding[] {
  const copy = options.copyToClipboard ? 'copy-pipe-and-cancel' : 'copy-selection-and-cancel';
  const commands: [ActionId, string[]][] = [
    ['copyMode.selectLeft', select('cursor-left')],
    ['copyMode.selectRight', select('cursor-right')],
    ['copyMode.selectUp', select('cursor-up')],
    ['copyMode.selectDown', select('cursor-down')],
    ['copyMode.wordPrevious', send('previous-word')],
    ['copyMode.wordNext', send('next-word-end')],
    ['copyMode.selectWordPrevious', select('previous-word')],
    ['copyMode.selectWordNext', select('next-word-end')],
    ['copyMode.copy', send(copy)],
    [
      'copyMode.escape',
      [
        ...['if-shell', '-F', '#{selection_present}'],
        'send-keys -X clear-selection',
        'send-keys -X cancel',
      ],
    ],
    ['copyMode.quit', send('cancel')],
  ];

  // An action turned off, or all of them with `"copyMode": false`, has no keys and so no binding.
  return commands.flatMap(([action, command]) =>
    bindings.keys(action).map((key) => ({ key, command, action })),
  );
}

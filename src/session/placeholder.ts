import type { Bindings } from '../keys/bindings.ts';
import { keyLabel } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { displayWidth } from '../terminal/width.utils.ts';
import { shellQuote } from '../tmux/tmux.ts';

/** Width of the column the keys are written in. */
const KEY_COLUMN = 10;

/** What the placeholder offers, in order; an action with no key is left out. */
const SHOWN: ActionId[] = [
  'navigation.open',
  'list.newChat',
  'list.browseFolder',
  'list.search',
  'navigation.help',
  'global.togglePane',
];

/** One line: the action's keys as they are bound now, then what it does. Nothing without a key. */
function actionLine(bindings: Bindings, id: ActionId): string[] {
  const action = bindings.list().find((candidate) => candidate.id === id);
  const keys = bindings.keys(id).map(keyLabel).join(' ');

  if (!action || keys === '') return [];

  const gap = ' '.repeat(Math.max(1, KEY_COLUMN - displayWidth(keys)));

  return [`  ${keys}${gap}${action.description}`];
}

/**
 * Nothing in the pane reads its input, so the terminal driver would print what is typed there
 * (echo), and turn Ctrl+C into a signal that ends the process and leaves a dead pane. Both are
 * switched off, and the cursor is hidden: this pane is text to read, not a place to type.
 */
const QUIET = "stty -echo -isig 2>/dev/null; printf '\\033[?25l'";

/**
 * The command that fills the pane beside the sidebar while no chat is on screen: what to press to
 * open or start one. The keys are read from the bindings, so a key the config changed is the one
 * shown here, and one it removed is not.
 */
export function placeholderCommand(bindings: Bindings): string[] {
  const lines = ['', '  No chat open.', '', ...SHOWN.flatMap((id) => actionLine(bindings, id))];
  const text = lines.map(shellQuote).join(' ');

  return ['sh', '-c', `${QUIET}; printf '%s\\n' ${text}; exec tail -f /dev/null`];
}

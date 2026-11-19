import type { Bindings } from '../keys/bindings.ts';
import { keyLabel } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';

/** Width of the column the keys are written in. */
const KEY_COLUMN = 12;

/** What one help screen can show: a line per action, only those that have a key. */
export type HelpOptions = {
  bindings: Bindings;
  /** What the harness adapter offers; the keys for the rest are left out. */
  profiles: boolean;
  deleting: boolean;
  files: boolean;
  /** Whether Esc in a chat is bound (it needs the adapter to read the prompt). */
  chatEscape: boolean;
};

/** The first key of an action as a person reads it, or nothing when it has none. */
export function hintKey(bindings: Bindings, id: ActionId): string {
  const [key] = bindings.keys(id);

  return key ? keyLabel(key) : '';
}

/** `keys text` for each part that has a key; what the footers say. */
export function hints(bindings: Bindings, parts: [ActionId[], string][]): string {
  return parts
    .map(([ids, text]) => [ids.map((id) => hintKey(bindings, id)).join(''), text] as const)
    .filter(([keys]) => keys !== '')
    .map(([keys, text]) => `${keys} ${text}`)
    .join('  ');
}

/** What a question says it takes: its key does the thing, and any other key says no. */
function confirmHint(params: { bindings: Bindings; action: ActionId; does: string }): string {
  const { bindings, action, does } = params;

  return `${hints(bindings, [[[action], does]])}  any other key cancels`.trim();
}

/** The hints in the footer that name keys, for each screen; the rest of a footer is not about keys. */
export const footerHints = {
  /** What can be done with a name being typed. */
  rename: (bindings: Bindings): string =>
    hints(bindings, [
      [['text.submit'], 'save'],
      [['text.cancel'], 'cancel'],
    ]),
  /** What can be done in the file search: the Escape clears what was typed, and then goes back. */
  files: (bindings: Bindings, params: { typed: boolean }): string =>
    hints(bindings, [
      [['text.submit'], 'view'],
      [['text.cancel'], params.typed ? 'clear' : 'back'],
    ]),
  profiles: (bindings: Bindings): string =>
    hints(bindings, [
      [['navigation.open'], 'switch'],
      [['profiles.close'], 'cancel'],
    ]),
  confirmDelete: (bindings: Bindings): string =>
    confirmHint({ bindings, action: 'confirm.delete', does: 'delete' }),
  /** The question after `Q`: its key stops everything and any other key says no. */
  confirmQuit: (bindings: Bindings): string =>
    confirmHint({ bindings, action: 'confirm.quit', does: 'stop all' }),
  /** The line under the chat list that says where the help is. */
  list: (bindings: Bindings): string => hints(bindings, [[['navigation.help'], 'help']]),
  /** The help screen's own footer: which of its scroll keys do something now. */
  help: (bindings: Bindings, params: { horizontal: boolean; vertical: boolean }): string => {
    const scrolls = [
      params.horizontal
        ? `${hintKey(bindings, 'help.scrollLeft')}${hintKey(bindings, 'help.scrollRight')}`
        : '',
      params.vertical
        ? `${hintKey(bindings, 'help.scrollUp')}${hintKey(bindings, 'help.scrollDown')}`
        : '',
    ];
    const keys = scrolls.filter((text) => text !== '').join(' ');

    return keys === '' ? 'any key: back' : `${keys} scroll  other key: back`;
  },
};

/** A help line: the keys of these actions, then what they do. Nothing when there is no key. */
function line(bindings: Bindings, ids: ActionId[], description: string): string[] {
  const keys = ids.flatMap((id) => bindings.keys(id)).map(keyLabel);

  if (keys.length === 0) return [];

  const text = keys.join(' ');

  return [
    text.length < KEY_COLUMN
      ? `${text.padEnd(KEY_COLUMN)}${description}`
      : `${text} ${description}`,
  ];
}

function describe(bindings: Bindings, id: ActionId): string[] {
  const found = bindings.list().find((action) => action.id === id);

  return found ? line(bindings, [id], found.description) : [];
}

export function listHelp(options: HelpOptions): string[] {
  const { bindings } = options;
  const some = (ids: ActionId[]): string[] => ids.flatMap((id) => describe(bindings, id));

  return [
    ...['Chats', ''],
    ...some([
      'navigation.up',
      'navigation.down',
      'navigation.top',
      'navigation.bottom',
      'navigation.open',
      'list.newChat',
      'list.browseFolder',
    ]),
    ...(options.profiles ? some(['list.profiles']) : []),
    ...some(['list.rename', 'list.stop']),
    ...(options.deleting ? some(['list.delete']) : []),
    ...some(['list.showAll', 'list.redraw', 'list.detach', 'list.quitAll']),
    ...(options.files ? some(['list.files']) : []),
    ...some(['navigation.help', 'global.focusSidebar', 'global.togglePane']),
    ...chatHelp(options),
  ];
}

function chatHelp(options: HelpOptions): string[] {
  const { bindings } = options;
  const some = (ids: ActionId[]): string[] => ids.flatMap((id) => describe(bindings, id));
  const copying = bindings.copyMode
    ? [
        '',
        'In copy mode',
        ...some([
          'copyMode.wordPrevious',
          'copyMode.wordNext',
          'copyMode.selectLeft',
          'copyMode.selectWordPrevious',
          'copyMode.copy',
          'copyMode.escape',
          'copyMode.quit',
        ]),
      ]
    : [];

  return [
    ...['', 'In the chat'],
    ...some(['global.scrollBack', 'global.copyNewest', 'global.copyLines']),
    ...(options.chatEscape ? some(['global.chatEscape']) : []),
    ...copying,
  ];
}

export function browserHelp(bindings: Bindings): string[] {
  const some = (ids: ActionId[]): string[] => ids.flatMap((id) => describe(bindings, id));

  return [
    ...['Choose a folder', ''],
    ...some(['navigation.up', 'navigation.down']),
    ...line(bindings, ['navigation.open', 'browser.into'], 'go into the folder'),
    ...some([
      'browser.parent',
      'browser.newHere',
      'browser.home',
      'browser.hidden',
      'browser.cancel',
    ]),
  ];
}
